/**
 * funpay-sync — ОДНИМ ФАЙЛОМ, для редактора Edge Functions на сайте Supabase.
 *
 * Файл собран автоматически из parse.ts и index.ts:
 *   node supabase/functions/funpay-sync/build-bundle.js
 * Правьте исходники, а не этот файл — иначе правки потеряются при сборке.
 *
 * Что это такое и как настраивается — supabase/functions/funpay-sync/README.md
 */

/* ════════════════════ разбор HTML FunPay (parse.ts) ════════════════════ */

import { DOMParser, type Element } from "https://deno.land/x/deno_dom@v0.1.45/deno-dom-wasm.ts";

export const FIELD = {
  date: ["tc-date-time", "tc-date", "tc-time"],
  order: ["tc-order"],
  title: ["tc-desc-text", "tc-desc"],
  buyer: ["tc-user", "media-user-name", "tc-buyer"],
  status: ["tc-status"],
  price: ["tc-price", "tc-amount", "tc-sum"],
};

const ST: [RegExp, string][] = [
  [/оплач/i, "paid"],
  [/выдан|отправлен/i, "delivered"],
  [/закры|выполн|завершен/i, "closed"],
  [/возврат|отмен/i, "refunded"],
  [/спор|арбитраж/i, "dispute"],
  [/ожида|нов/i, "new"],
];

export function txt(el: Element | null): string {
  return el ? String(el.textContent ?? "").replace(/\s+/g, " ").trim() : "";
}

export function pick(row: Element, names: string[]): string {
  for (const n of names) {
    const t = txt(row.querySelector("." + n) as Element | null);
    if (t) return t;
  }
  return "";
}

export function mapStatus(s: string): string {
  for (const [re, v] of ST) if (re.test(s)) return v;
  return "new";
}

/** «1 250,50 ₽» -> { amount: 1250.5, currency: "RUB" } */
export function money(s: string): { amount: number; currency: string } {
  const currency = /\$|usd/i.test(s) ? "USD" : /€|eur/i.test(s) ? "EUR" : "RUB";
  let n = String(s).replace(/[^\d.,-]/g, "");
  // Запятая — десятичный разделитель только если после неё 1-2 цифры.
  if (/,\d{1,2}$/.test(n)) n = n.replace(/\./g, "").replace(",", ".");
  else n = n.replace(/,/g, "");
  return { amount: parseFloat(n) || 0, currency };
}

const MON = [
  "январ", "феврал", "март", "апрел", "ма", "июн",
  "июл", "август", "сентябр", "октябр", "ноябр", "декабр",
];

/**
 * «25 сентября, 14:07» / «сегодня, 14:07» -> ISO.
 *
 * FunPay показывает московское время, а функция живёт в UTC, поэтому -3 часа.
 * Не разобралось — возвращаем пустую строку: честнее оставить дыру, которую
 * заполнит время синхронизации, чем подставить выдуманную дату.
 *
 * `now` параметром, а не Date.now() внутри, чтобы тесты не зависели от того,
 * какой сегодня день.
 */
export function isoDate(s: string, now: Date = new Date()): string {
  if (!s) return "";
  const hm = s.match(/(\d{1,2}):(\d{2})/);
  const h = hm ? +hm[1] : 0, mi = hm ? +hm[2] : 0;
  let d: Date | null = null;

  if (/сегодня/i.test(s)) d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  else if (/вчера/i.test(s)) d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  else {
    const dm = s.match(/(\d{1,2})\s+([а-яё]+)/i);
    if (dm) {
      const low = dm[2].toLowerCase();
      let mon = -1;
      for (let i = 0; i < MON.length; i++) if (low.indexOf(MON[i]) === 0) { mon = i; break; }
      if (mon >= 0) {
        const yr = s.match(/\b(20\d{2})\b/);
        d = new Date(yr ? +yr[1] : now.getFullYear(), mon, +dm[1]);
        // Без года: дата из будущего — значит это прошлый год.
        if (!yr && d > now) d.setFullYear(d.getFullYear() - 1);
      }
    } else {
      const num = s.match(/(\d{2})[.\/](\d{2})[.\/](\d{2,4})/);
      if (num) d = new Date(+(num[3].length === 2 ? "20" + num[3] : num[3]), +num[2] - 1, +num[1]);
    }
  }
  if (!d || isNaN(d.getTime())) return "";
  // Собираем в UTC вручную: иначе результат зависел бы от зоны сервера.
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), h - 3, mi))
    .toISOString().replace(/\.\d+Z$/, "Z");
}

