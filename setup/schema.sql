-- ============================================================================
-- Reseller · базовая схема
-- Применять в Supabase → SQL Editor целиком, один раз.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ── Справочники ─────────────────────────────────────────────────────────────

create type platform_t   as enum ('funpay', 'playerok');
create type listing_st   as enum ('draft', 'publishing', 'active', 'paused', 'sold_out', 'error');
create type key_st       as enum ('available', 'reserved', 'delivered', 'burned');
create type order_st     as enum ('new', 'paid', 'delivered', 'closed', 'refunded', 'dispute');
create type msg_dir      as enum ('in', 'out');
create type rule_trigger as enum ('keyword', 'order_paid', 'order_closed', 'first_contact', 'delay');
create type job_st       as enum ('pending', 'running', 'done', 'failed', 'cancelled');

-- ── Аккаунты площадок ───────────────────────────────────────────────────────

create table accounts (
  id            uuid primary key default gen_random_uuid(),
  platform      platform_t  not null,
  label         text        not null,               -- как показывать в UI
  external_id   text,                               -- id продавца на площадке
  session_key   text        not null,               -- имя Electron-партиции с куками
  is_active     boolean     not null default true,
  last_seen_at  timestamptz,
  created_at    timestamptz not null default now(),
  unique (platform, label)
);

-- ── Товары ──────────────────────────────────────────────────────────────────

create table products (
  id                uuid primary key default gen_random_uuid(),
  sku               text          not null unique,  -- внутренний артикул
  title             text          not null,
  description       text          not null default '',
  category          text,
  game              text,
  price             numeric(12,2) not null check (price >= 0),
  currency          text          not null default 'RUB',
  auto_delivery     boolean       not null default false,
  -- сообщение покупателю при выдаче; {{key}} подставит код со склада
  delivery_template text          not null default 'Спасибо за покупку! Ваш товар: {{key}}',
  low_stock_alert   int           not null default 3,
  is_archived       boolean       not null default false,
  created_at        timestamptz   not null default now(),
  updated_at        timestamptz   not null default now()
);

create table product_images (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references products(id) on delete cascade,
  path        text not null,                        -- локальный путь или URL
  position    int  not null default 0
);
create index on product_images (product_id);

-- ── Склад ключей (цифровые товары) ──────────────────────────────────────────

create table stock_keys (
  id           uuid   primary key default gen_random_uuid(),
  product_id   uuid   not null references products(id) on delete cascade,
  -- payload хранится зашифрованным: AES-256-GCM, ключ VAULT_KEY из .env
  payload_enc  text   not null,
  status       key_st not null default 'available',
  order_id     uuid,                                -- кому выдан
  note         text,
  reserved_at  timestamptz,
  delivered_at timestamptz,
  created_at   timestamptz not null default now()
);
create index on stock_keys (product_id, status);
create index on stock_keys (order_id);

-- ── Объявления на площадках ─────────────────────────────────────────────────

create table listings (
  id                uuid       primary key default gen_random_uuid(),
  product_id        uuid       not null references products(id) on delete cascade,
  account_id        uuid       not null references accounts(id) on delete cascade,
  platform          platform_t not null,
  external_id       text,                           -- id лота на площадке
  url               text,
  status            listing_st not null default 'draft',
  price_override    numeric(12,2),
  auto_bump         boolean    not null default false,
  bump_interval_min int        not null default 240,
  last_bumped_at    timestamptz,
  last_error        text,
  published_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (account_id, product_id)
);
create index on listings (status, auto_bump);
create index on listings (platform, external_id);

-- ── Чаты и заказы ───────────────────────────────────────────────────────────

create table chats (
  id              uuid       primary key default gen_random_uuid(),
  account_id      uuid       not null references accounts(id) on delete cascade,
  platform        platform_t not null,
  external_id     text       not null,              -- id диалога на площадке
  buyer_name      text,
  url             text,
  last_message_at timestamptz,
  last_reply_at   timestamptz,                      -- когда бот отвечал последний раз
  unread          boolean    not null default false,
  created_at      timestamptz not null default now(),
  unique (account_id, external_id)
);
create index on chats (last_message_at desc);

create table orders (
  id           uuid       primary key default gen_random_uuid(),
  account_id   uuid       not null references accounts(id) on delete cascade,
  platform     platform_t not null,
  external_id  text       not null,                 -- номер заказа на площадке
  chat_id      uuid       references chats(id)    on delete set null,
  product_id   uuid       references products(id) on delete set null,
  listing_id   uuid       references listings(id) on delete set null,
  buyer_name   text,
  title_raw    text,                                -- как заказ назван на площадке
  amount       numeric(12,2) not null default 0,
  currency     text       not null default 'RUB',
  status       order_st   not null default 'new',
  delivered_at timestamptz,
  closed_at    timestamptz,
  created_at   timestamptz not null default now(),
  unique (account_id, external_id)
);
create index on orders (status);
create index on orders (created_at desc);

