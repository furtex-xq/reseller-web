-- ============================================================================
-- Reseller · воркер FunPay: расписание и Realtime
--
-- ЭТО ШАБЛОН. Два места помечены __ВОТ_ТАК__ — их надо подставить.
-- Проще не подставлять руками: откройте панель, вкладка «Подключение», вставьте
-- туда адрес проекта и ключи — она выдаст этот же файл уже заполненным, с
-- кнопкой «Скопировать» и ссылкой прямо в ваш SQL Editor.
--
--   https://furtex-xq.github.io/reseller-web/#/setup
--
-- Выполнять ПОСЛЕ того, как функция funpay-sync выложена и сухой прогон
-- (?dry=1) показал ваши настоящие заказы. Пока прогон пустой, крон только
-- копил бы ошибки.
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ── Расписание ──────────────────────────────────────────────────────────────
-- Раз в минуту — предел pg_cron и ровно та задержка, за которую на бесплатном
-- тарифе не просят денег: 43 200 вызовов в месяц против лимита 500 000.
--
-- Крон ходит с ANON-ключом, а не с service_role. Anon публичный — он и так
-- лежит в панели, так что вписать его в SQL не страшно, и vault не нужен.
-- Подробный ответ со списком заказов функция по anon-ключу не отдаёт: для этого
-- нужен service_role, который остаётся только у вас.

do $$
begin
  -- Повторный прогон файла не должен падать на «job already exists».
  if exists (select 1 from cron.job where jobname = 'funpay-sync') then
    perform cron.unschedule('funpay-sync');
  end if;
end $$;

select cron.schedule(
  'funpay-sync',
  '* * * * *',
  $cron$
  select net.http_post(
    url := '__PROJECT_URL__/functions/v1/funpay-sync',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer __ANON_KEY__'
    ),
    body := jsonb_build_object('at', now()),
    -- Меньше минуты: иначе зависший вызов пересечётся со следующим.
    timeout_milliseconds := 45000
  );
  $cron$
);

-- pg_net складывает каждый ответ в таблицу и сам её не чистит. Минутный крон —
-- это 43 тысячи строк в месяц на тарифе с 500 МБ, так что подметаем за собой.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'funpay-sync-cleanup') then
    perform cron.unschedule('funpay-sync-cleanup');
  end if;
end $$;

select cron.schedule(
  'funpay-sync-cleanup',
  '17 4 * * *',
  $cron$
  delete from net._http_response where created < now() - interval '2 days';
  delete from events where created_at < now() - interval '90 days';
  $cron$
);

-- ── Realtime ────────────────────────────────────────────────────────────────
-- Панель обновляется опросом и без этого, но публикация нужна, если когда-нибудь
-- захочется вебсокет: включить её сейчас дешевле, чем потом искать этот файл.

do $$
declare t text;
begin
  foreach t in array array['orders', 'chats', 'listings', 'products', 'events', 'stock_keys']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ── Проверка ────────────────────────────────────────────────────────────────
-- Через пару минут:
--   select jobname, schedule, active from cron.job;
--   select status, created from net._http_response order by created desc limit 5;
--   select created_at, level, payload from events
--     where type like 'funpay_sync%' order by created_at desc limit 5;
--
-- Снять с расписания:  select cron.unschedule('funpay-sync');
