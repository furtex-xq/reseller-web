/**
 * Мастер подключения: доводит панель до настоящих заказов с FunPay, стараясь
 * не гонять человека в терминал.
 *
 * Что здесь делается за пользователя: заполняются оба места в SQL, собирается
 * готовый к вставке код воркера, подставляются прямые ссылки в нужные разделы
 * его проекта, сохраняются настройки и запускается сухой прогон с разбором
 * ответа.
 *
 * Что за него сделать нельзя, и почему именно:
 *   — завести проект Supabase: это регистрация, её делает человек;
 *   — golden_key: это ключ от аккаунта FunPay, он идёт из браузера прямо в
 *     секреты Supabase и через панель не проходит вообще;
 *   — DDL: создать таблицы можно только в SQL Editor, через REST схему не
 *     меняют.
 */
(function () {
  "use strict";

  var R = window.RS, DB = R.DB, esc = R.esc;
  var ic = function (n, c) { return window.__ic ? window.__ic(n, c) : ""; };
  var toast = function (t, k) { if (window.__toast) window.__toast(t, k); };

  // Тексты подставляются с сервера при первом открытии вкладки: держать 24 КБ
  // воркера в самой панели незачем.
  var FILES = { schema: null, cron: null, worker: null };
  var LOADING = false;

  var D = {
    url: "", anon: "", svc: "", paste: "",
    probe: null, probing: false, err: "",
    // Что уже сделано в самом Supabase. Не галочки, которые человек ставит
    // сам, а то, что мастер проверил запросом: таблицы, воркер, секрет.
    state: null, checking: false,
  };

  // Черновик переживает перезагрузку. Без этого «обновите страницу» стирало
  // вставленное, и всё начиналось сначала — ровно та ловушка, из-за которой
  // мастер и казался бесполезным.
  var DRAFT = "reseller-web:setup";

  function saveDraft() {
    try {
      localStorage.setItem(DRAFT, JSON.stringify({ url: D.url, anon: D.anon, svc: D.svc }));
    } catch (e) { /* приватный режим — переживём, просто не сохранится */ }
  }

  function boot() {
    if (D.url || D.anon || D.svc) return;
    try {
      var d = JSON.parse(localStorage.getItem(DRAFT) || "{}");
      D.url = d.url || ""; D.anon = d.anon || ""; D.svc = d.svc || "";
    } catch (e) { /* пусто так пусто */ }
    // Если панель уже настроена, черновик берём из настроек.
    if (!D.url) D.url = DB.settings.sbUrl || "";
    if (!D.svc) D.svc = DB.settings.sbKey || "";
  }

  /* ---------------- что уже готово ----------------
     Мастер спрашивает у самого Supabase, а не полагается на память человека:
     после перезагрузки или через неделю видно, на чём остановились.

     Двух запросов хватает на три шага: REST говорит про таблицы, а сухой
     прогон различает «воркера нет» (404), «воркер есть, секрета нет» и
     «работает целиком». */
  function checkAll() {
    if (!D.url || !D.svc || D.checking) return Promise.resolve(D.state);
    D.checking = true;
    var base = String(D.url).replace(/\/+$/, "");
    var h = { apikey: D.svc, Authorization: "Bearer " + D.svc };
    var st = { tables: false, fn: false, secret: false, msg: "" };

    var tables = fetch(base + "/rest/v1/orders?select=id&limit=1", { headers: h })
      .then(function (r) { st.tables = r.ok; }, function () {});

    var worker = fetch(base + "/functions/v1/funpay-sync?dry=1", { headers: h })
      .then(function (r) {
        if (r.status === 404) return;            // функция не выложена
        st.fn = true;
        return r.json().then(function (j) {
          if (j && j.ok) { st.secret = true; D.probe = { kind: "ok", data: j }; return; }
          var m = String((j && j["ошибка"]) || "");
          st.msg = m;
          // «нет FUNPAY_GOLDEN_KEY» — воркер жив, не хватает только секрета.
          st.secret = !/FUNPAY_GOLDEN_KEY/i.test(m);
        }, function () { /* не JSON — считаем, что функция есть, но отвечает странно */ });
      }, function () { /* сети нет или CORS — оставляем как есть */ });

    return Promise.all([tables, worker]).then(function () {
      D.checking = false;
      D.state = st;
      window.__render();
      return st;
    });
  }

  /* ---------------- разбор вставленного ----------------
     На странице «API Keys» в Supabase адрес и ключи лежат рядом, и проще
     разрешить вставить всё подряд, чем заставлять раскладывать по полям. */
  function sniff(text) {
    var got = { url: "", anon: "", svc: "" };
    var u = String(text).match(/https?:\/\/[a-z0-9-]+\.supabase\.(co|in)/i);
    if (u) got.url = u[0];
    // Новые ключи sb_publishable_/sb_secret_, старые — JWT с ролью внутри.
    var pub = String(text).match(/sb_publishable_[A-Za-z0-9_-]+/);
    if (pub) got.anon = pub[0];
    var sec = String(text).match(/sb_secret_[A-Za-z0-9_-]+/);
    if (sec) got.svc = sec[0];
    var jwts = String(text).match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) || [];
    jwts.forEach(function (j) {
      var role = "";
      try { role = JSON.parse(atob(j.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).role || ""; }
      catch (e) { return; }
      if (role === "anon" && !got.anon) got.anon = j;
      if (role === "service_role" && !got.svc) got.svc = j;
    });
    return got;
  }

  function ref() {
    var m = String(D.url).match(/https?:\/\/([a-z0-9-]+)\.supabase\.(co|in)/i);
    return m ? m[1] : "";
  }
  function dash(path) {
    var r = ref();
    return r ? "https://supabase.com/dashboard/project/" + r + path : "";
  }

  /* ---------------- загрузка заготовок ---------------- */
  function need() {
    if (FILES.schema || LOADING) return;
    LOADING = true;
    var one = function (k, f) {
      return fetch("setup/" + f, { cache: "no-cache" })
        .then(function (r) { if (!r.ok) throw new Error(f + ": HTTP " + r.status); return r.text(); })
        .then(function (t) { FILES[k] = t; });
    };
    Promise.all([one("schema", "schema.sql"), one("cron", "cron.sql"), one("worker", "worker.ts")])
      .then(function () { LOADING = false; window.__render(); },
        function (e) { LOADING = false; D.err = e.message; window.__render(); });
  }

  /** Полный SQL: схема и расписание, оба места уже подставлены. */
  function sql() {
    if (!FILES.schema || !FILES.cron) return "";
    var cron = FILES.cron
      .replace(/__PROJECT_URL__/g, String(D.url).replace(/\/+$/, ""))
      .replace(/__ANON_KEY__/g, D.anon || "ВСТАВЬТЕ_ANON_КЛЮЧ");
    return "-- Собрано мастером панели Reseller Web. Выполнять целиком, один раз.\n\n" +
      FILES.schema + "\n\n" + cron;
  }

  /* ---------------- шаги ---------------- */
  function stepBox(n, title, done, body, extra) {
    return '<div class="card' + (done ? " ok" : "") + '">' +
      '<h2><span class="stepn' + (done ? " on" : "") + '">' + (done ? "✓" : n) + "</span>" + esc(title) + "</h2>" +
      (extra || "") + body + "</div>";
  }

  function copyBtn(what, label) {
    return '<button class="btn" data-act="setup-copy" data-what="' + what + '">' +
      ic("ul") + " " + esc(label) + "</button>";
  }

  /** Короткая сводка сверху: что мастер увидел в вашем проекте. */
  function progressNote(st) {
    var left = [];
    if (!st.tables) left.push("шаг 3 — таблицы");
    if (!st.fn) left.push("шаг 4 — воркер");
    else if (!st.secret) left.push("шаг 5 — golden_key");
    if (!left.length) {
      return '<div class="note ok">В проекте уже всё на месте: таблицы, воркер и секрет. ' +
        "Осталось нажать «Включить и проверить» внизу.</div>";
    }
    return '<div class="note">Проверено в вашем проекте. Осталось: <b>' + esc(left.join(", ")) +
      "</b>." + (st.msg ? " Воркер говорит: " + esc(st.msg) : "") + "</div>";
  }

  function view() {
    boot();
    need();

    // Адреса и публичного ключа хватает, чтобы собрать SQL и код воркера.
    // Секретный нужен только на шаге 6, для проверки, — и на странице Supabase
    // он скрыт за «Reveal», так что в скопированное обычно не попадает. Ждать
    // его, чтобы показать шаги 3–5, значило бы упереться на ровном месте.
    var haveBase = !!(D.url && D.anon);
    var haveKeys = !!(haveBase && D.svc);
    var live = DB.settings.driver === "supabase" && DB.settings.sbUrl === D.url;
    var st = D.state || {};

    // Первый заход с готовыми ключами — сразу спрашиваем, что уже сделано.
    if (haveKeys && !D.state && !D.checking) setTimeout(checkAll, 0);

    var h = '<div class="head"><div><h1>Подключение</h1><div class="sub">' +
      "Чтобы в панели были настоящие заказы с FunPay. Всё бесплатно и без карты." +
      "</div></div>" +
      (haveKeys
        ? '<span class="grow"></span><button class="btn" data-act="setup-check"' +
          (D.checking ? " disabled" : "") + ">" + ic("ok") +
          (D.checking ? " Проверяю…" : " Проверить, что уже готово") + "</button>"
        : "") +
      "</div>" +
      (haveKeys && D.state ? progressNote(st) : "");

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

    /* 2 — ключи */
    h += stepBox(2, "Вставить адрес и ключи", haveKeys,
      '<p class="muted">В проекте: <b>Project Settings → API Keys</b>. Выделите страницу целиком, ' +
      "скопируйте и вставьте в поле — адрес и публичный ключ разберутся сами, нажимать ничего " +
      "не нужно.</p>" +
      '<div class="fld" style="margin-top:12px">' +
      '<textarea id="setupPaste" class="code" rows="4" placeholder="Вставьте сюда содержимое страницы API Keys">' +
      esc(D.paste || "") + "</textarea>" +
      '<span class="hint">Ключи остаются в этом браузере. Панель отправляет их только в ваш же проект.</span></div>' +
      (D.url || D.anon || D.svc ? keysTable() : "") +

      // Секретный ключ отдельным полем: на странице Supabase он замаскирован,
      // и сколько её ни копируй, в буфер попадут точки, а не ключ.
      '<div class="fld" style="margin-top:14px"><label>Секретный ключ (service_role / secret)</label>' +
      '<input type="password" id="setupSvc" value="' + esc(D.svc) + '" placeholder="eyJ… или sb_secret_…">' +
      '<span class="hint">На странице Supabase он спрятан — нажмите там <b>Reveal</b> (или ' +
      "«Показать»), скопируйте и вставьте сюда. В SQL он не попадает: расписание ходит с " +
      "публичным ключом. Секретный нужен только для проверки на шаге 6.</span></div>" +

      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">' +
      '<button class="btn" data-act="setup-sniff">' + ic("ok") + " Разобрать вставленное</button>" +
      '<button class="btn" data-act="setup-manual">Ввести по полям</button></div>');

    if (!haveBase) {
      h += '<div class="card"><div class="note">Дальше — как только найдутся <b>адрес проекта</b> и ' +
        "<b>публичный ключ</b>: остальные шаги собираются из них. Секретный на этом этапе не нужен.</div></div>";
      return h;
    }

    /* 3 — SQL */
    h += stepBox(3, "Создать таблицы и расписание", !!st.tables,
      '<p class="muted">Один запрос: таблицы, крон раз в минуту и уборка за ним. Оба места в ' +
      "шаблоне уже подставлены — ничего дописывать не нужно.</p>" +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">' +
      copyBtn("sql", "Скопировать SQL") +
      '<a class="btn pri" href="' + dash("/sql/new") + '" target="_blank" rel="noopener">' +
      ic("link") + " Открыть SQL Editor</a></div>" +
      '<details style="margin-top:12px"><summary class="muted">Посмотреть, что там</summary>' +
      '<pre class="pre">' + esc((sql() || "загружается…").slice(0, 1400)) + "\n…</pre></details>");

    /* 4 — воркер */
    h += stepBox(4, "Выложить воркер", !!st.fn,
      '<p class="muted">Это та часть, которая ходит на FunPay: панель из браузера туда не ' +
      "попадёт никогда. В Supabase: <b>Edge Functions → Deploy a new function</b>, имя строго " +
      "<code>funpay-sync</code>, содержимое — одним файлом.</p>" +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">' +
      copyBtn("worker", "Скопировать код воркера") +
      '<a class="btn pri" href="' + dash("/functions") + '" target="_blank" rel="noopener">' +
      ic("link") + " Открыть Edge Functions</a></div>");

    /* 5 — golden_key */
    h += stepBox(5, "Отдать воркеру cookie сессии", !!(st.fn && st.secret),
      '<p class="muted">Воркеру нужен <code>golden_key</code> — cookie сессии FunPay. Берётся ' +
      "в браузере на funpay.com: <b>F12 → Application → Cookies → funpay.com → golden_key</b>.</p>" +
      '<div class="note warn">Вставляйте его в Supabase напрямую, не сюда. Это ключ от аккаунта: ' +
      "у кого он есть, тот читает вашу переписку и правит ваши лоты. Через панель он не проходит " +
      "и в ней не хранится.</div>" +
      '<p class="muted" style="margin-top:10px">В разделе секретов добавьте имя ' +
      "<code>FUNPAY_GOLDEN_KEY</code> и значение.</p>" +
      '<div style="margin-top:12px"><a class="btn pri" href="' + dash("/settings/functions") +
      '" target="_blank" rel="noopener">' + ic("lock") + " Открыть секреты функций</a></div>");

    /* 6 — включить и проверить */
    h += stepBox(6, "Включить и проверить", live,
      '<p class="muted">Панель переключится на вашу базу и попросит воркер сделать сухой прогон: ' +
      "он прочитает FunPay и покажет, что разобрал, <b>ничего не записав</b>. Это единственный " +
      "способ убедиться, что разбор попал в вашу вёрстку — ваши заказы видны только вам.</p>" +
      (D.svc ? "" : '<div class="note warn">Для этого шага нужен <b>секретный ключ</b>: им панель ' +
        "читает вашу базу и спрашивает воркер. Вернитесь к шагу 2 — поле под таблицей.</div>") +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">' +
      '<button class="btn pri" data-act="setup-go"' + (D.probing || !D.svc ? " disabled" : "") + ">" +
      ic("bolt") + (D.probing ? " Проверяю…" : " Включить и проверить") + "</button>" +
      (live ? '<span class="pill ok" style="align-self:center">панель уже на этой базе</span>' : "") +
      "</div>" + probeBox());

    return h;
  }

  function keysTable() {
    var row = function (t, v, ok) {
      return "<tr><td>" + esc(t) + "</td><td>" +
        (v ? '<span class="pill ok">' + esc(ok) + "</span>" : '<span class="pill mute">нет</span>') +
        '</td><td class="t-title muted">' + esc(v ? short(v) : "—") + "</td></tr>";
    };
    return '<div class="tw" style="margin-top:12px"><table><tbody>' +
      row("Адрес проекта", D.url, "есть") +
      row("Публичный ключ (anon)", D.anon, "есть") +
      row("Секретный ключ (service_role)", D.svc, "есть") +
      "</tbody></table></div>";
  }

  function short(v) {
    v = String(v);
    return v.length > 34 ? v.slice(0, 16) + "…" + v.slice(-8) : v;
  }

  /* ---------------- разбор ответа сухого прогона ---------------- */
  function probeBox() {
    var p = D.probe;
    if (!p) return "";
    if (p.kind === "err") {
      return '<div class="note err" style="margin-top:12px"><b>Не вышло.</b> ' + esc(p.msg) +
        (p.hint ? "<br><br>" + p.hint : "") + "</div>";
    }
    var d = p.data || {};
    var n = d["заказовНайдено"];
    if (!n) {
      return '<div class="note warn" style="margin-top:12px"><b>Воркер отвечает, но заказов не ' +
        "нашёл.</b> Либо продаж пока нет, либо FunPay отдал страницу не так, как ждёт разбор. " +
        "Полный ответ ниже.</div>" + dump(d);
    }
    var rows = (d["заказы"] || []).map(function (o) {
      return "<tr><td>" + esc(o.external_id || "—") + "</td>" +
        '<td class="t-title">' + esc((o.title_raw || "—").slice(0, 40)) + "</td>" +
        "<td>" + esc(o.buyer_name || "—") + "</td>" +
        "<td>" + esc(o.status || "") + "</td>" +
        "<td>" + esc((o.amount != null ? o.amount : "") + " " + (o.currency || "")) + "</td>" +
        "<td>" + esc((o.created_at || "—").slice(0, 16).replace("T", " ")) + "</td></tr>";
    }).join("");
    var bad = d["неразобранныхЯчеек"];
    return '<div class="note ok" style="margin-top:12px"><b>Работает: заказов ' + esc(n) +
      ".</b> В базу пока ничего не записано — это сухой прогон. Крон из шага 3 запишет сам, " +
      "в течение минуты.</div>" +
      '<div class="tw" style="margin-top:10px"><table><thead><tr><th>заказ</th><th>товар</th>' +
      "<th>покупатель</th><th>статус</th><th>сумма</th><th>дата</th></tr></thead><tbody>" +
      rows + "</tbody></table></div>" +
      (bad ? '<div class="note warn" style="margin-top:10px">Не разобралось ячеек: ' + esc(bad) +
        ". Вёрстка FunPay отличается от ожидаемой. В полном ответе ниже есть сырые ячейки — " +
        "по ним правится <code>FIELD</code> в начале воркера.</div>" + dump(d) : "");
  }

  function dump(d) {
    return '<details style="margin-top:10px"><summary class="muted">Полный ответ воркера</summary>' +
      '<pre class="pre">' + esc(JSON.stringify(d, null, 2)) + "</pre></details>";
  }

  /* ---------------- разбор вставленного ----------------
     Раньше здесь была кнопка «Разобрать», и это оказалось ловушкой: человек
     вставляет текст, ничего не происходит, и непонятно, что дальше. Теперь
     разбор идёт сам на вставку, а кнопка осталась как запасной путь. */
  function absorb(text, loud) {
    D.paste = text;
    var got = sniff(text);
    var added = (got.url && got.url !== D.url) || (got.anon && got.anon !== D.anon) ||
      (got.svc && got.svc !== D.svc);
    if (got.url) D.url = got.url;
    if (got.anon) D.anon = got.anon;
    if (got.svc) D.svc = got.svc;
    saveDraft();

    if (!added) {
      if (loud) toast("В этом тексте ни адреса, ни ключей не нашлось", "err");
      return false;
    }
    window.__render();
    var miss = [];
    if (!D.url) miss.push("адрес проекта");
    if (!D.anon) miss.push("публичный ключ");
    if (miss.length) toast("Не хватает: " + miss.join(", "), "warn");
    else if (!D.svc) toast("Адрес и публичный ключ есть. Секретный — в поле ниже", "ok");
    else toast("Всё нашлось", "ok");
    return true;
  }

  // Слушатель вешается один раз на документ: панель перерисовывает разметку
  // целиком, и обработчик на самом поле не пережил бы первую же перерисовку.
  document.addEventListener("input", function (e) {
    var t = e.target;
    if (!t || !t.id) return;
    if (t.id === "setupPaste") { absorb(t.value, false); return; }
    if (t.id === "setupSvc") {
      // Перерисовку тут не зовём — иначе фокус улетит на середине вставки.
      D.svc = t.value.trim();
      saveDraft();
      var box = document.querySelector('[data-act="setup-go"]');
      if (box) box.disabled = !D.svc || D.probing;
    }
  });

  // Поле секретного ключа: разблокировать шаг 6 надо сразу, но перерисовать —
  // только когда человек из поля вышел.
  document.addEventListener("change", function (e) {
    if (e.target && e.target.id === "setupSvc") window.__render();
  });

  /* ---------------- действия ---------------- */
  function act(a, el) {
    if (a === "setup-sniff") {
      var ta = document.getElementById("setupPaste");
      return absorb(ta ? ta.value : "", true);
    }

    if (a === "setup-check") { D.state = null; window.__render(); return checkAll(); }

    if (a === "setup-manual") return manual();

    if (a === "setup-copy") {
      var what = el ? el.getAttribute("data-what") : "";
      var text = what === "sql" ? sql() : FILES.worker || "";
      if (!text) return toast("Заготовка ещё не загрузилась", "err");
      return copy(text, what === "sql" ? "SQL скопирован" : "Код воркера скопирован");
    }

    if (a === "setup-go") return go();
  }

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

  function manual() {
    if (!window.__modal) return toast("Вставьте текст в поле выше", "warn");
    window.__modal({
      title: "Адрес и ключи по полям",
      wide: true,
      body:
        '<div class="fld"><label>Адрес проекта</label>' +
        '<input type="text" id="mUrl" value="' + esc(D.url) + '" placeholder="https://xxxx.supabase.co"></div>' +
        '<div class="fld" style="margin-top:10px"><label>Публичный ключ (anon / publishable)</label>' +
        '<input type="text" id="mAnon" value="' + esc(D.anon) + '"></div>' +
        '<div class="fld" style="margin-top:10px"><label>Секретный ключ (service_role / secret)</label>' +
        '<input type="password" id="mSvc" value="' + esc(D.svc) + '">' +
        '<span class="hint">Публичный уходит в SQL расписания, секретный — только в этот браузер.</span></div>',
      onOk: function (ov) {
        var g = function (id) { var e = ov.querySelector("#" + id); return e ? e.value.trim() : ""; };
        D.url = g("mUrl").replace(/\/+$/, ""); D.anon = g("mAnon"); D.svc = g("mSvc");
        saveDraft();
        window.__closeModal();
        window.__render();
        toast("Записал", "ok");
      },
    });
  }

  /** Включить базу и попросить воркер о сухом прогоне. */
  function go() {
    if (!D.url || !D.svc) return toast("Нужны адрес и секретный ключ", "err");

    var s = Object.assign({}, DB.settings, { driver: "supabase", sbUrl: D.url, sbKey: D.svc });
    DB.useSettings(s);

    D.probing = true; D.probe = null; window.__render();

    var finish = function (probe) {
      D.probing = false; D.probe = probe; window.__render();
    };

    DB.loadAll().then(function () {
      if (window.__startLive) window.__startLive();
    }, function (e) {
      // База не прочиталась — почти всегда это «шаг 3 ещё не выполнен».
      finish({
        kind: "err", msg: e.message,
        hint: /404|does not exist|relation/i.test(e.message)
          ? "Похоже, таблиц ещё нет: вернитесь к шагу 3 и выполните SQL."
          : "Проверьте адрес и секретный ключ из шага 2.",
      });
      throw e;
    }).then(function () {
      return fetch(D.url.replace(/\/+$/, "") + "/functions/v1/funpay-sync?dry=1", {
        headers: { Authorization: "Bearer " + D.svc, apikey: D.svc },
      });
    }).then(function (r) {
      return r.text().then(function (t) {
        var j = null;
        try { j = JSON.parse(t); } catch (e) { /* не JSON — покажем как есть */ }
        if (r.status === 404) {
          return finish({
            kind: "err", msg: "воркер не найден (404)",
            hint: "Вернитесь к шагу 4: функция должна называться строго <code>funpay-sync</code>.",
          });
        }
        if (j && j.ok === false) {
          var m = String(j["ошибка"] || "неизвестная ошибка");
          var hint = /golden_key|гостю|форму входа/i.test(m)
            ? "Это шаг 5: секрет <code>FUNPAY_GOLDEN_KEY</code> не задан или ключ уже истёк."
            : /защитную проверку/i.test(m)
            ? "FunPay не пускает адреса дата-центров. Этот путь для вас закрыт — остаётся автопуш с телефона."
            : /вёрстка изменилась/i.test(m)
            ? "FunPay переделал страницу. Нужно поправить <code>FIELD</code> в начале воркера."
            : "";
          return finish({ kind: "err", msg: m, hint: hint });
        }
        if (!j) return finish({ kind: "err", msg: "воркер ответил не JSON: " + t.slice(0, 200) });
        return finish({ kind: "ok", data: j });
      });
    }).catch(function (e) {
      if (D.probing) {
        finish({
          kind: "err", msg: e.message,
          hint: "Если написано про сеть или CORS — проверьте, что воркер из шага 4 выложен.",
        });
      }
    });
  }

  window.__setupView = view;
  window.__setupAct = act;
})();
