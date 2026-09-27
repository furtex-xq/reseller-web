-- ============================================================================
-- Reseller · отзывы покупателей
--
-- Выполнять в SQL Editor после 0001 и 0003. Существующие таблицы не трогает.
--
-- Откуда берутся: расширение читает страницу отзывов продавца на FunPay.
-- Что там есть на самом деле (проверено на живом профиле):
--
--   оценка   — классом ratingN, N от 1 до 5
--   текст    — есть
--   ответ    — есть, если продавец отвечал
--   деталь   — строкой вида «PUBG Mobile, 100 ₽»
--   дата     — ТОЛЬКО примерная: «9 месяцев назад», точной в разметке нет
--   автор    — в публичном виде отсутствует, только аватарка-заглушка
--
-- Отсюда два решения в схеме.
--
-- Первое: даты две. `approx_at` — прикидка из «9 месяцев назад», по ней нельзя
-- строить выручку по дням, и она честно названа приблизительной. `seen_at` —
-- когда мы этот отзыв впервые увидели; она точная и годится, чтобы отличать
-- новые отзывы от старых.
--
-- Второе: своего идентификатора у отзыва нет, поэтому опознаём по отпечатку —
-- оценка, текст и деталь вместе. Совпадение двух разных отзывов по всем трём
-- полям возможно («спасибо», 5, одна игра, одна цена), и тогда второй просто
-- не запишется. Это лучше, чем плодить дубли при каждой сверке.
-- ============================================================================

create table if not exists reviews (
  id           uuid        primary key default gen_random_uuid(),
  account_id   uuid        not null references accounts(id) on delete cascade,
  -- Заполняется, если удалось связать отзыв с заказом. Связь необязательна:
  -- в публичном виде номера заказа у отзыва нет.
  order_id     uuid        references orders(id) on delete set null,
  external_id  text,                            -- номер заказа, если известен

  rating       int         not null check (rating between 1 and 5),
  body         text        not null default '',  -- текст покупателя
  reply        text,                             -- ответ продавца
  detail       text,                             -- «PUBG Mobile, 100 ₽» как есть
  game         text,                             -- разобрано из detail
  amount       numeric(12,2),
  currency     text        not null default 'RUB',

  approx_at    timestamptz,                      -- прикидка из «9 месяцев назад»
  seen_at      timestamptz not null default now(),

  -- Отпечаток вместо id: у отзыва на FunPay своего номера нет.
  fingerprint  text        not null,
  unique (account_id, fingerprint)
);

create index if not exists reviews_account_seen on reviews (account_id, seen_at desc);
create index if not exists reviews_rating on reviews (rating);
create index if not exists reviews_order on reviews (order_id);

alter table reviews enable row level security;

do $$
begin
  -- Правило то же, что у остальных таблиц в 0003: данные видит вошедший.
  drop policy if exists "panel_authenticated" on public.reviews;
  create policy "panel_authenticated" on public.reviews
    for all to authenticated using (true) with check (true);
end $$;

-- ── Деньги по периодам ──────────────────────────────────────────────────────
-- Одной строкой: за всё время, месяц, неделю и сутки. Возвраты считаются
-- отдельно и в выручку не входят — иначе цифра врёт в свою пользу.
--
-- Периоды считаются от «сейчас», а не от начала суток: «за день» значит за
-- последние 24 часа. Так честнее для вечернего взгляда на цифры.

create or replace view v_money as
with учтённые as (
  select amount, currency, created_at, status
  from orders
  where status <> 'refunded'
)
select
  'всё время' as период, 1 as порядок,
  count(*)                                        as заказов,
  coalesce(sum(amount), 0)                        as выручка,
  coalesce(round(avg(amount), 2), 0)              as средний_чек
from учтённые
union all
select 'месяц', 2, count(*), coalesce(sum(amount), 0), coalesce(round(avg(amount), 2), 0)
from учтённые where created_at > now() - interval '30 days'
union all
select 'неделя', 3, count(*), coalesce(sum(amount), 0), coalesce(round(avg(amount), 2), 0)
from учтённые where created_at > now() - interval '7 days'
union all
select 'сутки', 4, count(*), coalesce(sum(amount), 0), coalesce(round(avg(amount), 2), 0)
from учтённые where created_at > now() - interval '1 day';

-- ── Заказы по состоянию ─────────────────────────────────────────────────────
-- «В работе» — это оплаченные и выданные, но ещё не закрытые: деньги получены,
-- сделка не завершена. Их полезно видеть отдельно от завершённых.

create or replace view v_orders_state as
select
  case
    when status = 'refunded' then 'возвращено'
    when status = 'closed'   then 'выполнено'
    when status = 'dispute'  then 'спор'
    else 'в работе'
  end                                as состояние,
  count(*)                           as заказов,
  coalesce(sum(amount), 0)           as сумма,
  min(created_at)                    as самый_старый,
  max(created_at)                    as самый_свежий
from orders
group by 1;

-- ── Оценки ──────────────────────────────────────────────────────────────────

create or replace view v_ratings as
select
  rating                                                     as оценка,
  count(*)                                                   as отзывов,
  round(100.0 * count(*) / nullif(sum(count(*)) over (), 0), 1) as доля_процентов
from reviews
group by rating
order by rating desc;

-- ── Проверка ────────────────────────────────────────────────────────────────
--   select * from v_money order by порядок;
--   select * from v_orders_state;
--   select * from v_ratings;
