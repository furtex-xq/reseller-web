/* Reseller Web — формы и действия: создание, правка, импорт, экспорт. */
(function () {
  "use strict";
  var R = window.RS, DB = R.DB, esc = R.esc;
  var render = window.__render, toast = window.__toast, ic = window.__ic;

  /* ---------------- модальное окно ---------------- */
  var cur = null;
  function modal(opts) {
    close();
    var ov = document.createElement("div");
    ov.className = "ov";
    ov.innerHTML = '<div class="modal ' + (opts.wide ? "wide" : "") + '">' +
      '<div class="mh"><h2>' + esc(opts.title) + '</h2><span class="grow"></span>' +
      '<button class="btn icon" data-close>' + ic("x") + "</button></div>" +
      '<div class="mb">' + opts.body + "</div>" +
      '<div class="mf">' + (opts.footer != null ? opts.footer :
        '<button class="btn" data-close>Отмена</button><button class="btn pri" data-ok>' +
        esc(opts.ok || "Сохранить") + "</button>") + "</div></div>";
    document.body.appendChild(ov);
    cur = ov;
    ov.addEventListener("click", function (e) {
      if (e.target === ov || e.target.closest("[data-close]")) { close(); return; }
      if (e.target.closest("[data-ok]") && opts.onOk) opts.onOk(ov);
    });
    if (opts.onOpen) opts.onOpen(ov);
    var f = ov.querySelector("input,select,textarea");
    if (f) setTimeout(function () { f.focus(); }, 40);
    return ov;
  }
  function close() { if (cur) { cur.remove(); cur = null; } }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });

  function val(ov, id) { var e = ov.querySelector("#" + id); return e ? e.value.trim() : ""; }
  function chk(ov, id) { var e = ov.querySelector("#" + id); return !!(e && e.checked); }
  function fld(label, id, v, type, ph, hint) {
    return '<div class="fld"><label>' + esc(label) + "</label>" +
      '<input type="' + (type || "text") + '" id="' + id + '" value="' + esc(v == null ? "" : v) +
      '" placeholder="' + esc(ph || "") + '">' + (hint ? '<span class="hint">' + esc(hint) + "</span>" : "") + "</div>";
  }
  function area(label, id, v, ph, cls) {
    return '<div class="fld"><label>' + esc(label) + "</label>" +
      '<textarea id="' + id + '" class="' + (cls || "") + '" placeholder="' + esc(ph || "") + '">' +
      esc(v == null ? "" : v) + "</textarea></div>";
  }
  function sel(label, id, v, opts, hint) {
    return '<div class="fld"><label>' + esc(label) + "</label><select id=\"" + id + "\">" +
      opts.map(function (o) {
        return '<option value="' + esc(o[0]) + '"' + (String(v) === String(o[0]) ? " selected" : "") + ">" + esc(o[1]) + "</option>";
      }).join("") + "</select>" + (hint ? '<span class="hint">' + esc(hint) + "</span>" : "") + "</div>";
  }
  function check(label, id, v) {
    return '<label class="chk"><input type="checkbox" id="' + id + '"' + (v ? " checked" : "") + "><span>" + esc(label) + "</span></label>";
  }
  function done(msg) { close(); render(); toast(msg, "ok"); }
  function fail(e) { toast("Не сохранилось: " + (e && e.message ? e.message : e), "err"); }

  function pickFile(accept, cb) {
    var i = document.createElement("input");
    i.type = "file"; i.accept = accept;
    i.onchange = function () {
      var f = i.files && i.files[0]; if (!f) return;
      var fr = new FileReader();
      fr.onload = function () { cb(String(fr.result), f.name); };
      fr.readAsText(f, "utf-8");
    };
    i.click();
  }

  /* ---------------- товары ---------------- */
  function productForm(id) {
    var p = id ? DB.byId("products", id) : null;
    var isNew = !p;
    p = p || { sku: "", title: "", description: "", category: "", game: "", price: 0,
      currency: DB.settings.currency || "RUB", auto_delivery: false,
      delivery_template: "Спасибо за покупку! Ваш товар: {{key}}", low_stock_alert: 3, is_archived: false };
    modal({
      title: isNew ? "Новый товар" : "Товар " + p.sku,
      body:
        '<div class="row2">' + fld("Артикул", "f_sku", p.sku, "text", "CS2-CFG") +
        fld("Цена", "f_price", p.price, "number", "0") + "</div>" +
        fld("Название", "f_title", p.title, "text", "Настройка CS2: FPS, прицел, звук") +
        '<div class="row2">' + fld("Игра", "f_game", p.game, "text", "Counter-Strike 2") +
        fld("Категория", "f_cat", p.category, "text", "Обучение") + "</div>" +
        area("Описание", "f_desc", p.description, "Короткое описание для площадки") +
        '<div class="sep"></div>' +
        check("Авто-выдача: отправлять ключ со склада", "f_auto", p.auto_delivery) +
        '<div class="row2">' + fld("Порог «мало осталось»", "f_low", p.low_stock_alert, "number") +
        sel("Валюта", "f_cur", p.currency, [["RUB", "₽ RUB"], ["USD", "$ USD"], ["EUR", "€ EUR"]]) + "</div>" +
        area("Сообщение при выдаче", "f_tpl", p.delivery_template, "{{key}} подставит ключ со склада") +
        '<div class="tpl">' + R.PLACEHOLDERS.map(function (x) {
          return '<button type="button" data-ins="f_tpl" data-val="{{' + x + '}}">{{' + x + "}}</button>";
        }).join("") + "</div>" +
        (isNew ? "" : '<div class="sep"></div>' + check("В архиве (не показывать в списках)", "f_arch", p.is_archived)),
      onOpen: bindInserts,
      onOk: function (ov) {
        var sku = val(ov, "f_sku"), title = val(ov, "f_title");
        if (!sku) return toast("Артикул обязателен", "err");
        if (!title) return toast("Название обязательно", "err");
        var dup = DB.get("products").filter(function (x) { return x.sku === sku && x.id !== p.id; })[0];
        if (dup) return toast("Артикул " + sku + " уже занят", "err");
        var rec = Object.assign({}, p, {
          sku: sku, title: title, description: val(ov, "f_desc"),
          category: val(ov, "f_cat"), game: val(ov, "f_game"),
          price: Number(val(ov, "f_price")) || 0, currency: val(ov, "f_cur"),
          auto_delivery: chk(ov, "f_auto"), low_stock_alert: Number(val(ov, "f_low")) || 3,
          delivery_template: val(ov, "f_tpl"), is_archived: isNew ? false : chk(ov, "f_arch"),
          updated_at: R.nowIso(),
        });
        DB.save("products", rec).then(function () {
          DB.log(isNew ? "product_created" : "product_updated", "info", { sku: sku });
          done(isNew ? "Товар добавлен" : "Сохранено");
        }, fail);
      },
    });
  }
  function bindInserts(ov) {
    ov.querySelectorAll("[data-ins]").forEach(function (b) {
      b.addEventListener("click", function () {
        var t = ov.querySelector("#" + b.getAttribute("data-ins"));
        if (!t) return;
        var s = t.selectionStart || t.value.length;
        t.value = t.value.slice(0, s) + b.getAttribute("data-val") + t.value.slice(t.selectionEnd || s);
        t.focus(); t.dispatchEvent(new Event("input", { bubbles: true }));
      });
    });
    var tpl = ov.querySelector("#r_tpl"), prev = ov.querySelector("#r_prev");
    if (tpl && prev) {
      var upd = function () {
        prev.textContent = R.renderTemplate(tpl.value, {
          buyer: "Иван", product: "Настройка CS2", sku: "CS2-CFG", price: "199",
          amount: "199", currency: "₽", order: "#A1B2C3", key: "XXXX-YYYY-ZZZZ",
          seller: DB.settings.seller || "продавец",
        });
      };
      tpl.addEventListener("input", upd); upd();
    }
  }

  function productsCsvImport() {
    modal({
      title: "Импорт товаров из CSV",
      wide: true,
      body:
        '<div class="note">Первая строка — заголовки. Разделитель: <b>;</b> <b>,</b> или таб. ' +
        "Товар с уже существующим артикулом будет обновлён, а не продублирован.</div>" +
        area("Данные", "imp_txt", "sku;title;game;category;price;auto_delivery\nCS2-CFG;Настройка CS2;Counter-Strike 2;Обучение;199;1",
          "", "code") +
        '<div><button class="btn" data-pick>' + ic("ul") + " Выбрать файл .csv</button></div>",
      ok: "Импортировать",
      onOpen: function (ov) {
        ov.querySelector("[data-pick]").addEventListener("click", function () {
          pickFile(".csv,.txt", function (text) { ov.querySelector("#imp_txt").value = text; });
        });
      },
      onOk: function (ov) {
        var rows = R.csvParse(val(ov, "imp_txt"));
        if (rows.length < 2) return toast("Нужны заголовки и хотя бы одна строка", "err");
        var head = rows[0].map(function (h) { return h.trim().toLowerCase(); });
        var idx = function (n) { return head.indexOf(n); };
        if (idx("sku") < 0 || idx("title") < 0) return toast("Нужны колонки sku и title", "err");
        var existing = {};
        DB.get("products").forEach(function (p) { existing[p.sku] = p; });
        var list = [], bad = 0;
        rows.slice(1).forEach(function (r) {
          var sku = (r[idx("sku")] || "").trim();
          var title = (r[idx("title")] || "").trim();
          if (!sku || !title) { bad++; return; }
          var old = existing[sku] || {};
          var g = function (n, d) { var i = idx(n); return i >= 0 && r[i] != null && r[i] !== "" ? r[i].trim() : d; };
          list.push(Object.assign({}, old, {
            id: old.id || R.uuid(), sku: sku, title: title,
            game: g("game", old.game || ""), category: g("category", old.category || ""),
            description: g("description", old.description || ""),
            price: Number(g("price", old.price || 0)) || 0,
            currency: g("currency", old.currency || DB.settings.currency || "RUB"),
            auto_delivery: /^(1|true|да|yes|y)$/i.test(g("auto_delivery", old.auto_delivery ? "1" : "0")),
            low_stock_alert: Number(g("low_stock_alert", old.low_stock_alert || 3)) || 3,
            delivery_template: g("delivery_template", old.delivery_template || "Спасибо за покупку! Ваш товар: {{key}}"),
            is_archived: !!old.is_archived,
            created_at: old.created_at || R.nowIso(), updated_at: R.nowIso(),
          }));
        });
        if (!list.length) return toast("Не нашлось ни одной строки с sku и title", "err");
        var i = 0;
        (function step() {
          if (i >= list.length) {
            DB.log("products_imported", "info", { count: list.length });
            return done("Импортировано: " + list.length + (bad ? ", пропущено: " + bad : ""));
          }
          DB.save("products", list[i++]).then(step, fail);
        })();
      },
    });
  }

  function productsExport() {
    var rows = DB.get("products").map(function (p) {
      return [p.sku, p.title, p.game, p.category, p.price, p.currency,
        p.auto_delivery ? 1 : 0, p.low_stock_alert, p.delivery_template, p.description];
    });
    R.download("products-" + R.dOnly(new Date()) + ".csv",
      R.csvBuild(["sku", "title", "game", "category", "price", "currency",
        "auto_delivery", "low_stock_alert", "delivery_template", "description"], rows));
    toast("Выгружено товаров: " + rows.length, "ok");
  }

  /* ---------------- склад ---------------- */
  function stockAdd() {
    var prods = DB.get("products").filter(function (p) { return !p.is_archived; });
    if (!prods.length) return toast("Сначала добавьте товар", "err");
    modal({
      title: "Добавить ключи на склад",
      wide: true,
      body:
        sel("Товар", "k_prod", prods[0].id, prods.map(function (p) { return [p.id, p.sku + " — " + p.title]; })) +
        area("Ключи, по одному в строке", "k_list", "", "XXXX-YYYY-ZZZZ\nAAAA-BBBB-CCCC", "code") +
        fld("Заметка (необязательно)", "k_note", "", "text", "партия от 25.09") +
        (R.VAULT.pass
          ? '<div class="note">' + ic("lock") + " Пароль хранилища введён — ключи лягут зашифрованными.</div>"
          : '<div class="note warn">' + ic("warn") + " <b>Пароль хранилища не введён.</b> Ключи сохранятся как есть, без шифрования. " +
            "Задайте пароль в настройках, если храните ценные коды.</div>"),
      ok: "Добавить",
      onOk: function (ov) {
        var pid = val(ov, "k_prod");
        var lines = val(ov, "k_list").split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
        if (!lines.length) return toast("Не видно ни одного ключа", "err");
        var note = val(ov, "k_note");
        var i = 0;
        (function step() {
          if (i >= lines.length) {
            DB.log("keys_added", "info", { count: lines.length, product_id: pid });
            return done("Добавлено ключей: " + lines.length);
          }
          var line = lines[i++];
          R.encKey(line).then(function (enc) {
            return DB.save("stock_keys", {
              id: R.uuid(), product_id: pid, payload_enc: enc, status: "available",
              note: note, created_at: R.nowIso(),
            });
          }).then(step, fail);
        })();
      },
    });
  }

  function vaultUnlock() {
    modal({
      title: "Пароль хранилища ключей",
      body:
        '<div class="note">Пароль не сохраняется нигде: ни на диск, ни в облако. Закроете вкладку — введёте заново. ' +
        "Потеряете пароль — расшифровать старые ключи будет нечем, это цена шифрования.</div>" +
        fld("Пароль", "v_pass", "", "password", "минимум 6 символов"),
      ok: "Применить",
      onOk: function (ov) {
        var p = val(ov, "v_pass");
        if (p.length < 6) return toast("Слишком короткий пароль", "err");
        R.VAULT.pass = p;
        close(); render(); toast("Пароль принят", "ok");
        revealKeys();
      },
    });
  }
  // После ввода пароля показываем значения прямо в таблице, не перерисовывая её.
  function revealKeys() {
    document.querySelectorAll("[data-key]").forEach(function (td) {
      var k = DB.byId("stock_keys", td.getAttribute("data-key"));
      if (!k) return;
      R.decKey(k.payload_enc).then(function (v) { td.textContent = v; },
        function () { td.innerHTML = '<span class="muted">пароль не подошёл</span>'; });
    });
  }

  function stockExport() {
    if (!R.VAULT.pass && DB.get("stock_keys").some(function (k) { return k.payload_enc.indexOf("v1:") === 0; })) {
      return toast("Введите пароль хранилища — иначе выгрузятся звёздочки", "err");
    }
    var keys = DB.get("stock_keys");
    Promise.all(keys.map(function (k) {
      return R.decKey(k.payload_enc).then(function (v) {
        var p = DB.byId("products", k.product_id);
        return [p ? p.sku : "", v, k.status, k.note || "", k.created_at];
      }, function () { return [k.product_id, "?", k.status, k.note || "", k.created_at]; });
    })).then(function (rows) {
      R.download("stock-" + R.dOnly(new Date()) + ".csv",
        R.csvBuild(["sku", "key", "status", "note", "created_at"], rows));
      toast("Выгружено ключей: " + rows.length, "ok");
    });
  }

  /* ---------------- объявления ---------------- */
  function listingForm(id) {
    var l = id ? DB.byId("listings", id) : null;
    var isNew = !l;
    var prods = DB.get("products").filter(function (p) { return !p.is_archived; });
    var accs = DB.get("accounts");
    if (!prods.length) return toast("Сначала добавьте товар", "err");
    if (!accs.length) return toast("Сначала добавьте аккаунт площадки в настройках", "err");
    l = l || { product_id: prods[0].id, account_id: accs[0].id, platform: accs[0].platform,
      status: "draft", auto_bump: false, bump_interval_min: 240, price_override: "", url: "" };
    modal({
      title: isNew ? "Новое объявление" : "Объявление",
      body:
        sel("Товар", "l_prod", l.product_id, prods.map(function (p) { return [p.id, p.sku + " — " + p.title]; })) +
        sel("Аккаунт", "l_acc", l.account_id, accs.map(function (a) { return [a.id, (R.PLATFORMS[a.platform] || a.platform) + " · " + a.label]; })) +
        '<div class="row2">' +
        sel("Статус", "l_st", l.status, Object.keys(R.LISTING_ST).map(function (k) { return [k, R.LISTING_ST[k].t]; })) +
        fld("Своя цена", "l_price", l.price_override, "number", "пусто — цена товара") + "</div>" +
        fld("Ссылка на лот", "l_url", l.url, "text", "https://funpay.com/lots/offer?id=…") +
        '<div class="sep"></div>' +
        check("Авто-подъём объявления", "l_bump", l.auto_bump) +
        fld("Интервал подъёма, минут", "l_int", l.bump_interval_min, "number", "240",
          "Подъём выполняет приложение на телефоне — панель только хранит настройку"),
      onOk: function (ov) {
        var acc = DB.byId("accounts", val(ov, "l_acc"));
        var rec = Object.assign({}, l, {
          product_id: val(ov, "l_prod"), account_id: val(ov, "l_acc"),
          platform: acc ? acc.platform : "funpay",
          status: val(ov, "l_st"),
          price_override: val(ov, "l_price") === "" ? null : Number(val(ov, "l_price")),
          url: val(ov, "l_url"), auto_bump: chk(ov, "l_bump"),
          bump_interval_min: Number(val(ov, "l_int")) || 240, updated_at: R.nowIso(),
        });
        DB.save("listings", rec).then(function () { done(isNew ? "Объявление создано" : "Сохранено"); }, fail);
      },
    });
  }

  /* ---------------- заказы ---------------- */
  function orderForm(id) {
    var o = id ? DB.byId("orders", id) : null;
    var isNew = !o;
    var accs = DB.get("accounts"), prods = DB.get("products");
    if (!accs.length) return toast("Сначала добавьте аккаунт площадки в настройках", "err");
    o = o || { account_id: accs[0].id, platform: accs[0].platform, external_id: "",
      buyer_name: "", title_raw: "", amount: 0, currency: DB.settings.currency || "RUB",
      status: "new", product_id: null, created_at: R.nowIso() };
    modal({
      title: isNew ? "Новый заказ" : "Заказ " + (o.external_id || ""),
      body:
        '<div class="row2">' +
        sel("Аккаунт", "o_acc", o.account_id, accs.map(function (a) { return [a.id, (R.PLATFORMS[a.platform] || a.platform) + " · " + a.label]; })) +
        fld("Номер на площадке", "o_ext", o.external_id, "text", "A1B2C3") + "</div>" +
        '<div class="row2">' + fld("Покупатель", "o_buyer", o.buyer_name, "text") +
        sel("Статус", "o_st", o.status, Object.keys(R.ORDER_ST).map(function (k) { return [k, R.ORDER_ST[k].t]; })) + "</div>" +
        sel("Товар", "o_prod", o.product_id || "", [["", "— не привязан —"]].concat(
          prods.map(function (p) { return [p.id, p.sku + " — " + p.title]; }))) +
        fld("Название на площадке", "o_raw", o.title_raw, "text", "как называется лот в заказе") +
        '<div class="row2">' + fld("Сумма", "o_amt", o.amount, "number") +
        sel("Валюта", "o_cur", o.currency, [["RUB", "₽ RUB"], ["USD", "$ USD"], ["EUR", "€ EUR"]]) + "</div>",
      onOk: function (ov) {
        var acc = DB.byId("accounts", val(ov, "o_acc"));
        var rec = Object.assign({}, o, {
          account_id: val(ov, "o_acc"), platform: acc ? acc.platform : "funpay",
          external_id: val(ov, "o_ext"), buyer_name: val(ov, "o_buyer"),
          product_id: val(ov, "o_prod") || null, title_raw: val(ov, "o_raw"),
          amount: Number(val(ov, "o_amt")) || 0, currency: val(ov, "o_cur"),
          status: val(ov, "o_st"),
        });
        if (rec.status === "delivered" && !rec.delivered_at) rec.delivered_at = R.nowIso();
        if (rec.status === "closed" && !rec.closed_at) rec.closed_at = R.nowIso();
        DB.save("orders", rec).then(function () {
          DB.log(isNew ? "order_created" : "order_updated", "info", { id: rec.external_id });
          done(isNew ? "Заказ добавлен" : "Сохранено");
        }, fail);
      },
    });
  }
  function ordersCsvImport() {
    var accs = DB.get("accounts");
    if (!accs.length) return toast("Сначала добавьте аккаунт площадки в настройках", "err");
    modal({
      title: "Импорт заказов",
      wide: true,
      body:
        '<div class="note">Формат тот же, что у выгрузки: колонки <b>order</b>, platform, sku, title, ' +
        "buyer, status, amount, currency, created_at. Заказ с уже известным номером обновится, " +
        "а не продублируется — файл можно заливать повторно.</div>" +
        '<div class="note">Готовый файл делает скрипт <a href="funpay-export.user.js" target="_blank" rel="noopener">funpay-export.user.js</a>: он запускается ' +
        "на самом funpay.com и собирает заказы оттуда. Панель зайти на FunPay не может — это запрет браузера, а скрипт работает внутри FunPay, где вы уже вошли.</div>" +
        area("Данные", "oi_txt", "order;platform;sku;title;buyer;status;amount;currency;created_at",
          "", "code") +
        '<div><button class="btn" data-pick>' + ic("ul") + " Выбрать файл .csv</button></div>",
      ok: "Импортировать",
      onOpen: function (ov) {
        ov.querySelector("[data-pick]").addEventListener("click", function () {
          pickFile(".csv,.txt", function (text) { ov.querySelector("#oi_txt").value = text; });
        });
      },
      onOk: function (ov) {
        var rows = R.csvParse(val(ov, "oi_txt"));
        if (rows.length < 2) return toast("Нужны заголовки и хотя бы одна строка", "err");
        var head = rows[0].map(function (h) { return h.trim().toLowerCase(); });
        var idx = function (n) { return head.indexOf(n); };
        if (idx("order") < 0) return toast("Нужна колонка order с номером заказа", "err");

        // Аккаунт выбираем по названию площадки из файла; нет совпадения — первый.
        var accBy = {};
        accs.forEach(function (a) { if (!accBy[a.platform]) accBy[a.platform] = a; });
        var platKey = function (s) {
          s = String(s || "").toLowerCase();
          return s.indexOf("playerok") >= 0 ? "playerok" : "funpay";
        };
        var bySku = {};
        DB.get("products").forEach(function (p) { bySku[p.sku.toLowerCase()] = p; });
        var known = {};
        DB.get("orders").forEach(function (o) { known[String(o.external_id).toLowerCase()] = o; });

        var list = [], upd = 0, bad = 0;
        rows.slice(1).forEach(function (r) {
          var g = function (n, d) { var i = idx(n); return i >= 0 && r[i] != null ? String(r[i]).trim() : (d || ""); };
          // Решётку в номере убираем: иначе «#A1B2» и «A1B2» станут двумя заказами.
          var ext = g("order").replace(/^#/, "");
          if (!ext) { bad++; return; }
          var old = known[ext.toLowerCase()];
          if (old) upd++;
          var pk = platKey(g("platform"));
          var acc = (old && DB.byId("accounts", old.account_id)) || accBy[pk] || accs[0];
          var st = g("status").toLowerCase();
          if (!R.ORDER_ST[st]) st = old ? old.status : "new";
          var prod = bySku[g("sku").toLowerCase()];
          var when = g("created_at");
          if (when && isNaN(new Date(when).getTime())) when = "";
          list.push(Object.assign({}, old || {}, {
            id: (old && old.id) || R.uuid(),
            account_id: acc.id, platform: acc.platform,
            external_id: ext,
            buyer_name: g("buyer", old ? old.buyer_name : ""),
            title_raw: g("title", old ? old.title_raw : ""),
            product_id: prod ? prod.id : (old ? old.product_id : null),
            amount: Number(g("amount", old ? old.amount : 0)) || 0,
            currency: (g("currency") || (old && old.currency) || DB.settings.currency || "RUB").toUpperCase(),
            status: st,
            created_at: when || (old && old.created_at) || R.nowIso(),
          }));
        });
        if (!list.length) return toast("Не нашлось ни одной строки с номером заказа", "err");
        var i = 0;
        (function step() {
          if (i >= list.length) {
            DB.log("orders_imported", "info", { count: list.length, updated: upd });
            return done("Загружено: " + (list.length - upd) + " новых" +
              (upd ? ", обновлено: " + upd : "") + (bad ? ", пропущено: " + bad : ""));
          }
          DB.save("orders", list[i++]).then(step, fail);
        })();
      },
    });
  }

  function ordersExport() {
    var rows = DB.get("orders").map(function (o) {
      var p = o.product_id ? DB.byId("products", o.product_id) : null;
      return [o.external_id, R.PLATFORMS[o.platform] || o.platform, p ? p.sku : "", o.title_raw,
        o.buyer_name, o.status, o.amount, o.currency, o.created_at];
    });
    R.download("orders-" + R.dOnly(new Date()) + ".csv",
      R.csvBuild(["order", "platform", "sku", "title", "buyer", "status", "amount", "currency", "created_at"], rows));
    toast("Выгружено заказов: " + rows.length, "ok");
  }

  /* ---------------- правила ---------------- */
  function ruleForm(id) {
    var r = id ? DB.byId("message_rules", id) : null;
    var isNew = !r;
    var prods = DB.get("products");
    r = r || { name: "", trigger: "keyword", pattern: "", template: "",
      product_id: null, platform: null, priority: 100, cooldown_sec: 300, is_enabled: true, hit_count: 0 };
    modal({
      title: isNew ? "Новое правило" : "Правило",
      wide: true,
      body:
        '<div class="row2">' + fld("Название", "r_name", r.name, "text", "Приветствие") +
        sel("Когда срабатывает", "r_trig", r.trigger,
          Object.keys(R.TRIGGERS).map(function (k) { return [k, R.TRIGGERS[k]]; })) + "</div>" +
        fld("Слова через запятую / минуты паузы", "r_pat", r.pattern, "text", "привет, здравствуйте",
          "Для «по ключевым словам» — список слов. Для «через паузу» — число минут.") +
        area("Текст сообщения", "r_tpl", r.template, "Здравствуйте, {{buyer}}! Спасибо за заказ {{order}}.") +
        '<div class="tpl">' + R.PLACEHOLDERS.map(function (x) {
          return '<button type="button" data-ins="r_tpl" data-val="{{' + x + '}}">{{' + x + "}}</button>";
        }).join("") + "</div>" +
        '<div class="fld"><label>Предпросмотр на тестовых данных</label><div class="prev" id="r_prev"></div></div>' +
        '<div class="sep"></div>' +
        '<div class="row2">' +
        sel("Только для товара", "r_prod", r.product_id || "", [["", "— для всех —"]].concat(
          prods.map(function (p) { return [p.id, p.sku + " — " + p.title]; }))) +
        sel("Только для площадки", "r_plat", r.platform || "", [["", "— для всех —"],
          ["funpay", "FunPay"], ["playerok", "Playerok"]]) + "</div>" +
        '<div class="row2">' + fld("Приоритет", "r_pri", r.priority, "number", "100",
          "Меньше — важнее: проверяется раньше") +
        fld("Пауза между срабатываниями, сек", "r_cd", r.cooldown_sec, "number", "300") + "</div>" +
        check("Правило включено", "r_on", r.is_enabled),
      onOpen: bindInserts,
      onOk: function (ov) {
        if (!val(ov, "r_name")) return toast("Название обязательно", "err");
        if (!val(ov, "r_tpl")) return toast("Текст сообщения обязателен", "err");
        var rec = Object.assign({}, r, {
          name: val(ov, "r_name"), trigger: val(ov, "r_trig"), pattern: val(ov, "r_pat"),
          template: val(ov, "r_tpl"), product_id: val(ov, "r_prod") || null,
          platform: val(ov, "r_plat") || null, priority: Number(val(ov, "r_pri")) || 100,
          cooldown_sec: Number(val(ov, "r_cd")) || 300, is_enabled: chk(ov, "r_on"),
        });
        DB.save("message_rules", rec).then(function () { done(isNew ? "Правило создано" : "Сохранено"); }, fail);
      },
    });
  }

  /* ---------------- аккаунты ---------------- */
  function accountForm() {
    modal({
      title: "Аккаунт площадки",
      body:
        sel("Площадка", "a_plat", "funpay", [["funpay", "FunPay"], ["playerok", "Playerok"]]) +
        fld("Название", "a_label", "", "text", "Основной", "Как показывать в списках") +
        fld("ID продавца на площадке", "a_ext", "", "text", "необязательно"),
      onOk: function (ov) {
        var label = val(ov, "a_label");
        if (!label) return toast("Название обязательно", "err");
        DB.save("accounts", {
          id: R.uuid(), platform: val(ov, "a_plat"), label: label,
          external_id: val(ov, "a_ext"), session_key: "web-" + R.uuid().slice(0, 8),
          is_active: true, created_at: R.nowIso(),
        }).then(function () { done("Аккаунт добавлен"); }, fail);
      },
    });
  }

  /* ---------------- данные целиком ---------------- */
  function dumpExport() {
    var out = { _app: "reseller-web", _at: R.nowIso() };
    R.TABLES.forEach(function (t) { out[t] = DB.get(t); });
    R.download("reseller-" + R.dOnly(new Date()) + ".json", JSON.stringify(out, null, 1), "application/json");
    toast("Выгружено", "ok");
  }
  function dumpImport() {
    pickFile(".json", function (text) {
      var data;
      try { data = JSON.parse(text); } catch (e) { return toast("Это не JSON", "err"); }
      var jobs = [];
      R.TABLES.forEach(function (t) {
        (data[t] || []).forEach(function (rec) { if (rec && rec.id) jobs.push([t, rec]); });
      });
      if (!jobs.length) return toast("В файле нет знакомых таблиц", "err");
      var i = 0;
      (function step() {
        if (i >= jobs.length) { render(); return toast("Загружено записей: " + jobs.length, "ok"); }
        var j = jobs[i++];
        DB.save(j[0], j[1]).then(step, fail);
      })();
    });
  }
  function wipeAll() {
    modal({
      title: "Стереть все данные",
      body: '<div class="note warn">' + ic("warn") +
        " Будут удалены товары, склад, объявления, заказы, чаты, правила, задачи и журнал " +
        "<b>из текущего хранилища</b> (" + (DB.settings.driver === "supabase" ? "Supabase" : "этот браузер") +
        "). Отменить нельзя. Сделайте выгрузку в JSON, если не уверены.</div>" +
        fld("Напишите СТЕРЕТЬ, чтобы подтвердить", "w_conf", "", "text"),
      ok: "Стереть",
      onOk: function (ov) {
        if (val(ov, "w_conf").toUpperCase() !== "СТЕРЕТЬ") return toast("Не подтверждено", "err");
        var i = 0;
        (function step() {
          if (i >= R.TABLES.length) { close(); render(); return toast("Данные стёрты", "ok"); }
          DB.wipe(R.TABLES[i++]).then(step, function (e) { fail(e); step(); });
        })();
      },
    });
  }

  /* ---------------- пример данных ---------------- */
  function demoFill() {
    var accId = R.uuid();
    var recs = [["accounts", { id: accId, platform: "funpay", label: "Основной", session_key: "demo",
      is_active: true, created_at: R.nowIso() }]];
    var demo = [
      ["CS2-CFG", "Настройка CS2: FPS, прицел, звук", "Counter-Strike 2", 199],
      ["MC-START", "Minecraft: первые три дня без смертей", "Minecraft", 149],
      ["DOTA2-LANE", "Dota 2: лайнинг и 40 крипов к 10 минуте", "Dota 2", 249],
      ["VAL-AIM", "Valorant: настройки и прицел", "Valorant", 179],
    ];
    var pids = [];
    demo.forEach(function (d) {
      var id = R.uuid(); pids.push(id);
      recs.push(["products", { id: id, sku: d[0], title: d[1], game: d[2], category: "Обучение",
        price: d[3], currency: "RUB", auto_delivery: true, low_stock_alert: 3,
        delivery_template: "Спасибо за покупку, {{buyer}}! Ваш товар: {{key}}",
        description: "", is_archived: false, created_at: R.nowIso(), updated_at: R.nowIso() }]);
      for (var k = 0; k < 5; k++) {
        recs.push(["stock_keys", { id: R.uuid(), product_id: id,
          payload_enc: "plain:" + d[0] + "-" + Math.random().toString(36).slice(2, 8).toUpperCase(),
          status: k < 4 ? "available" : "delivered", created_at: R.nowIso() }]);
      }
    });
    var names = ["Иван", "Пётр", "Алексей", "Мария", "Дмитрий", "Анна", "Сергей"];
    for (var i = 0; i < 26; i++) {
      var pi = i % pids.length;
      var when = new Date(Date.now() - Math.floor(Math.random() * 13) * 864e5 -
        Math.floor(Math.random() * 20) * 36e5);
      var stt = ["closed", "delivered", "paid", "new"][Math.min(3, Math.floor(Math.random() * 4))];
      recs.push(["orders", { id: R.uuid(), account_id: accId, platform: "funpay",
        external_id: "A" + (1000 + i), product_id: pids[pi], buyer_name: names[i % names.length],
        title_raw: demo[pi][1], amount: demo[pi][3], currency: "RUB", status: stt,
        created_at: when.toISOString() }]);
    }
    var chatId = R.uuid();
    recs.push(["chats", { id: chatId, account_id: accId, platform: "funpay", external_id: "c1",
      buyer_name: "Иван", unread: true, last_message_at: R.nowIso(), created_at: R.nowIso() }]);
    recs.push(["messages", { id: R.uuid(), chat_id: chatId, direction: "in",
      body: "Здравствуйте! Гайд подойдёт для новичка?", sent_at: new Date(Date.now() - 36e5).toISOString() }]);
    recs.push(["messages", { id: R.uuid(), chat_id: chatId, direction: "out", is_auto: true,
      body: "Здравствуйте! Да, гайд написан с нуля — предварительных знаний не нужно.",
      sent_at: new Date(Date.now() - 35e5).toISOString() }]);
    recs.push(["message_rules", { id: R.uuid(), name: "Приветствие", trigger: "first_contact",
      pattern: "", template: "Здравствуйте, {{buyer}}! Отвечу в течение нескольких минут.",
      priority: 10, cooldown_sec: 600, is_enabled: true, hit_count: 4, created_at: R.nowIso() }]);
    recs.push(["message_rules", { id: R.uuid(), name: "После оплаты", trigger: "order_paid",
      pattern: "", template: "Спасибо за покупку, {{buyer}}! Ваш товар: {{key}}. Вопросы — пишите сюда.",
      priority: 20, cooldown_sec: 60, is_enabled: true, hit_count: 22, created_at: R.nowIso() }]);

    var i2 = 0;
    (function step() {
      if (i2 >= recs.length) { render(); return toast("Пример загружен: " + recs.length + " записей", "ok"); }
      var r = recs[i2++];
      DB.save(r[0], r[1]).then(step, fail);
    })();
  }

  /* ---------------- настройки ---------------- */
  function settingsSave() {
    var s = Object.assign({}, DB.settings);
    var g = function (id) { var e = document.getElementById(id); return e ? e.value.trim() : ""; };
    s.driver = g("setDriver") || "local";
    s.sbUrl = g("setUrl"); s.sbKey = g("setKey");
    s.theme = g("setTheme") || "dark"; s.currency = g("setCur") || "RUB";
    s.seller = g("setSeller");
    if (s.driver === "supabase" && (!s.sbUrl || !s.sbKey)) return toast("Для Supabase нужны URL и ключ", "err");
    DB.useSettings(s);
    render();
    DB.loadAll().then(function () { render(); toast("Сохранено", "ok"); },
      function (e) { render(); toast("Сохранено, но база не прочиталась: " + e.message, "err"); });
  }
  function sbPing() {
    var url = (document.getElementById("setUrl") || {}).value;
    var key = (document.getElementById("setKey") || {}).value;
    if (!url || !key) return toast("Заполните URL и ключ", "err");
    toast("Проверяю…");
    R.SupabaseDriver(url.trim(), key.trim()).ping().then(function () {
      toast("Связь есть, таблица products читается", "ok");
    }, function (e) { toast("Не вышло: " + e.message, "err"); });
  }

  /* ---------------- подтверждение удаления ---------------- */
  function confirmDel(what, fn) {
    modal({
      title: "Удалить?",
      body: '<div class="note warn">' + ic("warn") + " " + esc(what) + " Отменить нельзя.</div>",
      ok: "Удалить",
      onOk: function () { fn(); },
    });
  }

  /* ---------------- диспетчер ---------------- */
  window.__actions = function (act, id) {
    switch (act) {
      case "prod-new": return productForm(null);
      case "prod-edit": return productForm(id);
      case "prod-del": {
        var p = DB.byId("products", id); if (!p) return;
        var n = DB.get("stock_keys").filter(function (k) { return k.product_id === id; }).length;
        return confirmDel("Товар «" + p.title + "»" + (n ? " и " + n + " ключей склада" : "") + " будут удалены.", function () {
          Promise.all(DB.get("stock_keys").filter(function (k) { return k.product_id === id; })
            .map(function (k) { return DB.remove("stock_keys", k.id); }))
            .then(function () { return DB.remove("products", id); })
            .then(function () { done("Товар удалён"); }, fail);
        });
      }
      case "prod-import": return productsCsvImport();
      case "prod-export": return productsExport();

      case "stock-add": return stockAdd();
      case "stock-export": return stockExport();
      case "vault-unlock": return vaultUnlock();
      case "vault-lock": R.VAULT.pass = null; render(); return toast("Пароль забыт");
      case "key-burn": {
        var k = DB.byId("stock_keys", id); if (!k) return;
        k.status = "burned";
        return DB.save("stock_keys", k).then(function () { render(); toast("Ключ списан"); }, fail);
      }
      case "key-del": return confirmDel("Ключ будет удалён со склада.", function () {
        DB.remove("stock_keys", id).then(function () { done("Удалено"); }, fail);
      });

      case "lst-new": return listingForm(null);
      case "lst-edit": return listingForm(id);
      case "lst-del": return confirmDel("Объявление будет удалено.", function () {
        DB.remove("listings", id).then(function () { done("Удалено"); }, fail);
      });

      case "ord-new": return orderForm(null);
      case "ord-edit": return orderForm(id);
      case "ord-import": return ordersCsvImport();
      case "ord-export": return ordersExport();
      case "ord-del": return confirmDel("Заказ будет удалён.", function () {
        DB.remove("orders", id).then(function () { done("Удалено"); }, fail);
      });

      case "rule-new": return ruleForm(null);
      case "rule-edit": return ruleForm(id);
      case "rule-toggle": {
        var r = DB.byId("message_rules", id); if (!r) return;
        r.is_enabled = !r.is_enabled;
        return DB.save("message_rules", r).then(function () { render(); }, fail);
      }
      case "rule-del": return confirmDel("Правило будет удалено.", function () {
        DB.remove("message_rules", id).then(function () { done("Удалено"); }, fail);
      });

      case "job-retry-all": {
        var failed = DB.get("jobs").filter(function (j) { return j.status === "failed"; });
        if (!failed.length) return;
        var i = 0;
        return (function step() {
          if (i >= failed.length) { render(); return toast("Поставлено в очередь: " + failed.length, "ok"); }
          var j = failed[i++];
          j.status = "pending"; j.attempts = 0; j.last_error = null; j.run_at = R.nowIso();
          DB.save("jobs", j).then(step, fail);
        })();
      }
      case "job-clear": {
        var dn = DB.get("jobs").filter(function (j) { return j.status === "done" || j.status === "cancelled"; });
        var i2 = 0;
        return (function step() {
          if (i2 >= dn.length) { render(); return toast("Очищено: " + dn.length); }
          DB.remove("jobs", dn[i2++].id).then(step, fail);
        })();
      }

      case "ev-clear": return confirmDel("Журнал будет очищен.", function () {
        DB.wipe("events").then(function () { done("Журнал очищен"); }, fail);
      });
      case "ev-export": {
        var rows = DB.get("events").map(function (e) {
          return [e.created_at, e.level, e.type, JSON.stringify(e.payload || {})];
        });
        R.download("events-" + R.dOnly(new Date()) + ".csv",
          R.csvBuild(["created_at", "level", "type", "payload"], rows));
        return toast("Выгружено событий: " + rows.length, "ok");
      }

      case "acc-new": return accountForm();
      case "acc-del": return confirmDel("Аккаунт будет удалён. Объявления и заказы, привязанные к нему, останутся.", function () {
        DB.remove("accounts", id).then(function () { done("Удалено"); }, fail);
      });

      case "settings-save": return settingsSave();
      case "sb-ping": return sbPing();
      case "dump-export": return dumpExport();
      case "dump-import": return dumpImport();
      case "demo": return demoFill();
      case "wipe": return wipeAll();
    }
  };
})();
