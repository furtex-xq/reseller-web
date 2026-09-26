-- ============================================================================
-- Reseller · вход в панель
--
-- Зачем понадобилось. Панель ходила в базу секретным ключом прямо из браузера,
-- и Supabase это запретил:
--
--   Forbidden use of secret API key in browser. Secret API keys can only be
--   used in a protected environment and should never be used in a browser.
--
-- Запрет правильный: ключ в браузере — это ключ, который может утечь вместе со
-- вкладкой. Поэтому панель теперь ходит публичным ключом и входит под обычным
-- пользователем, как и задумано в Supabase. Публичный ключ на то и публичный,
-- а доступ решает вход.
--
-- В 0001 схема закрыта RLS без единого правила: любой ключ, кроме секретного,
-- не видел ничего. Здесь открываем таблицы тем, кто вошёл, — и только им.
-- Невошедшие (роль anon) по-прежнему не видят ничего, хотя публичный ключ у них
-- и есть.
--
-- Выполнять в SQL Editor после 0001 и 0002.
-- ============================================================================

do $$
declare
  t text;
  tables text[] := array[
    'accounts', 'products', 'product_images', 'stock_keys', 'listings',
    'chats', 'orders', 'messages', 'message_rules', 'jobs', 'events'
  ];
begin
  foreach t in array tables loop
    -- Имя одно на все таблицы: так правило легко найти и переписать целиком,
    -- не гадая, как оно называлось в прошлый раз.
    execute format('drop policy if exists "panel_authenticated" on public.%I', t);
    execute format(
      'create policy "panel_authenticated" on public.%I
         for all to authenticated
         using (true) with check (true)', t);
  end loop;
end $$;

-- ── Проверка ────────────────────────────────────────────────────────────────
-- Должно вернуть 11 строк, по одной на таблицу:
--
--   select tablename, policyname, roles
--   from pg_policies
--   where schemaname = 'public' and policyname = 'panel_authenticated'
--   order by tablename;
--
-- ── Что дальше ──────────────────────────────────────────────────────────────
-- Правила есть, но входить пока некому: заведите себе пользователя.
--
--   Authentication → Users → Add user → Create new user
--   https://supabase.com/dashboard/project/_/auth/users
--
-- Почта может быть любой, в том числе несуществующей — письма никто не шлёт.
-- Поставьте галку «Auto Confirm User», иначе вход потребует подтверждения.
-- Эту почту и пароль потом вводите в панели.
--
-- Секретный ключ из настроек панели после этого удалите: он ей больше не нужен.
-- А сам ключ в проекте стоит сменить, раз он успел побывать в браузере:
--   Project Settings → API Keys → Rotate.
