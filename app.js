/* Reseller Web — интерфейс.
 * Дашборд, товары, склад, объявления, заказы, чаты, правила, задачи, журнал.
 */
(function () {
  "use strict";
  var R = window.RS, DB = R.DB, esc = R.esc, money = R.money, dt = R.dt, num = R.num;

  /* ---------------- иконки ---------------- */
  var I = {
    box: "M21 8v8a2 2 0 0 1-1 1.7l-7 4a2 2 0 0 1-2 0l-7-4A2 2 0 0 1 3 16V8a2 2 0 0 1 1-1.7l7-4a2 2 0 0 1 2 0l7 4A2 2 0 0 1 21 8z|M3.3 7 12 12l8.7-5M12 22V12",
    chart: "M3 3v18h18|M7 15l3.5-4 3 2.5L20 7",
    key: "M14 7a4 4 0 1 1-4.9 3.9L3 17v4h4l1-1v-2h2v-2h2l1.1-1.1A4 4 0 0 1 14 7z",
    tag: "M20.6 13.4 12 22l-9-9V4a1 1 0 0 1 1-1h9l7.6 7.6a2 2 0 0 1 0 2.8z|M7.5 7.5h.01",
    cart: "M3 3h2l2.7 12.4a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.6L22 7H6|M9 21h.01M18 21h.01",
    chat: "M21 11.5a8 8 0 0 1-11.6 7.1L3 21l2.4-6.4A8 8 0 1 1 21 11.5z",
    bolt: "M13 2 4 14h7l-1 8 9-12h-7l1-8z",
    list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
    gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z|M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z",
    plus: "M12 5v14M5 12h14",
    search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3",
    up: "M12 19V5M5 12l7-7 7 7",
    dl: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
    ul: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12",
    trash: "M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6",
    edit: "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7|M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z",
    x: "M18 6 6 18M6 6l12 12",
    ok: "M20 6 9 17l-5-5",
    link: "M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7|M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7",
    lock: "M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2z|M7 11V7a5 5 0 0 1 10 0v4",
    sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z|M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
    warn: "M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z|M12 9v4M12 17h.01",
    inbox: "M22 12h-6l-2 3h-4l-2-3H2|M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z",
  };
  function ic(n, cls) {
    var d = I[n] || I.box;
    return '<svg viewBox="0 0 24 24" class="' + (cls || "") + '" stroke-linecap="round" stroke-linejoin="round">' +
      d.split("|").map(function (p) { return '<path d="' + p + '"/>'; }).join("") + "</svg>";
  }

  /* ---------------- состояние ---------------- */
  var TAB = "dash";
  var Q = {};          // поиск по вкладкам
  var SORT = {};       // сортировка по вкладкам
  var CHAT_ID = null;
  var loaded = false, loadErr = null;

  function el(id) { return document.getElementById(id); }
  function cur() { return DB.settings.currency || "RUB"; }

  function toast(msg, kind) {
    var w = el("toasts");
    var d = document.createElement("div");
    d.className = "toast " + (kind || "");
    d.textContent = msg;
    w.appendChild(d);
    setTimeout(function () { d.style.opacity = "0"; d.style.transform = "translateX(16px)"; }, 2600);
    setTimeout(function () { d.remove(); }, 3000);
  }

  /* ---------------- вкладки ---------------- */
  var TABS = [
    { id: "dash", t: "Дашборд", i: "chart" },
    { id: "products", t: "Товары", i: "box", c: function () { return DB.get("products").filter(function (p) { return !p.is_archived; }).length; } },
    { id: "stock", t: "Склад", i: "key", c: function () { return DB.get("stock_keys").filter(function (k) { return k.status === "available"; }).length; } },
    { id: "listings", t: "Объявления", i: "tag", c: function () { return DB.get("listings").length; } },
    { id: "orders", t: "Заказы", i: "cart", c: function () { return DB.get("orders").length; } },
    { id: "chats", t: "Чаты", i: "chat", c: function () { return DB.get("chats").filter(function (c) { return c.unread; }).length || ""; } },
    { id: "rules", t: "Правила", i: "bolt", c: function () { return DB.get("message_rules").filter(function (r) { return r.is_enabled; }).length; } },
    { id: "jobs", t: "Задачи", i: "list", c: function () { return DB.get("jobs").filter(function (j) { return j.status === "pending" || j.status === "failed"; }).length || ""; } },
    { id: "events", t: "Журнал", i: "inbox" },
    { id: "settings", t: "Настройки", i: "gear" },
  ];

  /* Плашка живого обновления. Показывает не «включено», а когда данные
     обновлялись последний раз: иначе нельзя отличить тишину от сломанного
     опроса, а это как раз то, что важно знать. */
  function livePill() {
    // display:contents, чтобы обёртка не встряла в flex-раскладку шапки.
    return '<span id="livePill" style="display:contents">' + livePillInner() + "</span>";
  }
  function livePillInner() {
    if (DB.settings.driver !== "supabase") return "";
    var L = R.LIVE;
    if (DB.settings.live === false) {
      return '<span class="pill mute" title="Включается в настройках">не обновляется</span>';
    }
    if (L.state === "error") {
      return '<span class="pill err" title="' + esc(L.lastErr || "") + '">связь потеряна</span>';
    }
    if (livePending) {
      return '<span class="pill info" title="Перерисуем, как только освободится поле или закроется окно">есть новые данные</span>';
    }
    var ago = L.lastAt ? Math.round((Date.now() - L.lastAt.getTime()) / 1000) : null;
    var t = ago == null ? "ждём первой сверки"
      : ago < 45 ? "обновлено только что"
      : ago < 3600 ? "обновлено " + Math.round(ago / 60) + " мин назад"
      : "давно не обновлялось";
    return '<span class="pill ok" title="Панель сверяется с базой каждые ' +
      Math.round(L.ms / 1000) + ' с">' + t + "</span>";
  }

  function header() {
    var s = DB.settings;
    return '<div class="top"><div class="in">' +
      '<div class="logo"><span class="mark">' + ic("box") + "</span><span>Reseller <span class=\"muted\">Web</span></span></div>" +
      '<nav class="tabs">' + TABS.map(function (t) {
        var c = t.c ? t.c() : "";
        return '<button class="tab ' + (TAB === t.id ? "on" : "") + '" data-tab="' + t.id + '">' +
          ic(t.i) + "<span>" + t.t + "</span>" + (c !== "" && c !== 0 ? '<span class="cnt">' + c + "</span>" : "") + "</button>";
      }).join("") + "</nav>" +
      '<span class="grow"></span>' +
      '<div class="right">' +
      '<span class="pill ' + (s.driver === "supabase" ? "acc" : "mute") + '">' +
      (s.driver === "supabase" ? "Supabase" : "в браузере") + "</span>" +
      livePill() +
      '<button class="btn icon" id="themeBtn" title="Тема">' + ic("sun") + "</button>" +
      "</div></div></div>";
  }

  /* ---------------- таблица: помощники ---------------- */
  function sortRows(tab, rows, def) {
    var s = SORT[tab] || def;
    if (!s) return rows;
    var k = s.k, d = s.d === "desc" ? -1 : 1;
    return rows.slice().sort(function (a, b) {
      var x = a[k], y = b[k];
      if (x == null) x = ""; if (y == null) y = "";
      if (typeof x === "number" && typeof y === "number") return (x - y) * d;
      return String(x).localeCompare(String(y), "ru", { numeric: true }) * d;
    });
  }
  function th(tab, key, label, cls) {
    var s = SORT[tab] || {};
    var ar = s.k === key ? (s.d === "desc" ? "▼" : "▲") : "";
    return '<th class="s ' + (cls || "") + '" data-sort="' + tab + ":" + key + '">' + esc(label) +
      (ar ? '<span class="ar">' + ar + "</span>" : "") + "</th>";
  }
  function searchBar(tab, ph) {
    return '<div class="search">' + ic("search") +
      '<input type="search" data-q="' + tab + '" placeholder="' + esc(ph) + '" value="' + esc(Q[tab] || "") + '"></div>';
  }
  function match(obj, q, fields) {
    if (!q) return true;
    q = q.toLowerCase();
    return fields.some(function (f) { return String(obj[f] == null ? "" : obj[f]).toLowerCase().indexOf(q) >= 0; });
  }
  function emptyBox(icon, text, btn) {
    return '<div class="empty">' + ic(icon) + "<p>" + esc(text) + "</p>" + (btn || "") + "</div>";
  }
  function pill(map, v) {
    var m = map[v] || { t: v || "—", c: "mute" };
    return '<span class="pill ' + m.c + '">' + esc(m.t) + "</span>";
  }
  function platPill(p) {
    return '<span class="pill ' + (p === "funpay" ? "info" : "acc") + ' plat">' + esc(R.PLATFORMS[p] || p || "—") + "</span>";
  }

  /* ---------------- ДАШБОРД ---------------- */
  function viewDash() {
    var orders = DB.get("orders"), products = DB.get("products"), keys = DB.get("stock_keys");
    var paid = orders.filter(function (o) { return o.status !== "refunded"; });

    var today = R.dOnly(new Date());
    var d7 = [], d7prev = [];
    for (var i = 6; i >= 0; i--) d7.push(R.dOnly(new Date(Date.now() - i * 864e5)));
    for (var j = 13; j >= 7; j--) d7prev.push(R.dOnly(new Date(Date.now() - j * 864e5)));

    var sumOn = function (days) {
      return paid.reduce(function (a, o) {
        return days.indexOf(R.dOnly(o.created_at)) >= 0 ? a + Number(o.amount || 0) : a;
      }, 0);
    };
    var cntOn = function (days) {
      return paid.filter(function (o) { return days.indexOf(R.dOnly(o.created_at)) >= 0; }).length;
    };
    var rev7 = sumOn(d7), rev7p = sumOn(d7prev);
    var revToday = sumOn([today]);
    var delta = rev7p > 0 ? Math.round(((rev7 - rev7p) / rev7p) * 100) : (rev7 > 0 ? 100 : 0);
    var dcls = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
    var dsign = delta > 0 ? "+" : "";

    var avail = keys.filter(function (k) { return k.status === "available"; }).length;
    var lowProducts = products.filter(function (p) {
      if (p.is_archived || !p.auto_delivery) return false;
      var n = keys.filter(function (k) { return k.product_id === p.id && k.status === "available"; }).length;
      return n <= (p.low_stock_alert || 3);
    });

    var kpis =
      '<div class="grid g4">' +
      kpi("Выручка за 7 дней", money(rev7, cur()), dsign + delta + "% к прошлой неделе", dcls) +
      kpi("Сегодня", money(revToday, cur()), cntOn([today]) + " заказов", "flat") +
      kpi("Заказов всего", num(orders.length), paid.filter(function (o) { return o.status === "delivered" || o.status === "closed"; }).length + " выдано", "flat") +
      kpi("Ключей свободно", num(avail), lowProducts.length ? lowProducts.length + " товаров на исходе" : "остатки в норме",
        lowProducts.length ? "down" : "flat") +
      "</div>";

    // выручка по дням
    var series = d7.map(function (d) { return sumOn([d]); });
    var prevSeries = d7prev.map(function (d) { return sumOn([d]); });

    // доли товаров
    var byProd = {};
    paid.forEach(function (o) {
      var p = o.product_id ? DB.byId("products", o.product_id) : null;
      var name = p ? p.title : (o.title_raw || "без товара");
      byProd[name] = (byProd[name] || 0) + Number(o.amount || 0);
    });
    var shares = Object.keys(byProd).map(function (k) { return { n: k, v: byProd[k] }; })
      .sort(function (a, b) { return b.v - a.v; }).slice(0, 6);

    // воронка
    var st = function (s) { return orders.filter(function (o) { return o.status === s; }).length; };
    var funnel = [
      { n: "Новые", v: orders.length },
      { n: "Оплачены", v: st("paid") + st("delivered") + st("closed") },
      { n: "Выданы", v: st("delivered") + st("closed") },
      { n: "Закрыты", v: st("closed") },
    ];

    // часы продаж
    var hours = new Array(24).fill(0);
    paid.forEach(function (o) { var d = new Date(o.created_at); if (!isNaN(d)) hours[d.getHours()]++; });

    var recent = orders.slice().sort(function (a, b) {
      return new Date(b.created_at) - new Date(a.created_at);
    }).slice(0, 8);

    return '<div class="head"><div><h1>Дашборд</h1><div class="sub">Сводка по заказам, выручке и остаткам</div></div></div>' +
      kpis +
      '<div class="grid g2" style="margin-top:14px">' +
      '<div class="card"><h3>Выручка, 7 дней</h3>' + lineChart(series, prevSeries, d7) + "</div>" +
      '<div class="card"><h3>Доли товаров в выручке</h3>' + donut(shares) + "</div>" +
      "</div>" +
      '<div class="grid g2" style="margin-top:14px">' +
      '<div class="card"><h3>Воронка заказов</h3><div class="funnel" style="margin-top:12px">' +
      funnel.map(function (f) {
        var max = funnel[0].v || 1;
        return '<div class="st"><span class="nm">' + esc(f.n) + '</span><span class="fb"><i style="width:' +
          Math.max(2, Math.round((f.v / max) * 100)) + '%"></i></span><span class="vv">' + num(f.v) + "</span></div>";
      }).join("") + "</div></div>" +
      '<div class="card"><h3>Часы продаж</h3>' + heat(hours) + "</div>" +
      "</div>" +
      '<div class="card" style="margin-top:14px"><h3>Последние заказы</h3>' +
      (recent.length
        ? '<div class="tw" style="margin-top:10px;border:0"><table><tbody>' + recent.map(function (o) {
            var p = o.product_id ? DB.byId("products", o.product_id) : null;
            return "<tr><td>" + platPill(o.platform) + "</td>" +
              '<td><div class="t-title">' + esc(p ? p.title : (o.title_raw || "—")) + "</div>" +
              '<div class="t-sub">' + esc(o.buyer_name || "покупатель") + " · " + esc(o.external_id || "") + "</div></td>" +
              "<td>" + pill(R.ORDER_ST, o.status) + "</td>" +
              '<td class="r">' + money(o.amount, o.currency || cur()) + "</td>" +
              '<td class="r muted nowrap">' + R.ago(o.created_at) + "</td></tr>";
          }).join("") + "</tbody></table></div>"
        : emptyBox("cart", "Заказов пока нет. Они появятся из телефона или из импорта.")) +
      "</div>";
  }
  function kpi(lab, val, dlt, cls) {
    return '<div class="kpi"><div class="lab">' + esc(lab) + '</div><div class="val">' + esc(val) +
      '</div><div class="dlt ' + cls + '">' + esc(dlt) + "</div></div>";
  }

  function lineChart(a, prev, labels) {
    var W = 520, H = 170, pad = 26;
    var max = Math.max.apply(null, a.concat(prev).concat([1]));
    var x = function (i) { return pad + (i * (W - pad * 2)) / Math.max(1, a.length - 1); };
    var y = function (v) { return H - pad - (v / max) * (H - pad * 2); };
    var path = function (arr) { return arr.map(function (v, i) { return (i ? "L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1); }).join(" "); };
    var area = path(a) + " L" + x(a.length - 1).toFixed(1) + " " + (H - pad) + " L" + x(0).toFixed(1) + " " + (H - pad) + " Z";
    return '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" style="margin-top:8px">' +
      '<defs><linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#2dd4bf" stop-opacity=".28"/><stop offset="1" stop-color="#2dd4bf" stop-opacity="0"/>' +
      "</linearGradient></defs>" +
      [0, .5, 1].map(function (f) {
        var yy = pad + f * (H - pad * 2);
        return '<line class="gl" x1="' + pad + '" y1="' + yy + '" x2="' + (W - pad) + '" y2="' + yy + '"/>';
      }).join("") +
      '<path class="ar" d="' + area + '"/>' +
      '<path class="ln2" d="' + path(prev) + '"/>' +
      '<path class="ln" d="' + path(a) + '"/>' +
      a.map(function (v, i) { return '<circle class="dt" cx="' + x(i).toFixed(1) + '" cy="' + y(v).toFixed(1) + '" r="2.6"/>'; }).join("") +
      labels.map(function (d, i) {
        return '<text x="' + x(i).toFixed(1) + '" y="' + (H - 7) + '" text-anchor="middle">' + d.slice(8) + "." + d.slice(5, 7) + "</text>";
      }).join("") +
      '<text x="' + pad + '" y="14">' + num(Math.round(max)) + "</text>" +
      "</svg>" +
      '<div class="legend"><span><i style="background:var(--acc)"></i>эта неделя</span>' +
      '<span><i style="background:var(--tx3)"></i>прошлая</span></div>';
  }

  function donut(items) {
    if (!items.length) return emptyBox("chart", "Нет данных о продажах");
    var total = items.reduce(function (a, b) { return a + b.v; }, 0) || 1;
    var cols = ["#2dd4bf", "#58a6ff", "#d29922", "#f85149", "#a371f7", "#3fb950"];
    var r = 54, c = 2 * Math.PI * r, off = 0;
    var segs = items.map(function (it, i) {
      var frac = it.v / total, len = frac * c;
      var s = '<circle cx="70" cy="70" r="' + r + '" fill="none" stroke="' + cols[i % cols.length] +
        '" stroke-width="20" stroke-dasharray="' + len.toFixed(2) + " " + (c - len).toFixed(2) +
        '" stroke-dashoffset="' + (-off).toFixed(2) + '" transform="rotate(-90 70 70)"/>';
      off += len; return s;
    }).join("");
    return '<div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap;margin-top:8px">' +
      '<svg width="140" height="140" viewBox="0 0 140 140" style="flex:none">' + segs +
      '<text x="70" y="75" text-anchor="middle" style="fill:var(--tx);font-size:15px;font-weight:700">' +
      num(Math.round(total)) + "</text></svg>" +
      '<div class="legend" style="flex-direction:column;gap:7px;margin:0">' +
      items.map(function (it, i) {
        return '<span><i style="background:' + cols[i % cols.length] + '"></i>' + esc(it.n.slice(0, 28)) +
          ' <b style="color:var(--tx);margin-left:4px">' + Math.round((it.v / total) * 100) + "%</b></span>";
      }).join("") + "</div></div>";
  }

  function heat(hours) {
    var max = Math.max.apply(null, hours.concat([1]));
    return '<div class="heat" style="margin-top:12px">' + hours.map(function (v) {
      var a = v / max;
      return '<i title="' + v + '" style="background:' +
        (v ? "rgba(45,212,191," + (0.14 + a * 0.86).toFixed(2) + ")" : "var(--line)") + '"></i>';
    }).join("") + "</div>" +
      '<div class="heat-lab">' + hours.map(function (_, i) { return "<span>" + (i % 3 === 0 ? i : "") + "</span>"; }).join("") + "</div>";
  }

  /* ---------------- ТОВАРЫ ---------------- */
  function stockOf(pid) {
    return DB.get("stock_keys").filter(function (k) { return k.product_id === pid && k.status === "available"; }).length;
  }
  function viewProducts() {
    var q = Q.products || "";
    var rows = DB.get("products").filter(function (p) {
      return match(p, q, ["sku", "title", "game", "category"]);
    });
    rows = sortRows("products", rows, { k: "title", d: "asc" });

    return '<div class="head"><div><h1>Товары</h1><div class="sub">' + num(rows.length) + " из " +
      num(DB.get("products").length) + "</div></div><span class=\"grow\"></span>" +
      searchBar("products", "Поиск по артикулу, названию, игре…") +
      '<button class="btn" data-act="prod-import">' + ic("ul") + " Импорт CSV</button>" +
      '<button class="btn" data-act="prod-export">' + ic("dl") + " Экспорт</button>" +
      '<button class="btn pri" data-act="prod-new">' + ic("plus") + " Товар</button></div>" +
      (rows.length
        ? '<div class="tw"><table><thead><tr>' +
          th("products", "sku", "Артикул") + th("products", "title", "Название") +
          th("products", "game", "Игра") + th("products", "price", "Цена", "r") +
          "<th>Выдача</th><th>Остаток</th><th></th></tr></thead><tbody>" +
          rows.map(function (p) {
            var n = stockOf(p.id), low = p.low_stock_alert || 3;
            var cls = n === 0 ? "out" : n <= low ? "low" : "";
            return '<tr' + (p.is_archived ? ' style="opacity:.5"' : "") + ">" +
              '<td class="mono">' + esc(p.sku) + "</td>" +
              '<td><div class="t-title">' + esc(p.title) + "</div>" +
              (p.category ? '<div class="t-sub">' + esc(p.category) + "</div>" : "") + "</td>" +
              "<td>" + esc(p.game || "—") + "</td>" +
              '<td class="r">' + money(p.price, p.currency || cur()) + "</td>" +
              "<td>" + (p.auto_delivery ? '<span class="pill ok">авто</span>' : '<span class="pill mute">вручную</span>') + "</td>" +
              "<td>" + (p.auto_delivery
                ? '<div class="num">' + n + '</div><div class="bar ' + cls + '"><i style="width:' +
                  Math.min(100, (n / Math.max(low * 3, 1)) * 100) + '%"></i></div>'
                : '<span class="muted">—</span>') + "</td>" +
              '<td class="acts">' +
              '<button class="btn sm icon" data-act="prod-edit" data-id="' + p.id + '" title="Изменить">' + ic("edit") + "</button>" +
              '<button class="btn sm icon danger" data-act="prod-del" data-id="' + p.id + '" title="Удалить">' + ic("trash") + "</button>" +
              "</td></tr>";
          }).join("") + "</tbody></table></div>"
        : '<div class="card">' + emptyBox("box", q ? "Ничего не найдено" : "Товаров пока нет",
            q ? "" : '<button class="btn pri" data-act="prod-new">' + ic("plus") + " Добавить первый</button>") + "</div>");
  }

  /* ---------------- СКЛАД ---------------- */
  function viewStock() {
    var q = Q.stock || "";
    var keys = DB.get("stock_keys");
    var prods = DB.get("products");
    var rows = keys.map(function (k) {
      var p = DB.byId("products", k.product_id);
      return { k: k, p: p, sku: p ? p.sku : "—", title: p ? p.title : "товар удалён" };
    }).filter(function (r) {
      return match({ sku: r.sku, title: r.title, note: r.k.note, status: r.k.status }, q, ["sku", "title", "note", "status"]);
    });
    rows.sort(function (a, b) { return new Date(b.k.created_at) - new Date(a.k.created_at); });

    var byStatus = {};
    keys.forEach(function (k) { byStatus[k.status] = (byStatus[k.status] || 0) + 1; });

    var locked = keys.some(function (k) { return k.payload_enc && k.payload_enc.indexOf("v1:") === 0; }) && !R.VAULT.pass;

    return '<div class="head"><div><h1>Склад ключей</h1><div class="sub">' +
      Object.keys(R.KEY_ST).map(function (s) {
        return (R.KEY_ST[s].t) + ": " + (byStatus[s] || 0);
      }).join(" · ") + "</div></div><span class=\"grow\"></span>" +
      searchBar("stock", "Поиск по товару, заметке…") +
      (locked ? '<button class="btn" data-act="vault-unlock">' + ic("lock") + " Ввести пароль хранилища</button>" : "") +
      '<button class="btn" data-act="stock-export">' + ic("dl") + " Экспорт</button>" +
      '<button class="btn pri" data-act="stock-add">' + ic("plus") + " Добавить ключи</button></div>" +
      (locked ? '<div class="note warn" style="margin-bottom:14px">' + ic("lock") +
        " <b>Склад зашифрован.</b> Введите пароль хранилища, чтобы увидеть значения ключей. " +
        "Список, статусы и остатки видны и без пароля.</div>" : "") +
      (!prods.length ? '<div class="note" style="margin-bottom:14px">Сначала добавьте товар — ключи привязываются к нему.</div>' : "") +
      (rows.length
        ? '<div class="tw"><table><thead><tr><th>Товар</th><th>Ключ</th><th>Статус</th><th>Заметка</th><th>Добавлен</th><th></th></tr></thead><tbody>' +
          rows.slice(0, 500).map(function (r) {
            return "<tr>" +
              '<td><div class="t-title">' + esc(r.title) + '</div><div class="t-sub mono">' + esc(r.sku) + "</div></td>" +
              '<td class="mono" data-key="' + r.k.id + '">' +
              (r.k.payload_enc && r.k.payload_enc.indexOf("plain:") === 0
                ? esc(r.k.payload_enc.slice(6))
                : '<span class="muted">••••••••</span>') + "</td>" +
              "<td>" + pill(R.KEY_ST, r.k.status) + "</td>" +
              '<td class="muted">' + esc(r.k.note || "—") + "</td>" +
              '<td class="muted nowrap">' + dt(r.k.created_at) + "</td>" +
              '<td class="acts">' +
              (r.k.status === "available"
                ? '<button class="btn sm" data-act="key-burn" data-id="' + r.k.id + '">Списать</button>' : "") +
              '<button class="btn sm icon danger" data-act="key-del" data-id="' + r.k.id + '">' + ic("trash") + "</button>" +
              "</td></tr>";
          }).join("") + "</tbody></table></div>" +
          (rows.length > 500 ? '<p class="muted" style="margin-top:10px">Показаны первые 500 из ' + num(rows.length) + "</p>" : "")
        : '<div class="card">' + emptyBox("key", q ? "Ничего не найдено" : "Склад пуст",
            q ? "" : '<button class="btn pri" data-act="stock-add">' + ic("plus") + " Добавить ключи</button>") + "</div>");
  }

  /* ---------------- ОБЪЯВЛЕНИЯ ---------------- */
  function viewListings() {
    var q = Q.listings || "";
    var rows = DB.get("listings").map(function (l) {
      var p = DB.byId("products", l.product_id), a = DB.byId("accounts", l.account_id);
      return { l: l, p: p, a: a, title: p ? p.title : "—", sku: p ? p.sku : "", acc: a ? a.label : "—" };
    }).filter(function (r) { return match(r, q, ["title", "sku", "acc"]); });

    return '<div class="head"><div><h1>Объявления</h1><div class="sub">Связка «товар — аккаунт площадки»</div></div>' +
      '<span class="grow"></span>' + searchBar("listings", "Поиск…") +
      '<button class="btn pri" data-act="lst-new">' + ic("plus") + " Объявление</button></div>" +
      (rows.length
        ? '<div class="tw"><table><thead><tr><th>Товар</th><th>Аккаунт</th><th>Статус</th><th class="r">Цена</th>' +
          "<th>Авто-подъём</th><th>Последний подъём</th><th></th></tr></thead><tbody>" +
          rows.map(function (r) {
            var l = r.l;
            return "<tr>" +
              '<td><div class="t-title">' + esc(r.title) + '</div><div class="t-sub mono">' + esc(r.sku) + "</div></td>" +
              "<td>" + platPill(l.platform) + " " + esc(r.acc) + "</td>" +
              "<td>" + pill(R.LISTING_ST, l.status) +
              (l.last_error ? '<div class="t-sub" style="color:var(--err)">' + esc(String(l.last_error).slice(0, 60)) + "</div>" : "") + "</td>" +
              '<td class="r">' + (l.price_override != null && l.price_override !== ""
                ? money(l.price_override, cur()) : (r.p ? '<span class="muted">' + money(r.p.price, cur()) + "</span>" : "—")) + "</td>" +
              "<td>" + (l.auto_bump ? '<span class="pill ok">каждые ' + (l.bump_interval_min || 240) + " мин</span>"
                : '<span class="pill mute">выключен</span>') + "</td>" +
              '<td class="muted nowrap">' + (l.last_bumped_at ? R.ago(l.last_bumped_at) : "—") + "</td>" +
              '<td class="acts">' +
              (l.url ? '<a class="btn sm icon" href="' + esc(l.url) + '" target="_blank" rel="noopener">' + ic("link") + "</a>" : "") +
              '<button class="btn sm icon" data-act="lst-edit" data-id="' + l.id + '">' + ic("edit") + "</button>" +
              '<button class="btn sm icon danger" data-act="lst-del" data-id="' + l.id + '">' + ic("trash") + "</button>" +
              "</td></tr>";
          }).join("") + "</tbody></table></div>"
        : '<div class="card">' + emptyBox("tag", "Объявлений пока нет",
            '<button class="btn pri" data-act="lst-new">' + ic("plus") + " Создать</button>") + "</div>");
  }

  /* ---------------- ЗАКАЗЫ ---------------- */
  function viewOrders() {
    var q = Q.orders || "";
    var rows = DB.get("orders").map(function (o) {
      var p = o.product_id ? DB.byId("products", o.product_id) : null;
      return { o: o, title: p ? p.title : (o.title_raw || "—"), sku: p ? p.sku : "" };
    }).filter(function (r) {
      return match({ t: r.title, s: r.sku, b: r.o.buyer_name, e: r.o.external_id, st: r.o.status }, q, ["t", "s", "b", "e", "st"]);
    });
    rows.sort(function (a, b) { return new Date(b.o.created_at) - new Date(a.o.created_at); });
    var total = rows.reduce(function (a, r) { return a + Number(r.o.amount || 0); }, 0);

    return '<div class="head"><div><h1>Заказы</h1><div class="sub">' + num(rows.length) +
      " заказов на " + money(total, cur()) + "</div></div><span class=\"grow\"></span>" +
      searchBar("orders", "Покупатель, номер, товар…") +
      '<button class="btn" data-act="ord-import">' + ic("ul") + " Импорт</button>" +
      '<button class="btn" data-act="ord-export">' + ic("dl") + " Экспорт</button>" +
      '<button class="btn pri" data-act="ord-new">' + ic("plus") + " Заказ</button></div>" +
      (rows.length
        ? '<div class="tw"><table><thead><tr><th>Номер</th><th>Товар</th><th>Покупатель</th><th>Статус</th>' +
          '<th class="r">Сумма</th><th>Создан</th><th></th></tr></thead><tbody>' +
          rows.slice(0, 500).map(function (r) {
            var o = r.o;
            return "<tr>" +
              '<td>' + platPill(o.platform) + '<div class="t-sub mono">' + esc(o.external_id || "—") + "</div></td>" +
              '<td><div class="t-title">' + esc(r.title) + "</div>" +
              (r.sku ? '<div class="t-sub mono">' + esc(r.sku) + "</div>" : "") + "</td>" +
              "<td>" + esc(o.buyer_name || "—") + "</td>" +
              "<td>" + pill(R.ORDER_ST, o.status) + "</td>" +
              '<td class="r">' + money(o.amount, o.currency || cur()) + "</td>" +
              '<td class="muted nowrap">' + dt(o.created_at, true) + "</td>" +
              '<td class="acts">' +
              '<button class="btn sm icon" data-act="ord-edit" data-id="' + o.id + '">' + ic("edit") + "</button>" +
              '<button class="btn sm icon danger" data-act="ord-del" data-id="' + o.id + '">' + ic("trash") + "</button>" +
              "</td></tr>";
          }).join("") + "</tbody></table></div>"
        : '<div class="card">' + emptyBox("cart", q ? "Ничего не найдено" : "Заказов пока нет") + "</div>");
  }

  /* ---------------- ЧАТЫ ---------------- */
  function viewChats() {
    var chats = DB.get("chats").slice().sort(function (a, b) {
      return new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0);
    });
    if (!chats.length) return '<div class="head"><h1>Чаты</h1></div><div class="card">' +
      emptyBox("chat", "Диалогов пока нет. Они приходят из приложения на телефоне.") + "</div>";

    if (!CHAT_ID || !DB.byId("chats", CHAT_ID)) CHAT_ID = chats[0].id;
    var msgs = DB.get("messages").filter(function (m) { return m.chat_id === CHAT_ID; })
      .sort(function (a, b) { return new Date(a.sent_at) - new Date(b.sent_at); });

    var lastDay = "";
    var body = msgs.length ? msgs.map(function (m) {
      var day = R.dOnly(m.sent_at), sep = "";
      if (day !== lastDay) { lastDay = day; sep = '<div class="daysep">' + esc(day) + "</div>"; }
      return sep + '<div class="bub ' + (m.direction === "out" ? "out" : "in") + '">' + esc(m.body) +
        '<div class="mt">' + (m.is_auto ? ic("bolt") + " авто · " : "") + dt(m.sent_at, true) + "</div></div>";
    }).join("") : emptyBox("chat", "В этом диалоге пока нет сообщений");

    return '<div class="head"><div><h1>Чаты</h1><div class="sub">' + num(chats.length) + " диалогов</div></div></div>" +
      '<div class="chatw"><div class="clist">' + chats.map(function (c) {
        var last = DB.get("messages").filter(function (m) { return m.chat_id === c.id; })
          .sort(function (a, b) { return new Date(b.sent_at) - new Date(a.sent_at); })[0];
        return '<div class="ci ' + (c.id === CHAT_ID ? "on" : "") + '" data-chat="' + c.id + '">' +
          '<div class="nm">' + (c.unread ? '<i class="dot"></i>' : "") + esc(c.buyer_name || "покупатель") + "</div>" +
          '<div class="ms">' + esc(last ? last.body.slice(0, 48) : "—") + "</div></div>";
      }).join("") + "</div>" +
      '<div class="msgs">' + body + "</div></div>";
  }

  /* ---------------- ПРАВИЛА ---------------- */
  function viewRules() {
    var rows = DB.get("message_rules").slice().sort(function (a, b) { return (a.priority || 100) - (b.priority || 100); });
    return '<div class="head"><div><h1>Авто-сообщения</h1>' +
      '<div class="sub">Правила, по которым бот на телефоне отвечает покупателям</div></div>' +
      '<span class="grow"></span><button class="btn pri" data-act="rule-new">' + ic("plus") + " Правило</button></div>" +
      '<div class="note" style="margin-bottom:14px">' + ic("warn") +
      " Правила хранятся здесь, а применяет их приложение на телефоне: отправлять сообщения на площадку из браузера нельзя.</div>" +
      (rows.length
        ? '<div class="grid g2">' + rows.map(function (r) {
            return '<div class="card"><div style="display:flex;align-items:center;gap:10px">' +
              "<h2>" + esc(r.name) + "</h2><span class=\"grow\"></span>" +
              (r.is_enabled ? '<span class="pill ok">включено</span>' : '<span class="pill mute">выключено</span>') + "</div>" +
              '<div class="stat-line" style="margin-top:9px">' +
              "<span>" + esc(R.TRIGGERS[r.trigger] || r.trigger) + "</span>" +
              "<span>приоритет <b>" + (r.priority || 100) + "</b></span>" +
              "<span>пауза <b>" + (r.cooldown_sec || 300) + "</b> с</span>" +
              "<span>сработало <b>" + (r.hit_count || 0) + "</b></span></div>" +
              (r.pattern ? '<div class="t-sub" style="margin-top:8px">слова: <span class="mono">' + esc(r.pattern) + "</span></div>" : "") +
              '<div class="prev" style="margin-top:10px">' + esc(r.template) + "</div>" +
              '<div style="margin-top:12px;display:flex;gap:8px">' +
              '<button class="btn sm" data-act="rule-edit" data-id="' + r.id + '">' + ic("edit") + " Изменить</button>" +
              '<button class="btn sm" data-act="rule-toggle" data-id="' + r.id + '">' +
              (r.is_enabled ? "Выключить" : "Включить") + "</button>" +
              '<span class="grow"></span>' +
              '<button class="btn sm icon danger" data-act="rule-del" data-id="' + r.id + '">' + ic("trash") + "</button>" +
              "</div></div>";
          }).join("") + "</div>"
        : '<div class="card">' + emptyBox("bolt", "Правил пока нет",
            '<button class="btn pri" data-act="rule-new">' + ic("plus") + " Создать правило</button>") + "</div>");
  }

  /* ---------------- ЗАДАЧИ ---------------- */
  function viewJobs() {
    var rows = DB.get("jobs").slice().sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
    var TYPES = {
      publish_listing: "публикация объявления", bump_listing: "подъём объявления",
      deliver_order: "выдача заказа", send_message: "отправка сообщения", sync: "синхронизация",
    };
    return '<div class="head"><div><h1>Задачи</h1><div class="sub">Очередь движка: три попытки с паузами 1, 4 и 9 минут</div></div>' +
      '<span class="grow"></span>' +
      (rows.some(function (j) { return j.status === "failed"; })
        ? '<button class="btn" data-act="job-retry-all">Повторить неудачные</button>' : "") +
      (rows.length ? '<button class="btn danger" data-act="job-clear">Очистить готовые</button>' : "") + "</div>" +
      (rows.length
        ? '<div class="tw"><table><thead><tr><th>Тип</th><th>Статус</th><th>Попытки</th><th>Запуск</th><th>Ошибка</th></tr></thead><tbody>' +
          rows.slice(0, 300).map(function (j) {
            return "<tr>" +
              '<td><div class="t-title">' + esc(TYPES[j.type] || j.type) + "</div>" +
              '<div class="t-sub mono">' + esc(JSON.stringify(j.payload || {}).slice(0, 48)) + "</div></td>" +
              "<td>" + pill(R.JOB_ST, j.status) + "</td>" +
              '<td class="num">' + (j.attempts || 0) + " / " + (j.max_attempts || 3) + "</td>" +
              '<td class="muted nowrap">' + dt(j.run_at, true) + "</td>" +
              '<td class="muted">' + esc(String(j.last_error || "—").slice(0, 70)) + "</td></tr>";
          }).join("") + "</tbody></table></div>"
        : '<div class="card">' + emptyBox("list", "Очередь пуста") + "</div>");
  }

  /* ---------------- ЖУРНАЛ ---------------- */
  function viewEvents() {
    var q = Q.events || "";
    var rows = DB.get("events").filter(function (e) { return match(e, q, ["type", "level"]); })
      .sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
    var LV = { info: "info", warn: "warn", error: "err" };
    return '<div class="head"><div><h1>Журнал</h1><div class="sub">' + num(rows.length) + " событий</div></div>" +
      '<span class="grow"></span>' + searchBar("events", "Тип события…") +
      '<button class="btn" data-act="ev-export">' + ic("dl") + " Экспорт</button>" +
      (rows.length ? '<button class="btn danger" data-act="ev-clear">Очистить</button>' : "") + "</div>" +
      (rows.length
        ? '<div class="tw"><table><thead><tr><th>Время</th><th>Уровень</th><th>Событие</th><th>Подробности</th></tr></thead><tbody>' +
          rows.slice(0, 400).map(function (e) {
            return "<tr>" +
              '<td class="muted nowrap mono">' + dt(e.created_at, true) + "</td>" +
              '<td><span class="pill ' + (LV[e.level] || "mute") + '">' + esc(e.level) + "</span></td>" +
              '<td class="t-title">' + esc(e.type) + "</td>" +
              '<td class="muted mono" style="font-size:12px">' + esc(JSON.stringify(e.payload || {}).slice(0, 90)) + "</td></tr>";
          }).join("") + "</tbody></table></div>"
        : '<div class="card">' + emptyBox("inbox", "Журнал пуст") + "</div>");
  }

  /* ---------------- НАСТРОЙКИ ---------------- */
  function viewSettings() {
    var s = DB.settings;
    var accs = DB.get("accounts");
    return '<div class="head"><h1>Настройки</h1></div>' +
      '<div class="grid g2">' +

      '<div class="card"><h2>Где хранятся данные</h2>' +
      '<div class="sub" style="margin-bottom:14px">Панель ничего не решает за вас: либо всё лежит в этом браузере, ' +
      "либо в вашем проекте Supabase — том же, куда выгружает телефон.</div>" +
      '<div class="fld"><label>Хранилище</label><select id="setDriver">' +
      '<option value="local"' + (s.driver === "local" ? " selected" : "") + ">В этом браузере (IndexedDB)</option>" +
      '<option value="supabase"' + (s.driver === "supabase" ? " selected" : "") + ">Supabase — общая база с телефоном</option>" +
      "</select></div>" +
      '<div id="sbBox" style="margin-top:12px;' + (s.driver === "supabase" ? "" : "display:none") + '">' +
      '<div class="fld"><label>URL проекта</label><input type="text" id="setUrl" value="' + esc(s.sbUrl) +
      '" placeholder="https://xxxx.supabase.co"></div>' +
      '<div class="fld" style="margin-top:10px"><label>Ключ доступа</label>' +
      '<input type="password" id="setKey" value="' + esc(s.sbKey) + '" placeholder="anon или service_role">' +
      '<span class="hint">Ключ хранится только в этом браузере и никуда не отправляется, кроме вашего же проекта Supabase. ' +
      "Сайт публичный — не вставляйте ключ на чужом компьютере.</span></div>" +
      '<div style="margin-top:12px;display:flex;gap:8px">' +
      '<button class="btn" data-act="sb-ping">Проверить связь</button></div>' +
      '<div class="fld" style="margin-top:12px"><label><input type="checkbox" id="setLive"' +
      (s.live === false ? "" : " checked") + '> Обновлять данные самой</label>' +
      '<span class="hint">Панель сверяется с базой раз в 20 секунд и перерисовывается, когда ' +
      "воркер или телефон что-то дописали. Выключите, если хотите экономить лимиты бесплатного " +
      "тарифа или смотреть срез на один момент.</span></div></div>" +
      '<div style="margin-top:14px"><button class="btn pri" data-act="settings-save">' + ic("ok") + " Сохранить и перезагрузить</button></div>" +
      "</div>" +

      '<div class="card"><h2>Аккаунты площадок</h2>' +
      '<div class="sub" style="margin-bottom:12px">Нужны, чтобы привязывать объявления и заказы.</div>' +
      (accs.length
        ? '<div class="tw" style="border:0"><table><tbody>' + accs.map(function (a) {
            return "<tr><td>" + platPill(a.platform) + "</td>" +
              '<td class="t-title">' + esc(a.label) + "</td>" +
              "<td>" + (a.is_active ? '<span class="pill ok">активен</span>' : '<span class="pill mute">выключен</span>') + "</td>" +
              '<td class="acts"><button class="btn sm icon danger" data-act="acc-del" data-id="' + a.id + '">' + ic("trash") + "</button></td></tr>";
          }).join("") + "</tbody></table></div>"
        : '<p class="muted">Аккаунтов пока нет.</p>') +
      '<div style="margin-top:12px"><button class="btn" data-act="acc-new">' + ic("plus") + " Добавить аккаунт</button></div>" +
      "</div>" +

      '<div class="card"><h2>Вид и валюта</h2>' +
      '<div class="fld"><label>Тема</label><select id="setTheme">' +
      '<option value="dark"' + (s.theme === "dark" ? " selected" : "") + ">Тёмная</option>" +
      '<option value="light"' + (s.theme === "light" ? " selected" : "") + ">Светлая</option>" +
      "</select></div>" +
      '<div class="fld" style="margin-top:10px"><label>Валюта по умолчанию</label><select id="setCur">' +
      ["RUB", "USD", "EUR"].map(function (c) {
        return '<option value="' + c + '"' + (s.currency === c ? " selected" : "") + ">" + c + "</option>";
      }).join("") + "</select></div>" +
      '<div class="fld" style="margin-top:10px"><label>Ник продавца</label>' +
      '<input type="text" id="setSeller" value="' + esc(s.seller) + '" placeholder="для {{seller}} в шаблонах"></div>' +
      "</div>" +

      '<div class="card"><h2>Пароль хранилища ключей</h2>' +
      '<div class="sub" style="margin-bottom:12px">Ключи склада шифруются AES-256-GCM. Пароль живёт только в этой вкладке: ' +
      "закрыли — вводить заново. Забыли — расшифровать старые ключи будет нечем.</div>" +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button class="btn" data-act="vault-unlock">' + ic("lock") + " " +
      (R.VAULT.pass ? "Сменить пароль" : "Ввести пароль") + "</button>" +
      (R.VAULT.pass ? '<button class="btn" data-act="vault-lock">Забыть до перезагрузки</button>' : "") +
      "</div>" +
      '<p class="muted" style="margin-top:10px">Сейчас: ' +
      (R.VAULT.pass ? '<span class="pill ok">введён</span>' : '<span class="pill mute">не введён</span>') + "</p></div>" +

      '<div class="card"><h2>Данные</h2>' +
      '<div class="stat-line" style="margin-bottom:14px">' + R.TABLES.map(function (t) {
        return "<span>" + t + " <b>" + DB.get(t).length + "</b></span>";
      }).join("") + "</div>" +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button class="btn" data-act="dump-export">' + ic("dl") + " Выгрузить всё в JSON</button>" +
      '<button class="btn" data-act="dump-import">' + ic("ul") + " Загрузить из JSON</button>" +
      '<button class="btn" data-act="demo">Заполнить примером</button>' +
      '<button class="btn danger" data-act="wipe">Стереть всё</button>' +
      "</div></div>" +

      "</div>";
  }

  /* ---------------- отрисовка ---------------- */
  var VIEWS = {
    dash: viewDash, products: viewProducts, stock: viewStock, listings: viewListings,
    orders: viewOrders, chats: viewChats, rules: viewRules, jobs: viewJobs,
    events: viewEvents, settings: viewSettings,
  };

  function render() {
    var body;
    if (!loaded) {
      body = '<div class="card">' + emptyBox("chart", loadErr ? "Не удалось прочитать данные: " + loadErr : "Загрузка…") + "</div>";
    } else {
      try { body = (VIEWS[TAB] || viewDash)(); }
      catch (e) { body = '<div class="card">' + emptyBox("warn", "Ошибка отрисовки: " + e.message) + "</div>"; }
    }
    el("app").innerHTML = header() + "<main>" + body + "</main>";
    document.documentElement.setAttribute("data-theme", DB.settings.theme === "light" ? "light" : "dark");
  }
  window.__render = render;
  window.__setTab = function (t) { TAB = t; render(); };
  window.__toast = toast;
  window.__ic = ic;

  /* ---------------- события ---------------- */
  document.addEventListener("click", function (e) {
    var tab = e.target.closest("[data-tab]");
    if (tab) { TAB = tab.getAttribute("data-tab"); render(); return; }

    var chat = e.target.closest("[data-chat]");
    if (chat) { CHAT_ID = chat.getAttribute("data-chat"); render(); return; }

    var s = e.target.closest("[data-sort]");
    if (s) {
      var parts = s.getAttribute("data-sort").split(":");
      var t = parts[0], k = parts[1];
      var curSort = SORT[t] || {};
      SORT[t] = { k: k, d: curSort.k === k && curSort.d === "asc" ? "desc" : "asc" };
      render(); return;
    }

    if (e.target.closest("#themeBtn")) {
      DB.settings.theme = DB.settings.theme === "light" ? "dark" : "light";
      R.saveSettings(DB.settings); render(); return;
    }

    var act = e.target.closest("[data-act]");
    if (act && window.__actions) {
      window.__actions(act.getAttribute("data-act"), act.getAttribute("data-id"), act);
    }
  });

  document.addEventListener("input", function (e) {
    var q = e.target.getAttribute && e.target.getAttribute("data-q");
    if (q != null) {
      Q[q] = e.target.value;
      var pos = e.target.selectionStart;
      render();
      var again = document.querySelector('[data-q="' + q + '"]');
      if (again) { again.focus(); try { again.setSelectionRange(pos, pos); } catch (_) {} }
    }
    if (e.target.id === "setDriver") {
      var box = el("sbBox"); if (box) box.style.display = e.target.value === "supabase" ? "" : "none";
    }
  });

  /* ---------------- старт ---------------- */
  DB.useSettings(R.loadSettings());
  render();
  DB.loadAll().then(function () {
    loaded = true; render();
    startLive();
  }, function (err) {
    loaded = true; loadErr = err.message; render();
    toast("Не удалось прочитать данные: " + err.message, "err");
  });

  /* ---------------- живое обновление ---------------- */
  function refreshLivePill() {
    var n = document.getElementById("livePill");
    if (n) n.innerHTML = livePillInner();
  }

  var livePending = false;

  /* Перерисовка по новым данным — но не из-под рук. Если открыто окно или
     курсор стоит в поле, набранное слетело бы вместе с фокусом, поэтому
     ждём, пока пользователь освободится. */
  function applyLive() {
    var ae = document.activeElement;
    var typing = ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName || "");
    if (document.querySelector(".ov") || typing) { livePending = true; refreshLivePill(); return; }
    livePending = false;
    render();
  }

  function startLive() {
    // Каждая сверка освежает плашку: без этого «обновлено только что» висело
    // бы вечно и тишину нельзя было бы отличить от сломанного опроса.
    R.LIVE.onTick = function () {
      refreshLivePill();
      if (livePending) applyLive();
    };
    // Тостом не дёргаем: заказы приходят сами, сообщать об этом каждую минуту незачем.
    R.LIVE.start(applyLive);
    render();
  }
  window.__startLive = startLive;

  // Вкладку свернули — опрос простаивает; вернулись — сверяемся сразу, не
  // дожидаясь следующего тика, иначе панель встречает устаревшими цифрами.
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && R.LIVE.state === "poll") R.LIVE.tick();
  });

})();
