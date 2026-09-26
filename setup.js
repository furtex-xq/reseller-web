/**
 * Мастер подключения: доводит панель до настоящих заказов с FunPay.
 *
 * Прошлая версия вела к воркеру на Supabase. Он не заработал, и не из-за кода:
 * FunPay не признаёт сессию с адреса дата-центра — отвечает 200, отдаёт
 * нормальную страницу и молча считает гостем. С домашнего адреса та же
 * последовательность входит. Поэтому заказы теперь носит расширение Chrome,
 * работающее в вашей же вкладке, а шаги про golden_key отсюда убраны совсем.
 *
 * Что мастер делает за человека: подставляет его значения в SQL, даёт прямые
 * ссылки в нужные разделы его проекта, хранит черновик между перезагрузками,
 * сам проверяет, что уже готово, и в конце — что всё сошлось.
 *
 * Чего сделать нельзя: завести проект Supabase (это регистрация) и поставить
 * расширение (это делает сам Chrome).
 */
(function () {
  "use strict";

  var R = window.RS, DB = R.DB, esc = R.esc;
  var ic = function (n, c) { return window.__ic ? window.__ic(n, c) : ""; };
  var toast = function (t, k) { if (window.__toast) window.__toast(t, k); };

  // Заготовки подтягиваются с сервера при первом открытии вкладки: держать
  // схему базы внутри панели незачем.
  var FILES = { schema: null, policies: null };
  var LOADING = false;

  var D = {
    url: "", anon: "", paste: "",
    probe: null, probing: false, err: "",
    state: null, checking: false,
  };

  // Черновик переживает перезагрузку: без этого «обновите страницу» стирало
  // вставленное, и всё начиналось сначала.
  var DRAFT = "reseller-web:setup";

  function saveDraft() {
    try { localStorage.setItem(DRAFT, JSON.stringify({ url: D.url, anon: D.anon })); }
    catch (e) { /* приватный режим — переживём */ }
  }

  /**
   * Готовая ссылка вида #/setup?u=…&k=… заполняет адрес и публичный ключ.
   *
   * В адресе им ничего не грозит: публичный ключ на то и публичный, он и так
   * лежит в открытом коде панели. Секретных ключей и паролей тут нет и быть
   * не может — после разбора параметры из адресной строки убираются, чтобы
   * ссылка не тиражировалась дальше.
   */
  function fromLink() {
    var q = String(location.hash || "").split("?")[1];
    if (!q) return false;
    var got = { u: "", k: "" };
    q.split("&").forEach(function (p) {
      var i = p.indexOf("=");
      if (i < 0) return;
      var name = p.slice(0, i), val = decodeURIComponent(p.slice(i + 1).replace(/\+/g, " "));
      if (name === "u") got.u = val;
      if (name === "k") got.k = val;
    });
    var u = asUrl(got.u), k = got.k.trim();
    if (!u && !k) return false;
    if (u) D.url = u;
    // Секретный ключ по ссылке не принимаем даже случайно.
    if (k && !/^sb_secret_/.test(k)) D.anon = k;
    saveDraft();
    try { history.replaceState(null, "", location.pathname + "#/setup"); } catch (e) {}
    return true;
  }

  var загружен = false;

  function boot() {
    if (!загружен) {
      загружен = true;
      try {
        var d = JSON.parse(localStorage.getItem(DRAFT) || "{}");
        D.url = d.url || ""; D.anon = d.anon || "";
      } catch (e) { /* пусто так пусто */ }
      if (!D.url) D.url = DB.settings.sbUrl || "";
      if (!D.anon) D.anon = DB.settings.sbKey || "";
    }
    // Параметры ссылки сильнее черновика: человек открыл её как раз затем,
    // чтобы не вводить руками. Срабатывает один раз — потом хэш очищен.
    fromLink();
  }

  /* ---------------- адрес и ключ ---------------- */

  /**
   * Адрес проекта из чего угодно: полного URL, ссылки на дашборд или просто
   * кода проекта. Код виден в адресной строке дашборда — самый частый способ
   * его узнать, если страница «Project URL» не попалась на глаза.
   */
  function asUrl(text) {
    var s = String(text || "").trim();
    var direct = s.match(/https?:\/\/([a-z0-9-]+)\.supabase\.(co|in)/i);
    if (direct) return "https://" + direct[1].toLowerCase() + ".supabase." + direct[2].toLowerCase();
    var dash = s.match(/supabase\.com\/dashboard\/project\/([a-z0-9-]{16,})/i);
    if (dash) return "https://" + dash[1].toLowerCase() + ".supabase.co";
    if (/^[a-z]{16,24}$/i.test(s)) return "https://" + s.toLowerCase() + ".supabase.co";
    return "";
  }

  /** Публичный ключ из вставленного текста: новый sb_publishable_ или anon-JWT. */
  function sniffKey(text) {
    var pub = String(text).match(/sb_publishable_[A-Za-z0-9_-]+/);
    if (pub) return pub[0];
    var jwts = String(text).match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) || [];
    for (var i = 0; i < jwts.length; i++) {
      try {
        var role = JSON.parse(atob(jwts[i].split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).role;
        if (role === "anon") return jwts[i];
      } catch (e) { /* не тот токен */ }
    }
    return "";
  }

  function ref() {
    var m = String(D.url).match(/https?:\/\/([a-z0-9-]+)\.supabase\.(co|in)/i);
    return m ? m[1] : "";
  }
  function dash(path) {
    var r = ref();
    return r ? "https://supabase.com/dashboard/project/" + r + path : "";
  }

  /* ---------------- заготовки ---------------- */
  function need() {
    if (FILES.schema || LOADING) return;
    LOADING = true;
    var one = function (k, f) {
      return fetch("setup/" + f, { cache: "no-cache" })
        .then(function (r) { if (!r.ok) throw new Error(f + ": HTTP " + r.status); return r.text(); })
        .then(function (t) { FILES[k] = t; });
    };
    Promise.all([one("schema", "schema.sql"), one("policies", "policies.sql")])
      .then(function () { LOADING = false; window.__render(); },
        function (e) { LOADING = false; D.err = e.message; window.__render(); });
  }

  /**
   * SQL для шага 3.
   *
   * Когда таблицы уже созданы, схему подкладывать нельзя: `create table` без
   * «if not exists» упадёт на первой же таблице и оборвёт весь скрипт, так и
   * не дойдя до прав. Поэтому при готовых таблицах отдаём только права.
   */
  function sql() {
    if (!FILES.schema || !FILES.policies) return "";
    var шапка = "-- Собрано мастером панели Reseller Web.\n" +
      "-- Проект: " + String(D.url).replace(/\/+$/, "") + "\n";
    if (D.state && D.state.tables) {
      return шапка +
        "-- Таблицы у вас уже есть, поэтому здесь только права доступа.\n" +
        "-- Схему повторно выполнять нельзя: create table упадёт на первой же.\n\n" +
        FILES.policies;
    }
    return шапка + "-- Выполнять целиком, один раз.\n\n" +
      FILES.schema + "\n\n" + FILES.policies;
  }

  /* ---------------- что уже готово ----------------
     Спрашиваем у самого Supabase, а не полагаемся на память человека: после
     перезагрузки или через неделю видно, на чём остановились. */
  function checkAll() {
    if (!D.url || !D.anon || D.checking) return Promise.resolve(D.state);
    D.checking = true;
    var base = String(D.url).replace(/\/+$/, "");
    var st = { tables: false, auth: false, rows: 0 };

    var ключи = null;
    return R.AUTH.bearer(base, D.anon).then(function (tok) {
      st.auth = !!tok;
      ключи = { apikey: D.anon, Authorization: "Bearer " + (tok || D.anon) };
      return fetch(base + "/rest/v1/orders?select=id&limit=1", { headers: ключи });
    }).then(function (r) {
      // 404 — таблицы нет. Пустой список ничего не доказывает: так выглядит и
      // пустая база, и закрытая правилами, поэтому это считаем отдельно.
      st.tables = r.status !== 404;
      if (r.ok) return r.json().then(function (rows) { st.rows = rows.length; });
    }).then(function () {
      /* Права проверяем записью, а не чтением: без правил чтение молча вернёт
         пустой список, и «нет доступа» не отличить от «нечего показывать».
         Пишем строку в журнал событий — таблица ровно для таких отметок. */
      if (!st.auth || !st.tables) return;
      return fetch(base + "/rest/v1/events", {
        method: "POST",
        headers: Object.assign({ "Content-Type": "application/json", Prefer: "return=minimal" }, ключи),
        body: JSON.stringify([{ type: "setup_check", level: "info", payload: { откуда: "мастер" } }]),
      }).then(function (r) { st.rights = r.ok; }, function () { st.rights = false; });
    }).catch(function () { /* сети нет — оставим как есть */ })
      .then(function () {
        D.checking = false;
        D.state = st;
        window.__render();
        return st;
      });
  }

  /* ---------------- разметка ---------------- */

  function stepBox(n, title, done, body) {
    return '<div class="card' + (done ? " ok" : "") + '">' +
      '<h2><span class="stepn' + (done ? " on" : "") + '">' + (done ? "✓" : n) + "</span>" +
      esc(title) + "</h2>" + body + "</div>";
  }

  function copyBtn(what, label) {
    return '<button class="btn" data-act="setup-copy" data-what="' + what + '">' +
      ic("ul") + " " + esc(label) + "</button>";
  }

  function short(v) {
    v = String(v);
    return v.length > 34 ? v.slice(0, 16) + "…" + v.slice(-8) : v;
  }

  function keysTable() {
    var A = R.AUTH;
    var row = function (t, v, ok) {
      return "<tr><td>" + esc(t) + "</td><td>" +
        (v ? '<span class="pill ok">' + esc(ok) + "</span>" : '<span class="pill mute">нет</span>') +
        '</td><td class="t-title muted">' + esc(v ? short(v) : "—") + "</td></tr>";
    };
    return '<div class="tw" style="margin-top:12px"><table><tbody>' +
      row("Адрес проекта", D.url, "есть") +
      row("Публичный ключ", D.anon, "есть") +
      row("Вход", A.ok() ? (A.email || "выполнен") : "", "выполнен") +
      "</tbody></table></div>";
  }

  function progressNote(st) {
    var left = [];
    if (!st.tables) left.push("шаг 3 — таблицы");
    if (!st.auth) left.push("шаг 4 — вход");
    // Права проверяются записью и только после входа — иначе проверять нечем.
    else if (!st.rights) left.push("шаг 3 — права доступа");
    if (!left.length) {
      return '<div class="note ok">В проекте всё на месте: таблицы созданы, вход работает. ' +
        "Осталось поставить расширение и открыть FunPay.</div>";
    }
    return '<div class="note">Проверено в вашем проекте. Осталось: <b>' + esc(left.join(", ")) + "</b>.</div>";
  }

  function view() {
    boot();
    need();

    var haveBase = !!(D.url && D.anon);
    var A = R.AUTH;
    var st = D.state || {};

    if (haveBase && !D.state && !D.checking) setTimeout(checkAll, 0);

    var h = '<div class="head"><div><h1>Подключение</h1><div class="sub">' +
      "Чтобы в панели были настоящие заказы с FunPay. Всё бесплатно и без карты." +
      "</div></div>" +
      (haveBase
        ? '<span class="grow"></span><button class="btn" data-act="setup-check"' +
          (D.checking ? " disabled" : "") + ">" + ic("ok") +
          (D.checking ? " Проверяю…" : " Проверить, что уже готово") + "</button>"
        : "") +
      "</div>" +
      (haveBase && D.state ? progressNote(st) : "");

    if (D.err) {
      h += '<div class="card"><div class="note err">Заготовки не загрузились: ' + esc(D.err) +
        ". Обновите страницу.</div></div>";
    }

    /* 1 — проект */
    h += stepBox(1, "Завести проект Supabase", haveBase,
      '<p class="muted">Бесплатный тариф: 500 МБ базы, карта не нужна. Это единственный шаг, ' +
      "который нельзя сделать за вас — регистрация.</p>" +
      '<div style="margin-top:12px"><a class="btn pri" href="https://supabase.com/dashboard/new" ' +
      'target="_blank" rel="noopener">' + ic("link") + " Открыть Supabase</a></div>");

    /* 2 — адрес и ключ */
    h += stepBox(2, "Вставить адрес и публичный ключ", haveBase,
      '<p class="muted">В проекте: <b>Project Settings → API Keys</b>. Выделите страницу целиком ' +
      "и вставьте сюда — адрес и ключ разберутся сами, нажимать ничего не нужно.</p>" +
      '<div class="fld" style="margin-top:12px">' +
      '<textarea id="setupPaste" class="code" rows="4" ' +
      'placeholder="Вставьте сюда содержимое страницы API Keys">' + esc(D.paste || "") + "</textarea>" +
      '<span class="hint">Нужен <b>публичный</b> ключ. Секретный Supabase в браузере запрещает ' +
      "прямым текстом: «Secret API keys should never be used in a browser».</span></div>" +
      (D.url || D.anon ? keysTable() : "") +
      '<div class="fld" style="margin-top:14px"><label>Адрес проекта</label>' +
      '<input type="text" id="setupUrl" value="' + esc(D.url) + '" ' +
      'placeholder="https://xxxxxxxx.supabase.co или просто код проекта">' +
      '<span class="hint"><b>Project Settings → Data API → Project URL</b>. Или проще: посмотрите ' +
      "на адрес дашборда — <code>supabase.com/dashboard/project/<b>КОД</b></code>, вставьте КОД.</span></div>" +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">' +
      '<button class="btn" data-act="setup-sniff">' + ic("ok") + " Разобрать вставленное</button></div>");

    if (!haveBase) {
      h += '<div class="card"><div class="note">Дальше — как только найдутся адрес и публичный ' +
        "ключ: остальные шаги собираются из них.</div></div>";
      return h;
    }

    /* 3 — SQL */
    h += stepBox(3, "Создать таблицы и права", !!(st.tables && st.rights),
      '<p class="muted">Один запрос: таблицы под товары, склад, заказы и чаты, плюс правила ' +
      "доступа — они открывают данные тому, кто вошёл, и закрывают всем остальным.</p>" +
      (st.tables && st.auth && st.rights === false
        ? '<div class="note warn">Таблицы есть, а правил доступа нет: пробная запись в базу ' +
          "не прошла. Выполните этот SQL — он добавит недостающее, а таблицы не тронет.</div>"
        : st.tables && !st.auth
        ? '<div class="note">Таблицы есть. Права проверяются только после входа — если вы ' +
          "не выполняли этот SQL после обновления панели, выполните.</div>"
        : "") +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">' +
      copyBtn("sql", st.tables ? "Скопировать права доступа" : "Скопировать SQL") +
      '<a class="btn pri" href="' + dash("/sql/new") + '" target="_blank" rel="noopener">' +
      ic("link") + " Открыть SQL Editor</a></div>" +
      '<details style="margin-top:12px"><summary class="muted">Посмотреть, что там</summary>' +
      '<pre class="pre">' + esc((sql() || "загружается…").slice(0, 1200)) + "\n…</pre></details>");

    /* 4 — пользователь и вход */
    h += stepBox(4, "Завести себе вход", !!A.ok(),
      A.ok()
        ? '<div class="note ok">Вход выполнен: <b>' + esc(A.email || "—") + "</b>" +
          '<div style="margin-top:10px"><button class="btn sm" data-act="auth-out">Выйти</button></div></div>'
        : '<p class="muted">Панель и расширение ходят в базу публичным ключом, а доступ даёт ' +
          "вход. Заведите себе пользователя один раз: <b>Authentication → Users → Add user → " +
          "Create new user</b>, обязательно с галкой <b>Auto Confirm User</b>. Почта может быть " +
          "любой, писем никто не шлёт.</p>" +
          '<div style="margin-top:12px"><a class="btn" href="' + dash("/auth/users") +
          '" target="_blank" rel="noopener">' + ic("link") + " Открыть Authentication</a></div>" +
          '<div class="fld" style="margin-top:14px"><label>Почта</label>' +
          '<input type="email" id="setupMail" value="' + esc(A.email) + '"></div>' +
          '<div class="fld" style="margin-top:10px"><label>Пароль</label>' +
          '<input type="password" id="setupPass" placeholder="придумайте, если заводите нового">' +
          '<span class="hint">Пароль не сохраняется: после входа остаётся только выданный ' +
          "токен, и просроченный обновляется сам.</span></div>" +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">' +
          '<button class="btn pri" data-act="setup-signup">' + ic("plus") +
          " Завести и войти</button>" +
          '<button class="btn" data-act="setup-signin">' + ic("lock") + " Уже есть, войти</button>" +
          "</div>" +
          '<div class="note" style="margin-top:12px">«Завести и войти» создаёт пользователя ' +
          "прямо отсюда — в дашборд идти не нужно. Если Supabase потребует подтвердить почту, " +
          "панель скажет об этом и подскажет, что выключить.</div>");

    /* 5 — расширение */
    h += stepBox(5, "Поставить расширение Chrome", false,
      '<p class="muted">Оно и носит заказы с FunPay. Ключ FunPay ему не нужен: расширение ' +
      "работает в вашем же браузере, где вы уже вошли.</p>" +
      '<div class="note">Почему не сервер: FunPay не признаёт сессию с адреса дата-центра. ' +
      "Отвечает <code>200</code>, отдаёт нормальную страницу — и считает гостем. С домашнего " +
      "адреса та же последовательность входит. Это измерено, а не предположено.</div>" +
      '<ol class="steps"><li>Скачать и распаковать архив в любую постоянную папку.</li>' +
      "<li>Открыть <code>chrome://extensions</code>, включить <b>Режим разработчика</b>.</li>" +
      "<li><b>Загрузить распакованное расширение</b> → выбрать эту папку.</li>" +
      "<li>В настройках расширения нажать «Разобрать из буфера» и войти той же почтой.</li>" +
      "<li>Открыть funpay.com — значок покажет, сколько заказов уехало.</li></ol>" +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">' +
      '<a class="btn pri" href="setup/reseller-funpay-ext.zip" download>' + ic("dl") +
      " Скачать расширение</a>" +
      "</div>" +
      '<div class="note warn" style="margin-top:12px">Пока открыта хотя бы одна вкладка ' +
      "funpay.com — заказы идут сами. Все закрыты — расширение подхватит при следующем " +
      "открытии, ничего не потеряется.</div>");

    /* 6 — проверка */
    h += stepBox(6, "Убедиться, что всё сошлось", false,
      '<p class="muted">Панель перечитает вашу базу и покажет, что в ней лежит. Если расширение ' +
      "уже отработало — здесь появятся настоящие заказы.</p>" +
      (A.ok() ? "" : '<div class="note warn">Сначала шаг 4: без входа Supabase ничего не покажет.</div>') +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">' +
      '<button class="btn pri" data-act="setup-go"' + (D.probing || !A.ok() ? " disabled" : "") + ">" +
      ic("bolt") + (D.probing ? " Проверяю…" : " Включить и проверить") + "</button></div>" +
      probeBox());

    return h;
  }

  function probeBox() {
    var p = D.probe;
    if (!p) return "";
    if (p.kind === "err") {
      return '<div class="note err" style="margin-top:12px"><b>Не вышло.</b> ' + esc(p.msg) +
        (p.hint ? "<br><br>" + p.hint : "") + "</div>";
    }
    if (!p.orders) {
      return '<div class="note warn" style="margin-top:12px"><b>База читается, но заказов в ней ' +
        "пока нет.</b> Так и должно быть, если расширение ещё не отработало: поставьте его и " +
        "откройте вкладку funpay.com, потом нажмите проверку ещё раз.</div>";
    }
    return '<div class="note ok" style="margin-top:12px"><b>Готово: заказов в базе ' +
      esc(p.orders) + ".</b> Панель настроена — загляните на вкладку «Заказы».</div>";
  }

  /* ---------------- разбор вставленного ---------------- */

  function absorb(text, loud) {
    D.paste = text;
    var u = asUrl(text), k = sniffKey(text);
    var added = (u && u !== D.url) || (k && k !== D.anon);
    if (u) D.url = u;
    if (k) D.anon = k;
    saveDraft();

    if (!added) {
      if (loud) toast("В этом тексте ни адреса, ни публичного ключа не нашлось", "err");
      return false;
    }
    D.state = null;
    window.__render();
    var miss = [];
    if (!D.url) miss.push("адрес проекта");
    if (!D.anon) miss.push("публичный ключ");
    toast(miss.length ? "Не хватает: " + miss.join(", ") : "Адрес и ключ на месте",
      miss.length ? "warn" : "ok");
    return true;
  }

  // Слушатели вешаются один раз на документ: панель перерисовывает разметку
  // целиком, и обработчик на самом поле не пережил бы первую перерисовку.
  document.addEventListener("input", function (e) {
    var t = e.target;
    if (!t || !t.id) return;
    if (t.id === "setupPaste") { absorb(t.value, false); return; }
    if (t.id === "setupUrl") {
      // Перерисовку не зовём, пока печатают: иначе фокус улетит.
      D.url = asUrl(t.value) || "";
      saveDraft();
    }
  });
  document.addEventListener("change", function (e) {
    if (e.target && e.target.id === "setupUrl") { D.state = null; window.__render(); }
  });

  /* ---------------- действия ---------------- */

  function copy(text, okMsg) {
    var done = function () { toast(okMsg, "ok"); };
    var fallback = function () {
      var ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.left = "-9999px";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); done(); }
      catch (e) { toast("Скопировать не удалось", "err"); }
      ta.remove();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else fallback();
  }

  /** Вход прямо из мастера: адрес и ключ берём из полей, даже не сохранённых. */
  function signIn() {
    var g = function (id) { var e = document.getElementById(id); return e ? e.value.trim() : ""; };
    var mail = g("setupMail");
    var pass = (document.getElementById("setupPass") || {}).value || "";
    if (!D.url || !D.anon) return toast("Сначала адрес и публичный ключ", "err");
    if (!mail || !pass) return toast("Нужны почта и пароль", "err");

    toast("Вхожу…");
    R.AUTH.signIn(D.url, D.anon, mail, pass).then(function () {
      var s = Object.assign({}, DB.settings, { driver: "supabase", sbUrl: D.url, sbKey: D.anon });
      DB.useSettings(s);
      return DB.loadAll();
    }).then(function () {
      D.state = null;
      window.__render();
      if (window.__startLive) window.__startLive();
      toast("Вход выполнен", "ok");
      checkAll();
    }, function (e) {
      window.__render();
      toast("Войти не вышло: " + e.message, "err");
    });
  }

  /**
   * Завести пользователя прямо из панели.
   *
   * Обычный публичный signup — тот же, которым пользуются сайты. Ходить в
   * дашборд не нужно. Единственная засада: у новых проектов Supabase включено
   * подтверждение почты, и тогда сессии в ответе не будет. Это отличимо, и
   * панель говорит, что именно выключить, вместо молчаливой неудачи.
   */
  function signUp() {
    var g = function (id) { var e = document.getElementById(id); return e ? e.value.trim() : ""; };
    var mail = g("setupMail");
    var pass = (document.getElementById("setupPass") || {}).value || "";
    if (!D.url || !D.anon) return toast("Сначала адрес и публичный ключ", "err");
    if (!mail || !pass) return toast("Нужны почта и пароль", "err");
    if (pass.length < 6) return toast("Supabase не примет пароль короче шести символов", "err");

    toast("Завожу пользователя…");
    fetch(String(D.url).replace(/\/+$/, "") + "/auth/v1/signup", {
      method: "POST",
      headers: { apikey: D.anon, "Content-Type": "application/json" },
      body: JSON.stringify({ email: mail, password: pass }),
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) {
          var m = String(j.msg || j.error_description || j.message || ("HTTP " + r.status));
          if (/already registered|already exists/i.test(m)) {
            // Пользователь есть — значит человеку нужен вход, а не заведение.
            toast("Такой пользователь уже есть — вхожу", "ok");
            return signIn();
          }
          throw new Error(m);
        }
        // Сессия выдана сразу — подтверждение почты выключено, всё готово.
        if (j.access_token) return принятьСессию(j, mail);
        if (j.session && j.session.access_token) return принятьСессию(j.session, mail);

        D.probe = {
          kind: "err",
          msg: "пользователь создан, но Supabase ждёт подтверждения почты",
          hint: "Выключите подтверждение: <b>Authentication → Sign In / Providers → Email</b> → " +
            'снять <b>Confirm email</b> → Save. Потом нажмите «Уже есть, войти». ' +
            '<a href="' + dash("/auth/providers") + '" target="_blank" rel="noopener">Открыть</a>',
        };
        window.__render();
        toast("Нужно выключить подтверждение почты — смотрите шаг 6", "warn");
      });
    }).catch(function (e) {
      toast("Не вышло: " + e.message, "err");
    });
  }

  function принятьСессию(j, mail) {
    var A = R.AUTH;
    A.token = j.access_token || "";
    A.refresh = j.refresh_token || "";
    A.at = Date.now() + (Number(j.expires_in) || 3600) * 1000;
    A.email = mail;
    A.save();
    var s = Object.assign({}, DB.settings, { driver: "supabase", sbUrl: D.url, sbKey: D.anon });
    DB.useSettings(s);
    return DB.loadAll().then(function () {
      D.state = null;
      window.__render();
      if (window.__startLive) window.__startLive();
      toast("Пользователь заведён, вход выполнен", "ok");
      checkAll();
    });
  }

  function go() {
    if (!R.AUTH.ok()) return toast("Сначала войдите, шаг 4", "err");
    D.probing = true; D.probe = null; window.__render();

    var s = Object.assign({}, DB.settings, { driver: "supabase", sbUrl: D.url, sbKey: D.anon });
    DB.useSettings(s);

    DB.loadAll().then(function () {
      D.probing = false;
      D.probe = { kind: "ok", orders: DB.get("orders").length };
      window.__render();
      if (window.__startLive) window.__startLive();
    }, function (e) {
      D.probing = false;
      D.probe = {
        kind: "err", msg: e.message,
        hint: /таблиц/i.test(e.message) ? "Вернитесь к шагу 3 и выполните SQL."
          : /войти|вход/i.test(e.message) ? "Вернитесь к шагу 4."
          : "Проверьте адрес и публичный ключ из шага 2.",
      };
      window.__render();
    });
  }

  function act(a, el) {
    if (a === "setup-sniff") {
      var ta = document.getElementById("setupPaste");
      return absorb(ta ? ta.value : "", true);
    }
    if (a === "setup-check") { D.state = null; window.__render(); return checkAll(); }
    if (a === "setup-signin") return signIn();
    if (a === "setup-signup") return signUp();
    if (a === "setup-go") return go();
    if (a === "setup-copy") {
      var what = el ? el.getAttribute("data-what") : "";
      var text = what === "sql" ? sql() : "";
      if (!text) return toast("Заготовка ещё не загрузилась", "err");
      return copy(text, "SQL скопирован");
    }
  }

  window.__setupView = view;
  window.__setupAct = act;
})();
