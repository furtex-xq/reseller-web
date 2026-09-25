// ==UserScript==
// @name         FunPay → Reseller Web (выгрузка заказов)
// @namespace    https://furtex-xq.github.io/reseller-web/
// @version      1.0
// @description  Собирает заказы со страницы FunPay в CSV для панели Reseller Web. Работает только на чтение.
// @author       No4nik
// @match        https://funpay.com/orders*
// @match        https://funpay.com/*/orders*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

/*
 * ЗАЧЕМ ЭТО НУЖНО
 *
 * Панель живёт на furtex-xq.github.io и прочитать funpay.com не может: браузер
 * запрещает одному домену читать другой, и обойти это нельзя. Зато скрипт,
 * запущенный НА funpay.com, читает страницу свободно — вы там уже вошли.
 * Отсюда схема: скрипт собирает заказы на FunPay в файл, файл импортируется
 * в панель. Никаких серверов, аккаунтов и платных сервисов.
 *
 * ЧТО ОН ДЕЛАЕТ И ЧЕГО НЕ ДЕЛАЕТ
 *
 * Делает: читает таблицу заказов, которая уже открыта у вас на экране,
 * и складывает её в CSV.
 *
 * Не делает: не отправляет ничего наружу, не нажимает кнопки за вас, не
 * трогает сделки, не лезет в настройки и не знает вашего пароля. Весь
 * исходник перед вами — тридцать секунд чтения, чтобы в этом убедиться.
 *
 * КАК ЗАПУСТИТЬ — ДВА СПОСОБА
 *
 * 1. Расширение Tampermonkey (бесплатное, Chrome/Firefox/Edge): «Создать
 *    скрипт», вставить этот файл, сохранить. Дальше панель сама появляется
 *    на страницах заказов.
 * 2. Без расширения вообще: открыть заказы на FunPay, нажать F12 →
 *    «Console», вставить весь файл, Enter. Работает до перезагрузки страницы.
 *
 * ПОРЯДОК РАБОТЫ
 *
 * Открыть funpay.com/orders/trade → пролистать вниз и понажимать «Показать
 * ещё», пока не покажутся все нужные заказы → нажать «Собрать» в панели
 * скрипта → проверить, что в таблице предпросмотра всё разобралось верно →
 * «Скачать CSV» → в панели: Заказы → Импорт.
 *
 * Скрипт намеренно не листает страницы сам: сколько заказов вы открыли,
 * столько он и возьмёт. Так понятнее, что именно уходит в файл.
 */