/* ────────────────────────── состояние сессии ────────────────────────── */

export type Session = { ok: boolean; why: string; userId: number };

/** Живая ли сессия. FunPay кладёт на <body> data-app-data с userId. */
export function sessionState(html: string): Session {
  const m = html.match(/data-app-data\s*=\s*"([^"]+)"/);
  if (m) {
    try {
      const j = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
      const uid = Number(j.userId ?? 0);
      if (uid > 0) return { ok: true, why: "", userId: uid };
      return { ok: false, why: "FunPay отдал страницу как гостю: golden_key не подошёл или истёк", userId: 0 };
    } catch { /* разбираем дальше по тексту */ }
  }
  if (/cf-browser-verification|challenge-platform|Just a moment/i.test(html)) {
    return {
      ok: false,
      why: "FunPay показал защитную проверку вместо страницы — с адреса Supabase его не пускают",
      userId: 0,
    };
  }
  if (/name="login"|Войти на сайт/i.test(html)) {
    return { ok: false, why: "FunPay показал форму входа: golden_key не подошёл или истёк", userId: 0 };
  }
  return { ok: false, why: "страница FunPay не похожа ни на вход, ни на кабинет — вёрстка изменилась", userId: 0 };
}

/* ────────────────────────────── заказы ────────────────────────────── */

export type Ord = {
  external_id: string;
  buyer_name: string;
  title_raw: string;
  status: string;
  amount: number;
  currency: string;
  created_at: string;
  _raw: string[];
};

