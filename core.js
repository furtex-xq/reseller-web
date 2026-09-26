/* Reseller Web — ядро: хранилище, модель, утилиты.
 *
 * Данные живут в одном из двух мест, выбор в «Настройках»:
 *   local    — IndexedDB в этом браузере, ничего наружу не уходит;
 *   supabase — тот же проект, что у телефона, тогда панель и приложение
 *              смотрят в одну базу и видят изменения друг друга.
 *
 * Ключи склада шифруются AES-256-GCM паролем хранилища. Пароль живёт только
 * в памяти вкладки: закрыли — надо ввести заново. Так задумано, иначе смысл
 * шифрования теряется.
 */
(function (W) {
  "use strict";

  /* ---------------- справочники ---------------- */
  var TABLES = [
    "accounts", "products", "stock_keys", "listings",
    "chats", "orders", "messages", "message_rules", "jobs", "events",
  ];

  var PLATFORMS = { funpay: "FunPay", playerok: "Playerok" };

  var ORDER_ST = {
    new: { t: "новый", c: "info" },
    paid: { t: "оплачен", c: "acc" },
    delivered: { t: "выдан", c: "ok" },
    closed: { t: "закрыт", c: "mute" },
    refunded: { t: "возврат", c: "warn" },
    dispute: { t: "спор", c: "err" },
  };
  var LISTING_ST = {
    draft: { t: "черновик", c: "mute" },
    publishing: { t: "публикуется", c: "info" },
    active: { t: "активно", c: "ok" },
    paused: { t: "на паузе", c: "warn" },
    sold_out: { t: "нет в наличии", c: "warn" },
    error: { t: "ошибка", c: "err" },
  };
  var KEY_ST = {
    available: { t: "свободен", c: "ok" },
    reserved: { t: "зарезервирован", c: "warn" },
    delivered: { t: "выдан", c: "mute" },
    burned: { t: "списан", c: "err" },
  };
  var JOB_ST = {
    pending: { t: "в очереди", c: "info" },
    running: { t: "выполняется", c: "acc" },
    done: { t: "готово", c: "ok" },
    failed: { t: "ошибка", c: "err" },
    cancelled: { t: "отменено", c: "mute" },
  };
  var TRIGGERS = {
    keyword: "по ключевым словам",
    order_paid: "после оплаты заказа",
    order_closed: "после закрытия заказа",
    first_contact: "первое сообщение",
    delay: "через паузу",
  };

  /* ---------------- мелочи ---------------- */
  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    var b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    var s = [].map.call(b, function (x) { return x.toString(16).padStart(2, "0"); }).join("");
    return s.slice(0, 8) + "-" + s.slice(8, 12) + "-" + s.slice(12, 16) + "-" + s.slice(16, 20) + "-" + s.slice(20);
  }
  function nowIso() { return new Date().toISOString(); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function money(v, cur) {
    var n = Number(v || 0);
    var s = n.toLocaleString("ru-RU", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
    return s + " " + (cur === "USD" ? "$" : cur === "EUR" ? "€" : "₽");
  }
  function num(v) { return Number(v || 0).toLocaleString("ru-RU"); }
  function dt(v, withSec) {
    if (!v) return "—";
    var d = new Date(v);
    if (isNaN(d)) return "—";
    var p = function (x) { return String(x).padStart(2, "0"); };
    return p(d.getDate()) + "." + p(d.getMonth() + 1) + "." + d.getFullYear() +
      " " + p(d.getHours()) + ":" + p(d.getMinutes()) + (withSec ? ":" + p(d.getSeconds()) : "");
  }
  function dOnly(v) {
    var d = new Date(v); if (isNaN(d)) return "";
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function ago(v) {
    if (!v) return "—";
    var s = Math.floor((Date.now() - new Date(v)) / 1000);
    if (s < 60) return "только что";
    if (s < 3600) return Math.floor(s / 60) + " мин назад";
    if (s < 86400) return Math.floor(s / 3600) + " ч назад";
    var d = Math.floor(s / 86400);
    return d + (d === 1 ? " день назад" : d < 5 ? " дня назад" : " дней назад");
  }

  /* ---------------- CSV ---------------- */
  function csvParse(text) {
    var rows = [], f = "", row = [], q = false;
    text = String(text).replace(/^﻿/, "");
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
        else f += c;
      } else {
        if (c === '"') q = true;
        else if (c === "," || c === ";" || c === "\t") { row.push(f); f = ""; }
        else if (c === "\r") { /* пропускаем */ }
        else if (c === "\n") { row.push(f); f = ""; rows.push(row); row = []; }
        else f += c;
      }
    }
    if (f.length || row.length) { row.push(f); rows.push(row); }
    return rows.filter(function (r) { return r.length > 1 || (r[0] || "").trim() !== ""; });
  }
  function csvCell(v) {
    var s = String(v == null ? "" : v);
    return /[",;\n\t]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function csvBuild(head, rows) {
    return head.join(";") + "\n" + rows.map(function (r) { return r.map(csvCell).join(";"); }).join("\n") + "\n";
  }
  function download(name, text, type) {
    var b = new Blob(["﻿" + text], { type: (type || "text/csv") + ";charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(b); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
  }

  /* ---------------- шифрование ключей склада ---------------- */
  var VAULT = { pass: null };
  var te = new TextEncoder(), td = new TextDecoder();
  function b64e(buf) { return btoa(String.fromCharCode.apply(null, new Uint8Array(buf))); }
  function b64d(s) { return Uint8Array.from(atob(s), function (c) { return c.charCodeAt(0); }); }

  function vaultKey(pass, salt) {
    return crypto.subtle.importKey("raw", te.encode(pass), "PBKDF2", false, ["deriveKey"]).then(function (b) {
      return crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: salt, iterations: 120000, hash: "SHA-256" },
        b, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    });
  }
  function encKey(plain) {
    if (!VAULT.pass) return Promise.resolve("plain:" + plain);
    var salt = crypto.getRandomValues(new Uint8Array(16));
    var iv = crypto.getRandomValues(new Uint8Array(12));
    return vaultKey(VAULT.pass, salt).then(function (k) {
      return crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, k, te.encode(plain));
    }).then(function (ct) {
      return "v1:" + b64e(salt) + ":" + b64e(iv) + ":" + b64e(ct);
    });
  }
  function decKey(enc) {
    if (!enc) return Promise.resolve("");
    if (enc.indexOf("plain:") === 0) return Promise.resolve(enc.slice(6));
    var p = enc.split(":");
    if (p[0] !== "v1" || p.length !== 4) return Promise.resolve("�");
    if (!VAULT.pass) return Promise.reject(new Error("locked"));
    return vaultKey(VAULT.pass, b64d(p[1])).then(function (k) {
      return crypto.subtle.decrypt({ name: "AES-GCM", iv: b64d(p[2]) }, k, b64d(p[3]));
    }).then(function (buf) { return td.decode(buf); });
  }

  /* ---------------- драйвер: IndexedDB ---------------- */
  function idbOpen() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open("reseller-web", 1);
      r.onupgradeneeded = function () {
        var db = r.result;
        TABLES.forEach(function (t) {
          if (!db.objectStoreNames.contains(t)) db.createObjectStore(t, { keyPath: "id" });
        });
      };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  var LocalDriver = {
    name: "local",
    all: function (table) {
      return idbOpen().then(function (db) {
        return new Promise(function (res, rej) {
          var tx = db.transaction(table, "readonly").objectStore(table).getAll();
          tx.onsuccess = function () { res(tx.result || []); };
          tx.onerror = function () { rej(tx.error); };
        });
      });
    },
    put: function (table, rec) {
      return idbOpen().then(function (db) {
        return new Promise(function (res, rej) {
          var tx = db.transaction(table, "readwrite").objectStore(table).put(rec);
          tx.onsuccess = function () { res(rec); };
          tx.onerror = function () { rej(tx.error); };
        });
      });
    },
    del: function (table, id) {
      return idbOpen().then(function (db) {
        return new Promise(function (res, rej) {
          var tx = db.transaction(table, "readwrite").objectStore(table).delete(id);
          tx.onsuccess = function () { res(); };
          tx.onerror = function () { rej(tx.error); };
        });
      });
    },
    clear: function (table) {
      return idbOpen().then(function (db) {
        return new Promise(function (res, rej) {
          var tx = db.transaction(table, "readwrite").objectStore(table).clear();
          tx.onsuccess = function () { res(); };
          tx.onerror = function () { rej(tx.error); };
        });
      });
    },
  };

  /* ---------------- драйвер: Supabase ---------------- */
  /* ---------------- вход в Supabase ----------------
     Раньше панель ходила в базу секретным ключом прямо из браузера. Supabase
     это запретил, и правильно: «Secret API keys ... should never be used in a
     browser». Теперь панель ходит публичным ключом и входит обычным
     пользователем — доступ решает вход, а не ключ.

     Храним не пароль, а выданные токены: пароль после входа не нужен. Токен
     живёт около часа, поэтому рядом лежит refresh_token, по которому тихо
     берётся новый. */
  var SESS_KEY = "reseller-web:session";
  var AUTH = {
    token: "",        // access_token, коротко живущий
    refresh: "",      // по нему берём следующий
    at: 0,            // когда истекает, мс
    email: "",

    load: function () {
      try {
        var s = JSON.parse(localStorage.getItem(SESS_KEY) || "{}");
        this.token = s.token || ""; this.refresh = s.refresh || "";
        this.at = s.at || 0; this.email = s.email || "";
      } catch (e) { /* пусто так пусто */ }
      return this;
    },
    save: function () {
      try {
        localStorage.setItem(SESS_KEY, JSON.stringify({
          token: this.token, refresh: this.refresh, at: this.at, email: this.email,
        }));
      } catch (e) { /* приватный режим — переживём */ }
    },
    clear: function () {
      this.token = ""; this.refresh = ""; this.at = 0; this.email = "";
      try { localStorage.removeItem(SESS_KEY); } catch (e) {}
    },
    ok: function () { return !!this.token; },
    // Минута запаса: иначе токен успеет протухнуть между проверкой и запросом.
    fresh: function () { return !!this.token && Date.now() < this.at - 60000; },

    take: function (url, key, body) {
      var self = this;
      return fetch(String(url).replace(/\/+$/, "") + "/auth/v1/token?grant_type=" + body.grant,
        {
          method: "POST",
          headers: { apikey: key, "Content-Type": "application/json" },
          body: JSON.stringify(body.payload),
        }).then(function (r) {
        return r.json().then(function (j) {
          if (!r.ok) {
            var m = j.error_description || j.msg || j.message || ("HTTP " + r.status);
            throw new Error(/Invalid login/i.test(m) ? "не та почта или пароль" : m);
          }
          self.token = j.access_token || "";
          self.refresh = j.refresh_token || "";
          self.at = Date.now() + (Number(j.expires_in) || 3600) * 1000;
          if (j.user && j.user.email) self.email = j.user.email;
          self.save();
          return self;
        });
      });
    },

    signIn: function (url, key, email, password) {
      this.email = email;
      return this.take(url, key, { grant: "password", payload: { email: email, password: password } });
    },

    renew: function (url, key) {
      if (!this.refresh) return Promise.reject(new Error("входа нет"));
      return this.take(url, key, { grant: "refresh_token", payload: { refresh_token: this.refresh } });
    },

    /** Действующий токен: обновляем заранее, чтобы запрос не упал на 401. */
    bearer: function (url, key) {
      if (this.fresh()) return Promise.resolve(this.token);
      if (this.refresh) {
        var self = this;
        return this.renew(url, key).then(function () { return self.token; },
          function () { self.clear(); return ""; });
      }
      return Promise.resolve("");
    },
  };

  function SupabaseDriver(url, key) {
    var root = String(url).replace(/\/+$/, "");
    var base = root + "/rest/v1/";

    /* apikey — публичный ключ, Authorization — токен вошедшего. Входа нет —
       во втором заголовке едет тот же публичный ключ: запрос дойдёт, но RLS
       ничего не покажет, и это честнее молчаливого пустого списка. */
    function h(extra) {
      return AUTH.bearer(root, key).then(function (tok) {
        var o = {
          apikey: key,
          Authorization: "Bearer " + (tok || key),
          "Content-Type": "application/json",
        };
        for (var k in extra) o[k] = extra[k];
        return o;
      });
    }
    function fail(r) {
      return r.text().then(function (t) {
        var body = (t || "").slice(0, 300);
        // Три ошибки, которые встречаются чаще всех остальных вместе взятых.
        if (/secret API key in browser/i.test(body)) {
          throw new Error("Supabase запрещает секретный ключ в браузере. " +
            "Нужен публичный ключ и вход по почте с паролем.");
        }
        if (r.status === 401) {
          throw new Error(AUTH.ok()
            ? "вход просрочен — войдите заново в настройках"
            : "нужно войти: почта и пароль в настройках");
        }
        if (r.status === 404) throw new Error("таблиц нет — выполните SQL из мастера подключения");
        throw new Error("Supabase " + r.status + ": " + body);
      });
    }
    // Заголовки собираются асинхронно (может понадобиться обновить токен),
    // поэтому каждый запрос начинается с них, а не с fetch.
    function req(path, init) {
      return h((init && init.headers) || null).then(function (headers) {
        var o = { headers: headers };
        for (var k in init) if (k !== "headers") o[k] = init[k];
        return fetch(base + path, o);
      });
    }

    return {
      name: "supabase",
      all: function (table) {
        return req(table + "?select=*", null).then(function (r) {
          return r.ok ? r.json() : fail(r);
        });
      },
      put: function (table, rec) {
        return req(table, {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=representation" },
          body: JSON.stringify(rec),
        }).then(function (r) { return r.ok ? rec : fail(r); });
      },
      del: function (table, id) {
        return req(table + "?id=eq." + encodeURIComponent(id), { method: "DELETE" })
          .then(function (r) { return r.ok ? true : fail(r); });
      },
      clear: function (table) {
        return req(table + "?id=not.is.null", { method: "DELETE" })
          .then(function (r) { return r.ok ? true : fail(r); });
      },
      ping: function () {
        return req("products?select=id&limit=1", null).then(function (r) {
          return r.ok ? true : fail(r);
        });
      },
    };
  }

  /* ---------------- живое обновление ----------------
     Воркер на Supabase подливает заказы раз в минуту, телефон — когда
     синхронизируется. Панель об этом узнаёт опросом, а не вебсокетом: опрос
     раз в 20 секунд уже мельче, чем частота самого источника, и работает с
     тем же ключом и теми же запросами, что и остальная панель. Вебсокет
     добавил бы отдельный протокол ради выигрыша, которого не видно.

     Трафик: опрашиваются только таблицы, которые видно в интерфейсе, и
     перерисовка идёт лишь когда подпись данных изменилась. */
  var LIVE = {
    ms: 20000,
    timer: null,
    sig: null,
    on: null,
    onTick: null,
    busy: false,
    state: "off",        // off | poll | error
    lastAt: null,
    lastErr: null,

    /** Дешёвая подпись кэша: меняется от любой правки в любой видимой таблице. */
    signature: function () {
      var h = 5381, n = 0;
      for (var i = 0; i < TABLES.length; i++) {
        var rows = DB.cache[TABLES[i]];
        if (!rows) continue;
        var s = TABLES[i] + ":" + rows.length + ":" + JSON.stringify(rows);
        n += rows.length;
        for (var j = 0; j < s.length; j++) h = ((h * 33) ^ s.charCodeAt(j)) >>> 0;
      }
      return n + "/" + h.toString(36);
    },

    start: function (onChange) {
      this.stop();
      this.on = onChange || this.on;
      // Локальная база меняется только из этой вкладки — опрашивать нечего.
      if (DB.driver.name !== "supabase") { this.state = "off"; return; }
      if (DB.settings.live === false) { this.state = "off"; return; }
      this.sig = this.signature();
      this.state = "poll";
      var self = this;
      this.timer = setInterval(function () { self.tick(); }, this.ms);
    },

    stop: function () {
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      if (this.state === "poll") this.state = "off";
    },

    tick: function () {
      var self = this;
      // Вкладка спрятана — не жжём лимиты впустую.
      if (typeof document !== "undefined" && document.hidden) return;
      if (this.busy) return;
      this.busy = true;
      DB.loadAll().then(function () {
        self.busy = false;
        self.lastAt = new Date();
        self.lastErr = null;
        self.state = "poll";
        if (self.onTick) self.onTick();
        var now = self.signature();
        if (now !== self.sig) {
          self.sig = now;
          if (self.on) self.on();
        }
      }, function (e) {
        self.busy = false;
        self.state = "error";
        self.lastErr = e && e.message ? e.message : "сбой сети";
        if (self.onTick) self.onTick();
      });
    },
  };

  /* ---------------- настройки ---------------- */
  var SETTINGS_KEY = "reseller-web:settings";
  function loadSettings() {
    try {
      var s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      return {
        driver: s.driver === "supabase" ? "supabase" : "local",
        sbUrl: s.sbUrl || "",
        sbKey: s.sbKey || "",
        theme: s.theme || "dark",
        currency: s.currency || "RUB",
        seller: s.seller || "",
        // живое обновление: выключается только явно, по умолчанию включено
        live: s.live !== false,
      };
    } catch (e) {
      return { driver: "local", sbUrl: "", sbKey: "", theme: "dark", currency: "RUB", seller: "", live: true };
    }
  }
  function saveSettings(s) {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) {}
  }

  /* ---------------- хранилище ---------------- */
  var DB = {
    driver: LocalDriver,
    cache: {},
    settings: loadSettings(),

    useSettings: function (s) {
      this.settings = s;
      saveSettings(s);
      AUTH.load();
      this.driver = s.driver === "supabase" && s.sbUrl && s.sbKey
        ? SupabaseDriver(s.sbUrl, s.sbKey)
        : LocalDriver;
      this.cache = {};
    },
    loadAll: function () {
      var self = this;
      return Promise.all(TABLES.map(function (t) {
        return self.driver.all(t).then(function (rows) { self.cache[t] = rows || []; },
          function (e) { self.cache[t] = []; throw e; });
      })).then(function () { return self.cache; });
    },
    get: function (table) { return this.cache[table] || []; },
    byId: function (table, id) {
      var a = this.get(table);
      for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i];
      return null;
    },
    save: function (table, rec) {
      var self = this;
      if (!rec.id) rec.id = uuid();
      if (!rec.created_at) rec.created_at = nowIso();
      return this.driver.put(table, rec).then(function () {
        var a = self.cache[table] || (self.cache[table] = []);
        var i = a.findIndex(function (x) { return x.id === rec.id; });
        if (i >= 0) a[i] = rec; else a.push(rec);
        return rec;
      });
    },
    remove: function (table, id) {
      var self = this;
      return this.driver.del(table, id).then(function () {
        self.cache[table] = (self.cache[table] || []).filter(function (x) { return x.id !== id; });
      });
    },
    wipe: function (table) {
      var self = this;
      return this.driver.clear(table).then(function () { self.cache[table] = []; });
    },
    log: function (type, level, payload) {
      return this.save("events", {
        id: uuid(), type: type, level: level || "info",
        payload: payload || {}, created_at: nowIso(),
      });
    },
  };

  /* ---------------- шаблоны сообщений ---------------- */
  var PLACEHOLDERS = ["buyer", "product", "sku", "price", "amount", "currency", "order", "key", "seller"];
  function renderTemplate(tpl, data) {
    return String(tpl || "").replace(/\{\{\s*([a-z_]+)\s*(?:\|\s*(upper|lower)\s*)?\}\}/gi, function (m, name, filt) {
      var v = data[name];
      // Незаполненный плейсхолдер остаётся как есть: так ошибку видно сразу,
      // а не как дыру в сообщении покупателю.
      if (v == null || v === "") return m;
      v = String(v);
      if (filt === "upper") v = v.toUpperCase();
      if (filt === "lower") v = v.toLowerCase();
      return v;
    });
  }

  W.RS = {
    TABLES: TABLES, PLATFORMS: PLATFORMS,
    ORDER_ST: ORDER_ST, LISTING_ST: LISTING_ST, KEY_ST: KEY_ST, JOB_ST: JOB_ST, TRIGGERS: TRIGGERS,
    PLACEHOLDERS: PLACEHOLDERS,
    uuid: uuid, nowIso: nowIso, esc: esc, money: money, num: num, dt: dt, dOnly: dOnly, ago: ago,
    csvParse: csvParse, csvBuild: csvBuild, download: download,
    VAULT: VAULT, encKey: encKey, decKey: decKey,
    DB: DB, LIVE: LIVE, AUTH: AUTH, loadSettings: loadSettings, saveSettings: saveSettings,
    SupabaseDriver: SupabaseDriver,
    renderTemplate: renderTemplate,
  };
})(window);