(function () {
  "use strict";

  if (window.__rsExportLoaded) { window.__rsExportPanel(); return; }
  window.__rsExportLoaded = true;

  /* ---------- разбор строки заказа ----------
     Вёрстка FunPay может меняться, поэтому ячейки ищутся по нескольким
     именам класса, а если не нашлись — видно в предпросмотре: там же лежат
     сырые ячейки, так что промах заметен сразу, а не после импорта. */
  var FIELD = {
    date:   ["tc-date-time", "tc-date", "tc-time"],
    order:  ["tc-order"],
    title:  ["tc-desc-text", "tc-desc"],
    buyer:  ["tc-user", "media-user-name", "tc-buyer"],
    status: ["tc-status"],
    price:  ["tc-price", "tc-amount", "tc-sum"],
  };

  var ST = [
    [/оплач/i,                 "paid"],
    [/выдан|отправлен/i,       "delivered"],
    [/закры|выполн|завершен/i, "closed"],
    [/возврат|отмен/i,         "refunded"],
    [/спор|арбитраж/i,         "dispute"],
    [/ожида|нов/i,             "new"],
  ];

  function txt(el) { return el ? String(el.textContent || "").replace(/\s+/g, " ").trim() : ""; }

  function pick(row, names) {
    for (var i = 0; i < names.length; i++) {
      var el = row.querySelector("." + names[i]);
      if (el && txt(el)) return txt(el);
    }
    return "";
  }

  function mapStatus(s) {
    for (var i = 0; i < ST.length; i++) if (ST[i][0].test(s)) return ST[i][1];
    return "new";
  }

  // «1 250,50 ₽» -> { amount: 1250.5, currency: "RUB" }
  function money(s) {
    var cur = /\$|usd/i.test(s) ? "USD" : /€|eur/i.test(s) ? "EUR" : "RUB";
    var n = String(s).replace(/[^\d.,-]/g, "");
    // Запятая как десятичный разделитель — только если после неё 1-2 цифры.
    if (/,\d{1,2}$/.test(n)) n = n.replace(/\./g, "").replace(",", ".");
    else n = n.replace(/,/g, "");
    return { amount: parseFloat(n) || 0, currency: cur };
  }

  // «25 сентября, 14:07» / «сегодня, 14:07» -> ISO. Не разобралось — пусто,
  // панель подставит дату импорта: это честнее выдуманной даты.
  var MON = ["январ", "феврал", "март", "апрел", "ма", "июн", "июл", "август",
             "сентябр", "октябр", "ноябр", "декабр"];
  function isoDate(s) {
    if (!s) return "";
    var hm = s.match(/(\d{1,2}):(\d{2})/);
    var h = hm ? +hm[1] : 0, mi = hm ? +hm[2] : 0;
    var now = new Date(), d = null;
    if (/сегодня/i.test(s)) d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    else if (/вчера/i.test(s)) d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    else {
      var dm = s.match(/(\d{1,2})\s+([а-яё]+)/i);
      if (dm) {
        var mon = -1, low = dm[2].toLowerCase();
        for (var i = 0; i < MON.length; i++) if (low.indexOf(MON[i]) === 0) { mon = i; break; }
        if (mon >= 0) {
          var yr = s.match(/\b(20\d{2})\b/);
          d = new Date(yr ? +yr[1] : now.getFullYear(), mon, +dm[1]);
          // Без года: дата из будущего — значит это прошлый год.
          if (!yr && d > now) d.setFullYear(d.getFullYear() - 1);
        }
      } else {
        var num = s.match(/(\d{2})[.\/](\d{2})[.\/](\d{2,4})/);
        if (num) d = new Date(+(num[3].length === 2 ? "20" + num[3] : num[3]), +num[2] - 1, +num[1]);
      }
    }
    if (!d || isNaN(d.getTime())) return "";
    d.setHours(h, mi, 0, 0);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().replace(/\.\d+Z$/, "Z");
  }

  function collect() {
    var rows = document.querySelectorAll("a.tc-item, tr.tc-item, .tc-item");
    var out = [], seen = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (seen.indexOf(row) >= 0) continue;
      seen.push(row);
      var raw = [];
      var cells = row.querySelectorAll("[class*='tc-']");
      for (var c = 0; c < cells.length; c++) {
        var t = txt(cells[c]);
        if (t && raw.indexOf(t) < 0) raw.push(t);
      }
      var order = pick(row, FIELD.order);
      if (!order) {                       // номер заказа иногда только в ссылке
        var href = row.getAttribute("href") || "";
        var m = href.match(/([A-Z0-9]{6,})\/?$/i);
        if (m) order = m[1];
      }
      var price = money(pick(row, FIELD.price) || raw[raw.length - 1] || "");
      var rec = {
        order: order,
        platform: "FunPay",
        sku: "",
        title: pick(row, FIELD.title),
        buyer: pick(row, FIELD.buyer),
        status: mapStatus(pick(row, FIELD.status)),
        amount: price.amount,
        currency: price.currency,
        created_at: isoDate(pick(row, FIELD.date)),
        _raw: raw,
      };
      if (rec.order || rec.title) out.push(rec);
    }
    return out;
  }

  /* ---------- CSV ---------- */
  var HEAD = ["order", "platform", "sku", "title", "buyer", "status", "amount", "currency", "created_at"];
  function cell(v) {
    var s = String(v == null ? "" : v);
    return /[",;\n\t]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function csv(list) {
    return HEAD.join(";") + "\n" + list.map(function (r) {
      return HEAD.map(function (h) { return cell(r[h]); }).join(";");
    }).join("\n") + "\n";
  }

  /* ---------- панель ---------- */
  var box, found = [];

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function preview() {
    if (!found.length) {
      return '<div class="rs-empty">Заказы на странице не нашлись. Откройте список продаж ' +
        'и пролистайте его, потом нажмите «Собрать» ещё раз.</div>';
    }
    var h = '<div class="rs-cnt">Нашлось заказов: <b>' + found.length + "</b></div>" +
      '<table class="rs-tbl"><thead><tr><th>заказ</th><th>товар</th><th>покупатель</th>' +
      "<th>статус</th><th>сумма</th><th>дата</th></tr></thead><tbody>";
    found.slice(0, 8).forEach(function (r) {
      h += "<tr><td>" + esc(r.order || "—") + "</td><td>" + esc((r.title || "—").slice(0, 34)) +
        "</td><td>" + esc(r.buyer || "—") + "</td><td>" + esc(r.status) + "</td><td>" +
        esc(r.amount + " " + r.currency) + "</td><td>" +
        esc(r.created_at ? r.created_at.slice(0, 16).replace("T", " ") : "—") + "</td></tr>";
    });
    h += "</tbody></table>";
    if (found.length > 8) h += '<div class="rs-more">…и ещё ' + (found.length - 8) + "</div>";
    var blank = found.filter(function (r) { return !r.order || !r.buyer; }).length;
    if (blank) {
      h += '<div class="rs-warn">Ячеек не разобралось: ' + blank + " из " + found.length +
        ". Значит, вёрстка FunPay не та, на которую рассчитан разбор. Раскройте «Сырые данные», " +
        "посмотрите порядок ячеек и поправьте FIELD в начале скрипта — остальное работает как есть.</div>" +
        '<details class="rs-raw"><summary>Сырые данные</summary><pre>' +
        esc(JSON.stringify(found.slice(0, 3).map(function (r) { return r._raw; }), null, 1)) + "</pre></details>";
    }
    return h;
  }

  function paint() {
    box.querySelector(".rs-body").innerHTML = preview();
    box.querySelector("[data-dl]").disabled = !found.length;
    box.querySelector("[data-cp]").disabled = !found.length;
  }

  function build() {
    box = document.createElement("div");
    box.id = "rs-export";
    box.innerHTML =
      '<div class="rs-head"><b>Reseller Web</b><span class="rs-x" data-x>&times;</span></div>' +
      '<div class="rs-body"><div class="rs-empty">Пролистайте список заказов до нужного места ' +
      'и нажмите «Собрать».</div></div>' +
      '<div class="rs-btns">' +
      '<button class="rs-b rs-p" data-go>Собрать</button>' +
      '<button class="rs-b" data-dl disabled>Скачать CSV</button>' +
      '<button class="rs-b" data-cp disabled>Копировать</button></div>';

    var css = document.createElement("style");
    css.textContent =
      "#rs-export{position:fixed;right:16px;bottom:16px;z-index:2147483000;width:520px;" +
      "max-width:calc(100vw - 32px);background:#11161d;color:#e6edf3;border:1px solid #2a3442;" +
      "border-radius:12px;box-shadow:0 14px 44px rgba(0,0,0,.5);font:13px/1.5 -apple-system,Segoe UI,Roboto,sans-serif}" +
      "#rs-export .rs-head{display:flex;align-items:center;justify-content:space-between;" +
      "padding:9px 12px;border-bottom:1px solid #222c38;color:#2dd4bf}" +
      "#rs-export .rs-x{cursor:pointer;font-size:19px;line-height:1;color:#7d8896;padding:0 3px}" +
      "#rs-export .rs-x:hover{color:#e6edf3}" +
      "#rs-export .rs-body{padding:10px 12px;max-height:44vh;overflow:auto}" +
      "#rs-export .rs-empty,#rs-export .rs-more{color:#8b96a5}" +
      "#rs-export .rs-cnt{margin-bottom:7px}" +
      "#rs-export .rs-tbl{width:100%;border-collapse:collapse;font-size:12px}" +
      "#rs-export .rs-tbl th{text-align:left;color:#8b96a5;font-weight:600;padding:3px 6px 3px 0;" +
      "border-bottom:1px solid #222c38}" +
      "#rs-export .rs-tbl td{padding:3px 6px 3px 0;border-bottom:1px solid #1a222c;white-space:nowrap;" +
      "overflow:hidden;text-overflow:ellipsis;max-width:180px}" +
      "#rs-export .rs-warn{margin-top:9px;padding:8px 10px;border-radius:8px;background:#2a1f12;" +
      "color:#f0b866;font-size:12px}" +
      "#rs-export .rs-raw pre{max-height:150px;overflow:auto;background:#0b0f14;padding:7px;" +
      "border-radius:7px;font-size:11px}" +
      "#rs-export .rs-raw summary{cursor:pointer;margin-top:7px;color:#2dd4bf;font-size:12px}" +
      "#rs-export .rs-btns{display:flex;gap:7px;padding:10px 12px;border-top:1px solid #222c38}" +
      "#rs-export .rs-b{flex:1;padding:8px 10px;border-radius:8px;border:1px solid #2a3442;" +
      "background:#19202a;color:#e6edf3;cursor:pointer;font:inherit}" +
      "#rs-export .rs-b:hover:not(:disabled){border-color:#2dd4bf}" +
      "#rs-export .rs-b:disabled{opacity:.42;cursor:default}" +
      "#rs-export .rs-p{background:#2dd4bf;border-color:#2dd4bf;color:#04131a;font-weight:600}";
    document.head.appendChild(css);
    document.body.appendChild(box);

    box.querySelector("[data-x]").onclick = function () { box.remove(); };
    box.querySelector("[data-go]").onclick = function () { found = collect(); paint(); };
    box.querySelector("[data-dl]").onclick = function () {
      var b = new Blob(["﻿" + csv(found)], { type: "text/csv;charset=utf-8" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = "funpay-orders-" + new Date().toISOString().slice(0, 10) + ".csv";
      document.body.appendChild(a); a.click();
      var href = a.href; a.remove();
      setTimeout(function () { URL.revokeObjectURL(href); }, 4000);
    };
    box.querySelector("[data-cp]").onclick = function () {
      var t = csv(found), btn = this;
      var ok = function () {
        btn.textContent = "Скопировано";
        setTimeout(function () { btn.textContent = "Копировать"; }, 1600);
      };
      var fallback = function () {
        var ta = document.createElement("textarea");
        ta.value = t; ta.style.position = "fixed"; ta.style.left = "-9999px";
        document.body.appendChild(ta); ta.select();
        try { document.execCommand("copy"); ok(); }
        catch (e) { alert("Скопировать не удалось — нажмите «Скачать CSV»."); }
        ta.remove();
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(t).then(ok, fallback);
      } else fallback();
    };
  }

  window.__rsExportPanel = function () { if (!box || !box.isConnected) build(); };
  window.__rsExportPanel();
})();
