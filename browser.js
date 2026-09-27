/**
 * Вкладка «Браузер»: работа с FunPay не выходя из панели.
 *
 * В телефоне это встроенное окно: приложение показывает FunPay внутри себя
 * и живёт с его сессией. На сайте так нельзя, и не из-за лени — FunPay
 * запрещает себя встраивать:
 *
 *     X-Frame-Options: DENY
 *
 * Никакая рамка на чужом домене его не покажет. Зато у нас есть расширение,
 * а у него права на вкладки: панель умеет открыть нужный раздел, вернуть
 * фокус на уже открытую вкладку и показать, вошли ли вы и что там сейчас.
 *
 * Плюс отдельное окно — обычное окно браузера нужного размера. Оно и
 * оказывается ближе всего к тому, что было в телефоне.
 */
(function () {
  "use strict";

  var R = window.RS, esc = R.esc;
  var ic = function (n, c) { return window.__ic ? window.__ic(n, c) : ""; };
  var toast = function (t, k) { if (window.__toast) window.__toast(t, k); };

  var РАЗДЕЛЫ = [
    { имя: "Заказы", адрес: "https://funpay.com/orders/trade", значок: "cart",
      зачем: "Продажи — отсюда расширение и забирает их в базу" },
    { имя: "Сообщения", адрес: "https://funpay.com/chat/", значок: "chat",
      зачем: "Переписка с покупателями" },
    { имя: "Мои лоты", адрес: "https://funpay.com/lots/trade", значок: "tag",
      зачем: "Ваши предложения: цены, наличие, подъём" },
    { имя: "Профиль", адрес: "https://funpay.com/users/", значок: "chart",
      зачем: "Отзывы и рейтинг" },
    { имя: "Баланс", адрес: "https://funpay.com/account/balance", значок: "key",
      зачем: "Деньги и вывод" },
  ];

  var СОСТ = {
    вкладки: null, ждём: false, ошибка: "",
    // Окно с FunPay внутри панели.
    страница: null, путь: "/orders/trade", грузим: false, бедаОкна: "",
  };

  /**
   * Показ страницы FunPay внутри панели.
   *
   * Живой рамкой этого не сделать: FunPay запрещает встраивание
   * (X-Frame-Options: DENY), а его cookie идут с политикой Lax — в рамке на
   * чужом домене они бы не отправились, и внутри оказался бы гость. Снимать
   * и то и другое значило бы ослабить защиту ваших же сессий.
   *
   * Поэтому разметку читает расширение из вкладки funpay.com — там запрос
   * свой и сессия при нём, — а панель показывает её в песочнице:
   *
   *   sandbox без allow-scripts  — чужой код не выполняется вовсе;
   *   base href                  — картинки и стили грузятся как на сайте;
   *   srcdoc                     — никакого отдельного запроса из панели.
   *
   * Это окно для чтения. Нажимать внутри нельзя — песочница не пускает
   * переходы, и это правильно: иначе один неверный клик уводил бы страницу
   * чёрт знает куда внутри вашей панели.
   */
  function окно() {
    if (СОСТ.бедаОкна) {
      return '<div class="note warn">Окно не открылось: ' + esc(СОСТ.бедаОкна) +
        (/вкладок/i.test(СОСТ.бедаОкна)
          ? " Откройте funpay.com в соседней вкладке — оттуда расширение и читает страницу."
          : "") + "</div>";
    }
    if (СОСТ.грузим || !СОСТ.страница) {
      return '<div class="note">' + (СОСТ.грузим ? "Читаю страницу FunPay…" : "Нажмите раздел выше — покажу его здесь.") + "</div>";
    }
    var с = СОСТ.страница;
    var внутри = '<base href="https://funpay.com/">' +
      '<style>body{margin:0}</style>' + с.html;
    return (с.вошли
      ? '<div class="sub" style="margin-bottom:8px">' + esc(с.адрес) + " · " +
        esc(Math.round(с.размер / 1024)) + " КБ · вы вошли</div>"
      : '<div class="note warn">FunPay отдал эту страницу как гостю. Откройте funpay.com ' +
        "в соседней вкладке и войдите.</div>") +
      '<iframe class="fpwin" sandbox referrerpolicy="no-referrer" srcdoc="' +
      esc(внутри) + '"></iframe>' +
      '<div class="note" style="margin-top:10px">Окно только показывает: нажимать внутри нельзя, ' +
      "ссылки в песочнице не работают. Чтобы что-то сделать — кнопки разделов выше открывают " +
      "настоящую вкладку.</div>";
  }

  /** Спросить расширение. Мост живёт в ext.js — переиспользуем его. */
  function спросить(cmd, data) {
    if (!window.__extЗапрос) return Promise.reject(new Error("расширение не найдено"));
    return window.__extЗапрос(cmd, data);
  }

  function обновить() {
    if (СОСТ.ждём) return;
    СОСТ.ждём = true;
    спросить("tabs").then(function (r) {
      СОСТ.ждём = false; СОСТ.вкладки = (r && r.вкладки) || []; СОСТ.ошибка = "";
      window.__render();
    }, function (e) {
      СОСТ.ждём = false; СОСТ.ошибка = e.message; СОСТ.вкладки = null;
      window.__render();
    });
  }

  /** Профиль открываем по своему номеру, если он известен. */
  function адресРаздела(р) {
    if (р.адрес !== "https://funpay.com/users/") return р.адрес;
    var uid = (R.DB.get("accounts")[0] || {}).external_id;
    return uid ? "https://funpay.com/users/" + uid + "/" : "https://funpay.com/";
  }

  function карточкаВкладок() {
    if (СОСТ.ошибка) {
      return '<div class="note warn">Расширение не отвечает: ' + esc(СОСТ.ошибка) +
        ". Вкладку «Расширение» стоит открыть и проверить.</div>";
    }
    if (!СОСТ.вкладки) return '<div class="note">Спрашиваю расширение…</div>';
    if (!СОСТ.вкладки.length) {
      return '<div class="note">Вкладок FunPay сейчас нет. Пока их нет, расширение не сверяется — ' +
        "оно читает заказы изнутри такой вкладки, её сессией.</div>";
    }
    return '<div class="tw"><table><tbody>' +
      СОСТ.вкладки.map(function (в) {
        var путь = String(в.адрес || "").replace(/^https:\/\/funpay\.com/, "") || "/";
        return "<tr><td>" + (в.активна ? '<span class="pill ok">на виду</span>'
          : '<span class="pill mute">в фоне</span>') + "</td>" +
          '<td class="t-title">' + esc(путь) + "</td>" +
          '<td class="acts"><button class="btn sm" data-act="br-focus" data-url="' +
          esc(в.адрес) + '">Показать</button></td></tr>';
      }).join("") +
      "</tbody></table></div>";
  }

  function view() {
    if (!СОСТ.вкладки && !СОСТ.ждём && !СОСТ.ошибка) setTimeout(обновить, 0);

    var h = '<div class="head"><div><h1>Браузер</h1><div class="sub">' +
      "FunPay под рукой: открыть нужный раздел и видеть, что открыто." +
      '</div></div><span class="grow"></span>' +
      '<button class="btn" data-act="br-refresh">' + ic("ok") + " Обновить</button></div>";

    h += '<div class="card"><h2>' + ic("link") + " Разделы FunPay</h2>" +
      '<p class="muted">Открывается в вашем браузере, вашей же сессией — той самой, из которой ' +
      "расширение и забирает заказы.</p>" +
      '<div class="chips2" style="margin-top:12px">' +
      РАЗДЕЛЫ.map(function (р) {
        var адрес = адресРаздела(р);
        var путь = адрес.replace(/^https:\/\/funpay\.com/, "") || "/";
        // Нажатие показывает раздел здесь же; стрелка открывает настоящую
        // вкладку — для всего, что нужно нажимать.
        return '<span class="pair">' +
          '<button class="btn" data-act="br-show" data-url="' + esc(путь) + '" ' +
          'title="' + esc(р.зачем) + '">' + ic(р.значок) + " " + esc(р.имя) + "</button>" +
          '<button class="btn icon" data-act="br-open" data-url="' + esc(адрес) + '" ' +
          'title="Открыть настоящей вкладкой">' + ic("link") + "</button></span>";
      }).join("") +
      "</div>" +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">' +
      '<button class="btn pri" data-act="br-window">' + ic("box") + " Открыть отдельным окном</button>" +
      "</div>" +
      '<div class="note" style="margin-top:12px">Отдельное окно — это обычное окно браузера ' +
      "нужного размера: ближе всего к тому, как сделано в телефоне. Встроить FunPay прямо " +
      "в страницу нельзя, он это запрещает заголовком <code>X-Frame-Options: DENY</code>.</div>" +
      "</div>";

    h += '<div class="card"><h2>' + ic("box") + " FunPay здесь" +
      '<span class="grow"></span>' +
      '<button class="btn sm" data-act="br-page" data-url="' + esc(СОСТ.путь) + '">' +
      ic("ok") + " Обновить окно</button></h2>" +
      окно() + "</div>";

    h += '<div class="card"><h2>' + ic("list") + " Открытые вкладки FunPay</h2>" +
      карточкаВкладок() + "</div>";

    return h;
  }

  /** Показать раздел в окне панели. */
  function показать(путь) {
    СОСТ.путь = путь || СОСТ.путь;
    СОСТ.грузим = true; СОСТ.бедаОкна = ""; window.__render();
    return спросить("page", { путь: СОСТ.путь }).then(function (с) {
      СОСТ.грузим = false; СОСТ.страница = с;
      window.__render();
    }, function (e) {
      СОСТ.грузим = false; СОСТ.бедаОкна = e.message; СОСТ.страница = null;
      window.__render();
    });
  }

  function act(a, el) {
    if (a === "br-refresh") { СОСТ.вкладки = null; СОСТ.ошибка = ""; window.__render(); return обновить(); }

    if (a === "br-page") {
      var п = el ? el.getAttribute("data-url") : СОСТ.путь;
      return показать(п);
    }

    if (a === "br-show") {
      var адрес = el ? el.getAttribute("data-url") : "";
      return показать(String(адрес).replace(/^https:\/\/funpay\.com/, "") || "/");
    }

    if (a === "br-open" || a === "br-focus") {
      var адрес = el ? el.getAttribute("data-url") : "";
      if (!адрес) return;
      return спросить("open", { адрес: адрес }).then(function (r) {
        if (r && r.ok === false) return toast("Не вышло: " + (r.причина || ""), "err");
        СОСТ.вкладки = null;
        setTimeout(обновить, 400);
      }, function (e) {
        // Расширения нет — открываем сами, обычной ссылкой.
        window.open(адрес, "_blank", "noopener");
        toast("Расширение не ответило (" + e.message + ") — открыл обычной вкладкой", "warn");
      });
    }

    if (a === "br-window") {
      var u = адресРаздела(РАЗДЕЛЫ[0]);
      // Отдельное окно, а не вкладка: так оно не теряется среди прочих и
      // ведёт себя как окно браузера в мобильном приложении.
      var окно = window.open(u, "funpay", "width=1180,height=860,noopener");
      if (!окно) toast("Браузер заблокировал окно — разрешите всплывающие для этого сайта", "warn");
      return;
    }
  }

  window.__browserView = view;
  window.__browserAct = act;

  if (window.__render) window.__render();
})();
