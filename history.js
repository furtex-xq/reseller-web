/**
 * Вкладка «История»: деньги по периодам, состояния заказов и отзывы.
 *
 * Считается прямо здесь, из уже загруженных заказов, а не запросом к базе.
 * Причина простая: панель и так держит все заказы в памяти для остальных
 * вкладок, и лишний поход за теми же числами только добавил бы задержку и
 * ещё одно место, где цифры могут разойтись.
 *
 * Представления `v_money`, `v_orders_state` и `v_ratings` из миграции 0004
 * остаются для SQL Editor — когда хочется посчитать то же самое руками.
 */
(function () {
  "use strict";

  var R = window.RS, DB = R.DB, esc = R.esc, money = R.money, num = R.num;
  var ic = function (n, c) { return window.__ic ? window.__ic(n, c) : ""; };

  var СУТКИ = 86400000;
  var ПЕРИОДЫ = [
    { имя: "За сутки", мс: СУТКИ },
    { имя: "За неделю", мс: 7 * СУТКИ },
    { имя: "За месяц", мс: 30 * СУТКИ },
    { имя: "За всё время", мс: Infinity },
  ];

  function валюта() {
    return (DB.settings && DB.settings.currency) || "RUB";
  }

  /**
   * Деньги за период.
   *
   * Возвраты в выручку не идут: иначе цифра врёт в свою пользу. Считаем их
   * отдельно — потерянное тоже полезно видеть.
   */
  function заПериод(заказы, мс, сейчас) {
    var порог = мс === Infinity ? -Infinity : сейчас - мс;
    var выручка = 0, возвращено = 0, штук = 0, возвратов = 0;
    заказы.forEach(function (o) {
      var t = new Date(o.created_at).getTime();
      if (!isFinite(t) || t < порог) return;
      var сумма = Number(o.amount) || 0;
      if (o.status === "refunded") { возвращено += сумма; возвратов++; return; }
      выручка += сумма; штук++;
    });
    return {
      выручка: выручка, заказов: штук,
      возвращено: возвращено, возвратов: возвратов,
      средний: штук ? выручка / штук : 0,
    };
  }

  function плитка(п, д) {
    var в = валюта();
    return '<div class="card">' +
      '<div class="sub">' + esc(п.имя) + "</div>" +
      '<div style="font:700 26px/1.2 inherit;margin:6px 0 2px">' + money(д.выручка, в) + "</div>" +
      '<div class="muted" style="font-size:13px">' + num(д.заказов) + " заказ" +
      (д.заказов % 10 === 1 && д.заказов % 100 !== 11 ? "" : д.заказов % 10 >= 2 && д.заказов % 10 <= 4 && (д.заказов % 100 < 10 || д.заказов % 100 >= 20) ? "а" : "ов") +
      (д.заказов ? " · средний " + money(д.средний, в) : "") + "</div>" +
      (д.возвратов
        ? '<div class="muted" style="font-size:12px;margin-top:6px;color:var(--warn)">возвращено ' +
          money(д.возвращено, в) + " · " + num(д.возвратов) + "</div>"
        : "") +
      "</div>";
  }

  var СОСТОЯНИЯ = [
    { ключ: "выполнено", статусы: ["closed"], цвет: "ok" },
    { ключ: "в работе", статусы: ["new", "paid", "delivered"], цвет: "info" },
    { ключ: "возвращено", статусы: ["refunded"], цвет: "warn" },
    { ключ: "спор", статусы: ["dispute"], цвет: "err" },
  ];

  function состояния(заказы) {
    var в = валюта();
    var строки = СОСТОЯНИЯ.map(function (с) {
      var свои = заказы.filter(function (o) { return с.статусы.indexOf(o.status) >= 0; });
      var сумма = свои.reduce(function (a, o) { return a + (Number(o.amount) || 0); }, 0);
      return { с: с, штук: свои.length, сумма: сумма };
    }).filter(function (r) { return r.штук; });

    if (!строки.length) return "";
    var всего = заказы.length;
    return '<div class="card"><h2>' + ic("list") + " Состояние заказов</h2>" +
      '<div class="tw"><table><tbody>' +
      строки.map(function (r) {
        var доля = всего ? Math.round(100 * r.штук / всего) : 0;
        return "<tr><td><span class='pill " + r.с.цвет + "'>" + esc(r.с.ключ) + "</span></td>" +
          "<td>" + num(r.штук) + "</td>" +
          '<td class="muted">' + доля + "%</td>" +
          '<td class="r">' + money(r.сумма, в) + "</td></tr>";
      }).join("") +
      "</tbody></table></div>" +
      '<div class="note" style="margin-top:10px"><b>В работе</b> — оплачено или выдано, но ещё ' +
      "не закрыто: деньги получены, сделка не завершена.</div></div>";
  }

  function оценки(отзывы) {
    if (!отзывы.length) {
      return '<div class="card"><h2>' + ic("chat") + " Отзывы</h2>" +
        '<div class="note">Отзывов пока нет. Расширение забирает их со страницы продавца — ' +
        "раз в час и при загрузке всей истории.</div></div>";
    }
    var сумма = отзывы.reduce(function (a, о) { return a + (Number(о.rating) || 0); }, 0);
    var средняя = сумма / отзывы.length;
    var по = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    отзывы.forEach(function (о) { if (по[о.rating] != null) по[о.rating]++; });
    var макс = Math.max.apply(null, [1].concat(Object.keys(по).map(function (k) { return по[k]; })));

    return '<div class="card"><h2>' + ic("chat") + " Оценки</h2>" +
      '<div style="display:flex;align-items:baseline;gap:10px;margin-bottom:12px">' +
      '<span style="font:700 30px/1 inherit">' + средняя.toFixed(2).replace(".", ",") + "</span>" +
      '<span class="muted">из 5 · ' + num(отзывы.length) + " отзыв" +
      (отзывы.length % 10 === 1 && отзывы.length % 100 !== 11 ? "" : "ов") + "</span></div>" +
      [5, 4, 3, 2, 1].map(function (n) {
        var ш = Math.round(100 * по[n] / макс);
        return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">' +
          '<span class="muted" style="width:16px">' + n + "</span>" +
          '<span style="flex:1;height:8px;background:var(--card2);border-radius:4px;overflow:hidden">' +
          '<span style="display:block;height:100%;width:' + ш + '%;background:' +
          (n >= 4 ? "var(--ok)" : n === 3 ? "var(--warn)" : "var(--err)") + '"></span></span>' +
          '<span class="muted" style="width:28px;text-align:right">' + по[n] + "</span></div>";
      }).join("") +
      "</div>";
  }

  function лента(отзывы) {
    if (!отзывы.length) return "";
    var по = отзывы.slice().sort(function (a, b) {
      return new Date(b.approx_at || b.seen_at || 0) - new Date(a.approx_at || a.seen_at || 0);
    });
    return '<div class="card"><h2>' + ic("inbox") + " Что пишут" +
      '<span class="grow"></span></h2>' +
      '<div class="note">Дата приблизительная: FunPay показывает отзывы как «9 месяцев назад», ' +
      "точной в разметке нет.</div>" +
      '<div style="margin-top:12px">' +
      по.slice(0, 40).map(function (о) {
        var звёзды = "";
        for (var i = 1; i <= 5; i++) звёзды += i <= о.rating ? "★" : "☆";
        return '<div style="padding:10px 0;border-bottom:1px solid var(--line)">' +
          '<div style="display:flex;gap:8px;align-items:baseline;flex-wrap:wrap">' +
          '<span style="color:' + (о.rating >= 4 ? "var(--ok)" : о.rating === 3 ? "var(--warn)" : "var(--err)") +
          '">' + звёзды + "</span>" +
          '<span class="muted">' + esc(о.detail || о.game || "") + "</span>" +
          '<span class="grow"></span>' +
          '<span class="muted" style="font-size:12px">' +
          esc(о.approx_at ? new Date(о.approx_at).toLocaleDateString("ru-RU") : "—") + "</span></div>" +
          (о.body ? '<div style="margin-top:5px">' + esc(о.body) + "</div>" : "") +
          (о.reply
            ? '<div class="muted" style="margin-top:5px;padding-left:10px;border-left:2px solid var(--line);font-size:13px">' +
              "Ваш ответ: " + esc(о.reply) + "</div>"
            : "") +
          "</div>";
      }).join("") +
      "</div></div>";
  }

  function view() {
    var заказы = DB.get("orders");
    var отзывы = DB.get("reviews") || [];
    var сейчас = Date.now();

    var h = '<div class="head"><div><h1>История</h1><div class="sub">' +
      "Деньги, состояния сделок и отзывы за всё, что есть в базе." +
      "</div></div></div>";

    if (!заказы.length) {
      return h + '<div class="card"><div class="note">Заказов в базе пока нет. Они приезжают ' +
        "с телефона и из расширения Chrome — загляните во вкладку «Расширение».</div></div>";
    }

    // Самый старый заказ — честная граница того, что вообще можно посчитать.
    var старейший = заказы.reduce(function (м, o) {
      var t = new Date(o.created_at).getTime();
      return isFinite(t) && t < м ? t : м;
    }, Infinity);

    h += '<div class="cards4">' +
      ПЕРИОДЫ.map(function (п) { return плитка(п, заПериод(заказы, п.мс, сейчас)); }).join("") +
      "</div>";

    if (isFinite(старейший)) {
      var дней = Math.max(1, Math.round((сейчас - старейший) / СУТКИ));
      h += '<div class="note">Глубина истории: <b>' + num(дней) + " дн.</b>, самый старый заказ от " +
        esc(new Date(старейший).toLocaleDateString("ru-RU")) +
        ". Дальше этого FunPay данных не отдаёт, поэтому «за всё время» — это ровно " +
        num(заказы.length) + " заказ" + (заказы.length % 10 === 1 && заказы.length % 100 !== 11 ? "" : "ов") +
        ".</div>";
    }

    h += состояния(заказы);
    h += оценки(отзывы);
    h += лента(отзывы);
    return h;
  }

  window.__historyView = view;

  // Панель могла отрисоваться раньше, чем загрузился этот файл.
  if (window.__render) window.__render();
})();
