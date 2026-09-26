/**
 * Вкладка «Расширение»: панель видит расширение Chrome и управляет им.
 *
 * Сам браузер в страницу не встроить — расширения в веб-страницу не ставятся,
 * а FunPay вдобавок запрещает себя показывать в рамке (X-Frame-Options: DENY).
 * Зато можно обратное: расширение подсаживает на страницы панели скрипт-мост,
 * и отсюда видно его состояние, настройки и кнопка «синхронизировать».
 *
 * Разговор через window.postMessage: у распакованного расширения свой
 * идентификатор на каждой машине, и знать его панель не может.
 */
(function () {
  "use strict";

  var R = window.RS, DB = R.DB, esc = R.esc;
  var ic = function (n, c) { return window.__ic ? window.__ic(n, c) : ""; };
  var toast = function (t, k) { if (window.__toast) window.__toast(t, k); };

  var СВОЙ = { есть: false, версия: "", статус: null, ждём: false, ошибка: "" };
  var счётчик = 0;
  var ожидают = {};

  /* ---------------- обмен с расширением ---------------- */

  window.addEventListener("message", function (e) {
    if (e.source !== window) return;
    var m = e.data;
    if (!m || !m.__rs) return;

    if (m.__rs === "hello") {
      var впервые = !СВОЙ.есть;
      СВОЙ.есть = true;
      СВОЙ.версия = m["версия"] || "";
      if (впервые) спросить();
      return;
    }
    if (m.__rs === "res" && ожидают[m.id]) {
      var f = ожидают[m.id];
      delete ожидают[m.id];
      f(m.ok, m.data);
    }
  });

  /** Расширение могло объявиться до того, как панель начала слушать. */
  function проверитьМетку() {
    var v = document.documentElement.getAttribute("data-rs-ext");
    if (v && !СВОЙ.есть) { СВОЙ.есть = true; СВОЙ.версия = v; return true; }
    return false;
  }

  function спросить(cmd, data) {
    cmd = cmd || "status";
    if (!СВОЙ.есть && !проверитьМетку()) return Promise.reject(new Error("расширение не найдено"));
    return new Promise(function (resolve, reject) {
      var id = ++счётчик;
      // Расширение могло быть выключено между проверками — не ждём вечно.
      var время = setTimeout(function () {
        delete ожидают[id];
        reject(new Error("расширение не ответило"));
      }, 4000);
      ожидают[id] = function (ok, d) {
        clearTimeout(время);
        ok ? resolve(d) : reject(new Error(String(d)));
      };
      window.postMessage({ __rs: "req", id: id, cmd: cmd, data: data || {} }, location.origin);
    });
  }

  function обновить() {
    if (СВОЙ.ждём) return;
    СВОЙ.ждём = true;
    спросить("status").then(function (s) {
      СВОЙ.ждём = false; СВОЙ.статус = s; СВОЙ.ошибка = "";
      window.__render();
    }, function (e) {
      СВОЙ.ждём = false; СВОЙ.ошибка = e.message;
      window.__render();
    });
  }

  /* ---------------- отрисовка ---------------- */

  function давно(iso) {
    if (!iso) return "—";
    var сек = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
    if (сек < 60) return "только что";
    if (сек < 3600) return Math.round(сек / 60) + " мин назад";
    if (сек < 86400) return Math.round(сек / 3600) + " ч назад";
    return new Date(iso).toLocaleDateString("ru-RU");
  }

  function неУстановлено() {
    return '<div class="card"><h2>' + ic("warn") + " Расширение не найдено</h2>" +
      '<p class="muted">Оно и носит заказы с FunPay в базу. Ключ FunPay ему не нужен: работает ' +
      "в вашем же браузере, где вы уже вошли.</p>" +
      '<div class="note">Почему не сервер: FunPay не признаёт сессию с адреса дата-центра — ' +
      "отвечает <code>200</code>, отдаёт нормальную страницу и считает гостем. С домашнего " +
      "адреса та же последовательность входит. Это измерено на живом аккаунте.</div>" +
      '<ol class="steps"><li>Скачать архив и распаковать в постоянную папку.</li>' +
      "<li><code>chrome://extensions</code> → включить <b>Режим разработчика</b>.</li>" +
      "<li><b>Загрузить распакованное расширение</b> → указать эту папку.</li>" +
      "<li>Вернуться сюда и обновить страницу.</li></ol>" +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">' +
      '<a class="btn pri" href="setup/reseller-funpay-ext.zip" download>' + ic("dl") +
      " Скачать расширение</a>" +
      '<button class="btn" data-act="ext-refresh">' + ic("ok") + " Проверить ещё раз</button></div>" +
      (СВОЙ.ошибка ? '<div class="note warn" style="margin-top:12px">' + esc(СВОЙ.ошибка) +
        ". Если расширение только что поставили — обновите страницу целиком.</div>" : "") +
      "</div>";
  }

  function карточкаСостояния(s) {
    var c = s["состояние"];
    if (!c) {
      return '<div class="note">Сверок ещё не было. Откройте вкладку ' +
        '<a href="https://funpay.com/orders/trade" target="_blank" rel="noopener">funpay.com</a> — ' +
        "расширение синхронизируется само.</div>";
    }
    if (!c.ok) {
      return '<div class="note err"><b>Последняя сверка не удалась.</b><br>' +
        esc(c["причина"] || "причина неизвестна") +
        '<div class="sub" style="margin-top:6px">' + давно(c["когда"]) + "</div>" +
        (c["сырые"] ? '<pre class="pre">' + esc(JSON.stringify(c["сырые"], null, 1)) + "</pre>" : "") +
        "</div>";
    }
    var q = c["качество"] || {};
    var плохо = (q["всего"] || 0) - Math.min(q["сПокупателем"] || 0, q["сДатой"] || 0);
    return '<div class="note ' + (плохо ? "warn" : "ok") + '">' +
      "<b>" + (плохо ? "Работает, но не всё разобралось" : "Работает") + "</b>" +
      '<div class="tw" style="margin-top:8px"><table><tbody>' +
      "<tr><td>нашлось заказов</td><td>" + esc(q["всего"] || 0) + "</td></tr>" +
      "<tr><td>записано</td><td>" + esc(c["записано"] || 0) + "</td></tr>" +
      (плохо ? "<tr><td>не разобралось ячеек</td><td>" + esc(плохо) + "</td></tr>" : "") +
      "<tr><td>последняя сверка</td><td>" + esc(давно(c["когда"])) + "</td></tr>" +
      "</tbody></table></div>" +
      (плохо && c["сырые"]
        ? '<details style="margin-top:8px"><summary class="muted">Сырые ячейки</summary>' +
          '<pre class="pre">' + esc(JSON.stringify(c["сырые"], null, 1)) + "</pre></details>"
        : "") +
      "</div>";
  }

  function view() {
    if (!СВОЙ.есть) проверитьМетку();
    if (СВОЙ.есть && !СВОЙ.статус && !СВОЙ.ждём) setTimeout(обновить, 0);

    var h = '<div class="head"><div><h1>Расширение</h1><div class="sub">' +
      "Оно носит заказы с FunPay в вашу базу, а панель их показывает." +
      "</div></div><span class=\"grow\"></span>" +
      (СВОЙ.есть
        ? '<button class="btn" data-act="ext-refresh">' + ic("ok") + " Обновить</button>"
        : "") +
      "</div>";

    if (!СВОЙ.есть) return h + неУстановлено();

    var s = СВОЙ.статус;
    if (!s) return h + '<div class="card"><p class="muted">Спрашиваю расширение…</p></div>';

    var свои = DB.settings;
    var чужойПроект = s["настроено"] && свои.sbUrl &&
      String(s["адрес"]).replace(/\/+$/, "") !== String(свои.sbUrl).replace(/\/+$/, "");

    h += '<div class="card"><h2>' + ic("bolt") + " Состояние</h2>" +
      '<div class="sub" style="margin-bottom:10px">Версия ' + esc(СВОЙ.версия) + "</div>" +
      карточкаСостояния(s) +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">' +
      '<button class="btn pri" data-act="ext-sync">' + ic("bolt") + " Синхронизировать сейчас</button>" +
      '<button class="btn" data-act="ext-deep">' + ic("dl") + " Загрузить всю историю</button>" +
      '<a class="btn" href="https://funpay.com/orders/trade" target="_blank" rel="noopener">' +
      ic("link") + " Открыть FunPay</a></div>" +
      '<div class="note" style="margin-top:12px">Обычная сверка берёт только первую страницу ' +
      "заказов — там всё свежее. <b>Загрузить всю историю</b> дочитывает FunPay до конца: это " +
      "делается один раз, идёт минутами, и от него зависят цифры за месяц и за всё время.</div>" +
      '<div class="note" style="margin-top:8px">Сверка идёт, пока открыта хотя бы одна вкладка ' +
      "funpay.com. Все закрыты — расширение подхватит при следующем открытии, ничего не " +
      "потеряется.</div></div>";

    /* подключение расширения к тому же проекту */
    h += '<div class="card"><h2>' + ic("link") + " Подключение</h2>" +
      '<div class="tw"><table><tbody>' +
      "<tr><td>проект</td><td>" + (s["настроено"]
        ? '<span class="pill ok">задан</span> <span class="muted">' + esc(s["адрес"]) + "</span>"
        : '<span class="pill mute">не задан</span>') + "</td></tr>" +
      "<tr><td>вход</td><td>" + (s["вошли"]
        ? '<span class="pill ok">выполнен</span> <span class="muted">' + esc(s["почта"] || "") + "</span>"
        : '<span class="pill mute">нет</span>') + "</td></tr>" +
      "</tbody></table></div>" +
      (чужойПроект
        ? '<div class="note warn" style="margin-top:12px">Расширение смотрит в <b>другой</b> ' +
          "проект, не в тот, что открыт в панели. Заказы поедут не сюда.</div>"
        : "") +
      (!s["настроено"] || !s["вошли"] || чужойПроект
        ? '<p class="muted" style="margin-top:12px">Не вводите всё заново: панель может передать ' +
          "расширению свой адрес, публичный ключ и текущий вход. Всё остаётся внутри этого " +
          "браузера.</p>" +
          '<div style="margin-top:10px"><button class="btn pri" data-act="ext-adopt">' +
          ic("ok") + " Передать настройки из панели</button></div>"
        : '<div class="note ok" style="margin-top:12px">Расширение и панель смотрят в один ' +
          "проект и вошли под одним пользователем.</div>") +
      "</div>";

    /* расписание */
    h += '<div class="card"><h2>' + ic("gear") + " Расписание</h2>" +
      '<div class="fld"><label>Сверять заказы каждые</label>' +
      '<select id="extInterval">' +
      [["1", "1 минуту"], ["3", "3 минуты"], ["5", "5 минут"], ["10", "10 минут"],
       ["30", "30 минут"], ["0", "только вручную"]].map(function (o) {
        return '<option value="' + o[0] + '"' +
          (String(s["интервал"]) === o[0] ? " selected" : "") + ">" + o[1] + "</option>";
      }).join("") + "</select>" +
      '<span class="hint">Считается только время с открытой вкладкой FunPay.</span></div>' +
      '<div style="margin-top:10px"><button class="btn" data-act="ext-save">' + ic("ok") +
      " Сохранить</button></div></div>";

    return h;
  }

  /* ---------------- действия ---------------- */

  function act(a) {
    if (a === "ext-refresh") {
      СВОЙ.статус = null;
      if (!СВОЙ.есть) проверитьМетку();
      window.__render();
      return обновить();
    }
    if (a === "ext-deep") {
      return спросить("sync", { страниц: 200 }).then(function () {
        toast("Читаю историю — это займёт минуты. Значок покажет прогресс.", "ok");
        // Глубокий проход долгий: обновляем состояние несколько раз подряд.
        [5000, 20000, 60000, 120000].forEach(function (мс) {
          setTimeout(function () { СВОЙ.статус = null; обновить(); }, мс);
        });
      }, function (e) { toast("Не вышло: " + e.message, "err"); });
    }
    if (a === "ext-sync") {
      return спросить("sync").then(function () {
        toast("Попросил расширение свериться", "ok");
        // Результат появляется не мгновенно: даём вкладке сходить на FunPay.
        setTimeout(function () { СВОЙ.статус = null; обновить(); }, 2500);
      }, function (e) { toast("Не вышло: " + e.message, "err"); });
    }
    if (a === "ext-save") {
      var el = document.getElementById("extInterval");
      var м = el ? Number(el.value) : NaN;
      if (isNaN(м)) return toast("Не выбрано значение", "err");
      return спросить("setSettings", { "интервал": м }).then(function () {
        toast("Сохранено", "ok");
        СВОЙ.статус = null; обновить();
      }, function (e) { toast("Не вышло: " + e.message, "err"); });
    }
    if (a === "ext-adopt") {
      var st = DB.settings, A = R.AUTH;
      if (!st.sbUrl || !st.sbKey) return toast("Сначала настройте панель во вкладке «Подключение»", "err");
      return спросить("adopt", {
        url: st.sbUrl, anon: st.sbKey, email: A.email,
        token: A.token, refresh: A.refresh, at: A.at,
      }).then(function () {
        toast("Настройки переданы расширению", "ok");
        СВОЙ.статус = null; обновить();
      }, function (e) { toast("Не вышло: " + e.message, "err"); });
    }
  }

  window.__extView = view;
  window.__extAct = act;

  // Панель могла отрисоваться раньше, чем загрузился этот файл.
  if (window.__render) window.__render();
})();