create table messages (
  id          uuid    primary key default gen_random_uuid(),
  chat_id     uuid    not null references chats(id) on delete cascade,
  order_id    uuid    references orders(id) on delete set null,
  direction   msg_dir not null,
  body        text    not null,
  external_id text,                                 -- id сообщения на площадке, для дедупликации
  rule_id     uuid,                                 -- какое правило породило исходящее
  is_auto     boolean not null default false,
  sent_at     timestamptz not null default now(),
  unique (chat_id, external_id)
);
create index on messages (chat_id, sent_at desc);

-- ── Правила авто-сообщений ──────────────────────────────────────────────────

create table message_rules (
  id           uuid         primary key default gen_random_uuid(),
  name         text         not null,
  trigger      rule_trigger not null,
  -- keyword: слова через запятую; delay: минуты ожидания
  pattern      text         not null default '',
  template     text         not null,
  product_id   uuid         references products(id) on delete cascade, -- null = для всех
  platform     platform_t,                                            -- null = для всех
  priority     int          not null default 100,
  cooldown_sec int          not null default 300,
  is_enabled   boolean      not null default true,
  hit_count    int          not null default 0,
  created_at   timestamptz  not null default now()
);
create index on message_rules (is_enabled, priority);

-- ── Очередь задач автоматизации ─────────────────────────────────────────────

create table jobs (
  id           uuid   primary key default gen_random_uuid(),
  type         text   not null,                     -- publish_listing | bump_listing | deliver_order | send_message | sync
  payload      jsonb  not null default '{}'::jsonb,
  status       job_st not null default 'pending',
  run_at       timestamptz not null default now(),
  attempts     int    not null default 0,
  max_attempts int    not null default 3,
  last_error   text,
  started_at   timestamptz,
  finished_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index on jobs (status, run_at);

-- ── Журнал событий (аналитика и разбор полётов) ─────────────────────────────

create table events (
  id         uuid  primary key default gen_random_uuid(),
  type       text  not null,                        -- order_paid | key_delivered | reply_sent | bump_ok | error ...
  level      text  not null default 'info',         -- info | warn | error
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on events (type, created_at desc);
create index on events (created_at desc);

-- ── Представления для аналитики ─────────────────────────────────────────────

create view v_daily_sales as
select
  date_trunc('day', o.created_at)::date         as day,
  o.platform,
  count(*)                                      as orders,
  count(*) filter (where o.status = 'refunded') as refunds,
  sum(o.amount)                                 as revenue,
  avg(o.amount)                                 as avg_check,
  avg(extract(epoch from (o.delivered_at - o.created_at)))
    filter (where o.delivered_at is not null)   as avg_delivery_sec
from orders o
group by 1, 2;

create view v_product_performance as
select
  p.id,
  p.sku,
  p.title,
  count(o.id)                                       as orders,
  coalesce(sum(o.amount), 0)                        as revenue,
  count(k.id) filter (where k.status = 'available') as stock_left,
  p.low_stock_alert,
  max(o.created_at)                                 as last_sale_at
from products p
left join orders     o on o.product_id = p.id and o.status <> 'refunded'
left join stock_keys k on k.product_id = p.id
where p.is_archived = false
group by p.id;

create view v_response_time as
select
  c.id       as chat_id,
  c.platform,
  avg(extract(epoch from (m_out.sent_at - m_in.sent_at))) as avg_response_sec
from chats c
join messages m_in on m_in.chat_id = c.id and m_in.direction = 'in'
join lateral (
  select m.sent_at from messages m
  where m.chat_id = c.id and m.direction = 'out' and m.sent_at > m_in.sent_at
  order by m.sent_at limit 1
) m_out on true
group by c.id, c.platform;

-- ── updated_at ──────────────────────────────────────────────────────────────

create or replace function touch_updated_at() returns trigger
language plpgsql as $fn$
begin
  new.updated_at = now();
  return new;
end
$fn$;

create trigger t_products_touch before update on products
  for each row execute function touch_updated_at();
create trigger t_listings_touch before update on listings
  for each row execute function touch_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Приложение ходит под service_role, для него RLS не применяется. Включаем RLS
-- без политик, чтобы anon-ключ (если утечёт) не открыл данные наружу.

alter table accounts       enable row level security;
alter table products       enable row level security;
alter table product_images enable row level security;
alter table stock_keys     enable row level security;
alter table listings       enable row level security;
alter table chats          enable row level security;
alter table orders         enable row level security;
alter table messages       enable row level security;
alter table message_rules  enable row level security;
alter table jobs           enable row level security;
alter table events         enable row level security;