export function parseOrders(html: string, now: Date = new Date()): Ord[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (!doc) return [];
  const out: Ord[] = [];
  const seen = new Set<unknown>();
  for (const node of doc.querySelectorAll("a.tc-item, tr.tc-item, .tc-item")) {
    const row = node as unknown as Element;
    if (seen.has(row)) continue;
    seen.add(row);

    const raw: string[] = [];
    for (const c of row.querySelectorAll("[class*='tc-']")) {
      const t = txt(c as unknown as Element);
      if (t && !raw.includes(t)) raw.push(t);
    }
    let order = pick(row, FIELD.order).replace(/^#/, "");
    if (!order) {
      const m = (row.getAttribute("href") ?? "").match(/([A-Z0-9]{6,})\/?$/i);
      if (m) order = m[1];
    }
    const p = money(pick(row, FIELD.price) || raw[raw.length - 1] || "");
    const rec: Ord = {
      external_id: order,
      buyer_name: pick(row, FIELD.buyer),
      title_raw: pick(row, FIELD.title),
      status: mapStatus(pick(row, FIELD.status)),
      amount: p.amount,
      currency: p.currency,
      created_at: isoDate(pick(row, FIELD.date), now),
      _raw: raw,
    };
    if (rec.external_id) out.push(rec);
  }
  return out;
}

/* ────────────────────────────── свои лоты ────────────────────────────── */

export type Lot = { external_id: string; title: string; price: number; url: string; active: boolean };

export function parseLots(html: string): Lot[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (!doc) return [];
  const out: Lot[] = [];
  const seen = new Set<string>();
  for (const node of doc.querySelectorAll("a.tc-item, .tc-item")) {
    const row = node as unknown as Element;
    const href = row.getAttribute("href") ?? "";
    const id = href.match(/[?&]id=(\d+)/)?.[1] ?? "";
    const title = pick(row, FIELD.title);
    if (!id || !title || seen.has(id)) continue;
    seen.add(id);
    out.push({
      external_id: id,
      title,
      price: money(pick(row, FIELD.price)).amount,
      url: href.startsWith("http") ? href : "https://funpay.com" + href,
      // Неактивные лоты FunPay помечает классом на строке.
      active: !/tc-item-inactive|warning|disabled/i.test(row.getAttribute("class") ?? ""),
    });
  }
  return out;
}

/* ════════════════════ синхронизация (index.ts) ════════════════════ */

/**
 * funpay-sync — читает заказы и диалоги с FunPay и складывает их в Supabase.
 *
 * Зачем нужен отдельный воркер: панель в браузере зайти на funpay.com не может,
 * это запрет браузера (same-origin). У сервера такого запрета нет — он ходит на
 * FunPay со вашей cookie сессии, как обычный посетитель.
 *
 * Схема:  FunPay --(golden_key)--> эта функция --> Supabase --Realtime--> панель
 *
 * ЗАПУСК
 *   supabase functions deploy funpay-sync
 *   supabase secrets set FUNPAY_GOLDEN_KEY=...      <- это делаете вы, не я
 *
 * СНАЧАЛА ПРОВЕРКА, ПОТОМ КРОН. Вызовите с ?dry=1 — функция разберёт страницу
 * и вернёт, что получилось, НИЧЕГО не записав. Пока сухой прогон не показывает
 * ваши настоящие заказы, крон включать незачем.
 *
 *   curl -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
 *        "https://<проект>.supabase.co/functions/v1/funpay-sync?dry=1"
 *
 * ПЕРЕМЕННЫЕ
 *   FUNPAY_GOLDEN_KEY      cookie сессии FunPay. Обязательна.
 *   FUNPAY_ACCOUNT_LABEL   к какому аккаунту в базе привязывать. По умолчанию
 *                          берётся единственный funpay-аккаунт, если он один.
 *   SUPABASE_URL           подставляет Supabase сам.
 *   SUPABASE_SERVICE_ROLE_KEY  подставляет Supabase сам.
 *
 * ЧЕГО ЭТА ФУНКЦИЯ НЕ ДЕЛАЕТ
 *   Не пишет на FunPay: не отвечает покупателям, не выдаёт товар, не поднимает
 *   лоты. Только чтение. Выдача остаётся за приложением на телефоне, у которого
 *   для этого есть живой браузер с вашей сессией.
 *
 *   Не создаёт товары. У лота на FunPay нет артикула, а products.sku — not null
 *   unique; выдуманный артикул испортил бы каталог и аналитику. Вместо этого
 *   функция дополняет уже существующие объявления: находит лот по совпадению
 *   названия с товаром и прописывает ему external_id, ссылку и статус.
 */

const FP = "https://funpay.com";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GOLDEN = (Deno.env.get("FUNPAY_GOLDEN_KEY") ?? "").trim();
const LABEL = (Deno.env.get("FUNPAY_ACCOUNT_LABEL") ?? "").trim();

type Page = { html: string; status: number };

async function grab(path: string): Promise<Page> {
  const r = await fetch(FP + path, {
    headers: {
      "cookie": "golden_key=" + GOLDEN,
      "user-agent": UA,
      "accept": "text/html,application/xhtml+xml",
      "accept-language": "ru-RU,ru;q=0.9",
    },
    redirect: "follow",
  });
  return { html: await r.text(), status: r.status };
}

/* ────────────────────────────── Supabase ────────────────────────────── */

async function rest(path: string, init: RequestInit = {}): Promise<Response> {
  return await fetch(SB_URL + "/rest/v1/" + path, {
    ...init,
    headers: {
      "apikey": SB_KEY,
      "Authorization": "Bearer " + SB_KEY,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

async function sel<T = Record<string, unknown>>(path: string): Promise<T[]> {
  const r = await rest(path);
  if (!r.ok) throw new Error("select " + path + ": HTTP " + r.status + " " + (await r.text()).slice(0, 200));
  return await r.json();
}

/** Пакетный upsert. on_conflict — те же уникальные ключи, что в миграции. */
async function upsert(table: string, conflict: string, rows: unknown[]): Promise<number> {
  if (!rows.length) return 0;
  const r = await rest(table + "?on_conflict=" + conflict, {
    method: "POST",
    headers: { "Prefer": "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error("upsert " + table + ": HTTP " + r.status + " " + (await r.text()).slice(0, 300));
  return rows.length;
}

async function logEvent(type: string, level: string, payload: unknown): Promise<void> {
  try {
    await rest("events", { method: "POST", headers: { Prefer: "return=minimal" },
      body: JSON.stringify([{ type, level, payload }]) });
  } catch { /* журнал не должен валить синхронизацию */ }
}

/**
 * К какому аккаунту привязывать заказы.
 *
 * Важно не создать второй аккаунт рядом с тем, что уже завёл телефон: у orders
 * ключ (account_id, external_id), и на двух аккаунтах один заказ FunPay ляжет
 * двумя строками. Поэтому сначала ищем существующий, создаём — в последнюю
 * очередь.
 */
async function resolveAccount(): Promise<{ id: string; label: string; created: boolean }> {
  const accs = await sel<{ id: string; label: string }>("accounts?platform=eq.funpay&select=id,label");
  if (LABEL) {
    const hit = accs.find((a) => a.label === LABEL);
    if (hit) return { ...hit, created: false };
  } else if (accs.length === 1) {
    return { ...accs[0], created: false };
  } else if (accs.length > 1) {
    throw new Error(
      "в базе " + accs.length + " funpay-аккаунтов (" + accs.map((a) => a.label).join(", ") +
      "). Укажите нужный: supabase secrets set FUNPAY_ACCOUNT_LABEL=<название>",
    );
  }
  const label = LABEL || "Основной";
  const r = await rest("accounts?on_conflict=platform,label&select=id,label", {
    method: "POST",
    headers: { "Prefer": "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify([{ platform: "funpay", label, session_key: "edge-worker", is_active: true }]),
  });
  if (!r.ok) throw new Error("создание аккаунта: HTTP " + r.status + " " + (await r.text()).slice(0, 200));
  const made = (await r.json())[0];
  return { id: made.id, label: made.label, created: true };
}

/* ────────────────────────────── синхронизация ────────────────────────────── */

type Result = Record<string, unknown>;

async function sync(dry: boolean): Promise<Result> {
  if (!GOLDEN) {
    return { ok: false, ошибка: "нет FUNPAY_GOLDEN_KEY. supabase secrets set FUNPAY_GOLDEN_KEY=..." };
  }
  if (!SB_URL || !SB_KEY) {
    return { ok: false, ошибка: "нет SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY в окружении функции" };
  }

  const t0 = Date.now();
  const trade = await grab("/orders/trade");
  const state = sessionState(trade.html);
  if (!state.ok) {
    const res = { ok: false, ошибка: state.why, httpFunPay: trade.status, размерОтвета: trade.html.length };
    if (!dry) await logEvent("funpay_sync_auth", "error", res);
    return res;
  }

  const orders = parseOrders(trade.html);
  const пустых = orders.filter((o) => !o.buyer_name || !o.created_at).length;

  // Лоты — необязательная часть: не вышло, и ладно, заказы важнее.
  let lots: Lot[] = [];
  let лотыОшибка: string | null = null;
  try {
    const lp = await grab("/lots/trade");
    if (sessionState(lp.html).ok) lots = parseLots(lp.html);
    else лотыОшибка = "страница лотов отдалась как гостю";
  } catch (e) {
    лотыОшибка = e instanceof Error ? e.message : String(e);
  }

  if (dry) {
    return {
      ok: true,
      режим: "сухой прогон, в базу ничего не записано",
      userIdНаFunPay: state.userId,
      заказовНайдено: orders.length,
      неразобранныхЯчеек: пустых,
      заказы: orders.slice(0, 10).map(({ _raw, ...o }) => o),
      сырыеЯчейки: пустых ? orders.slice(0, 3).map((o) => o._raw) : "все ячейки разобрались",
      лотовНайдено: lots.length,
      лоты: lots.slice(0, 10),
      лотыОшибка,
      мс: Date.now() - t0,
    };
  }

  const acc = await resolveAccount();

  // Заказы. product_id намеренно не трогаем: привязку товара делает человек
  // или приложение, а угадывать её по названию — плодить чужие связи.
  const now = new Date().toISOString();
  const ordRows = orders.map((o) => ({
    account_id: acc.id,
    platform: "funpay",
    external_id: o.external_id,
    buyer_name: o.buyer_name || null,
    title_raw: o.title_raw || null,
    amount: o.amount,
    currency: o.currency,
    status: o.status,
    ...(o.status === "delivered" ? { delivered_at: o.created_at || now } : {}),
    ...(o.status === "closed" ? { closed_at: o.created_at || now } : {}),
    created_at: o.created_at || now,
  }));
  const ordN = await upsert("orders", "account_id,external_id", ordRows);

  // Диалоги: у списка сделок нет id диалога, зато есть покупатель. Заводим по
  // одному чату на покупателя, чтобы панель показывала, с кем идёт разговор.
  const buyers = [...new Set(orders.map((o) => o.buyer_name).filter(Boolean))];
  const chatRows = buyers.map((b) => ({
    account_id: acc.id,
    platform: "funpay",
    external_id: "buyer:" + b,
    buyer_name: b,
    last_message_at: null,
  }));
  const chatN = await upsert("chats", "account_id,external_id", chatRows);

  // Объявления: только дополняем существующие, новые товары не выдумываем.
  let lstN = 0;
  const lstПропущено: string[] = [];
  if (lots.length) {
    const prods = await sel<{ id: string; title: string }>("products?select=id,title&is_archived=eq.false");
    const byTitle = new Map(prods.map((p) => [p.title.trim().toLowerCase(), p.id]));
    const rows: unknown[] = [];
    for (const l of lots) {
      const pid = byTitle.get(l.title.trim().toLowerCase());
      if (!pid) { lstПропущено.push(l.title); continue; }
      rows.push({
        product_id: pid, account_id: acc.id, platform: "funpay",
        external_id: l.external_id, url: l.url,
        status: l.active ? "active" : "paused",
        published_at: now,
      });
    }
    if (rows.length) lstN = await upsert("listings", "account_id,product_id", rows);
  }

  const res: Result = {
    ok: true,
    аккаунт: acc.label + (acc.created ? " (создан сейчас)" : ""),
    заказов: ordN,
    диалогов: chatN,
    объявлений: lstN,
    неразобранныхЯчеек: пустых,
    лотовБезТовара: lstПропущено.length,
    мс: Date.now() - t0,
  };
  if (лотыОшибка) res.лотыОшибка = лотыОшибка;
  await logEvent("funpay_sync", пустых || лотыОшибка ? "warn" : "info", res);
  return res;
}

/**
 * Кто зовёт функцию.
 *
 * Крон ходит с anon-ключом — он публичный, его не страшно вписать в SQL, и
 * поэтому для расписания не нужен ни vault, ни service_role в тексте миграции.
 * Но anon-ключ лежит и в панели, то есть знает его кто угодно. Значит, подробный
 * ответ со списком заказов отдавать по нему нельзя: посторонний увидел бы, кто у
 * вас что купил. Подробности — только тому, кто пришёл с service_role.
 */
function isOwner(req: Request): boolean {
  if (!SB_KEY) return false;
  const h = (req.headers.get("authorization") ?? "").replace(/^Bearers+/i, "").trim();
  const q = new URL(req.url).searchParams.get("key") ?? "";
  return h === SB_KEY || q === SB_KEY;
}

/** Урезанный ответ для чужого: видно, что живо, не видно, чем торгуете. */
function terse(out: Result): Result {
  return { ok: out.ok, ...(out.ok ? {} : { ошибка: "подробности только по service_role" }) };
}

/* Чтобы сухой прогон можно было запустить кнопкой из панели, а не из
   терминала: панель живёт на другом домене, и без этих заголовков браузер
   запрос не пустит. Открыто для всех доменов сознательно — доступ всё равно
   решает ключ, а не адрес страницы. */
const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

export const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const owner = isOwner(req);
  const dry = new URL(req.url).searchParams.get("dry") === "1";

  // Сухой прогон — это выгрузка заказов в ответ. Чужому он не положен вовсе.
  if (dry && !owner) {
    return new Response(
      JSON.stringify({ ok: false, ошибка: "сухой прогон только по service_role" }, null, 2),
      { status: 403, headers: { ...CORS, "content-type": "application/json; charset=utf-8" } },
    );
  }

  const json = (out: Result, status: number) =>
    new Response(JSON.stringify(owner ? out : terse(out), null, 2), {
      status,
      headers: { ...CORS, "content-type": "application/json; charset=utf-8" },
    });

  try {
    const out = await sync(dry);
    return json(out, out.ok ? 200 : 502);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!dry) await logEvent("funpay_sync", "error", { ошибка: msg });
    return json({ ok: false, ошибка: msg }, 500);
  }
};

// Переменная нужна сборке в один файл: тесты импортируют её и не хотят сервера.
if (!Deno.env.get("FUNPAY_SYNC_NO_SERVE")) Deno.serve(handler);
