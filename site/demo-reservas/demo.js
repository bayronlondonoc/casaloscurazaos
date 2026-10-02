/* Casa Los Curazaos — Demo del motor de reservas (oculta al público).

   Reconstrucción del motor de reserva directa que funcionó con PHP + Bold
   hasta agosto 2026 (commit 5bb44ff). Esta versión no tiene servidor ni
   cobra nada: reservas, bloqueos y códigos viven en el localStorage de quien
   abre la demo, y la ocupación de Airbnb se simula de forma estable mes a mes.

   Flujo: index (reservar) → pago (pasarela simulada) → gracias → mi-reserva.
   Panel del hotel: admin.

   Cada página declara <body data-demo="reservar|pago|gracias|mi-reserva|admin">. */
(function () {
  "use strict";

  const brand = window.__BRAND__ || {};
  const BASE = "/demo-reservas";

  /* ---------- Helpers ---------------------------------------- */
  const $  = (sel, scope) => (scope || document).querySelector(sel);
  const $$ = (sel, scope) => Array.from((scope || document).querySelectorAll(sel));
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const pad = n => String(n).padStart(2, "0");
  const ymd = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const parseYMD = s => { const p = String(s).split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); };
  const todayDate = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const nightsBetween = (a, b) => Math.round((parseYMD(b) - parseYMD(a)) / 86400000);

  function fmtCOP(n) {
    if (n == null) return "—";
    return "$" + Math.round(n).toLocaleString("es-CO");
  }
  function fmtCOPshort(n) {
    if (n == null) return "—";
    if (n >= 1000000) return "$" + (n / 1000000).toFixed(2).replace(/\.?0+$/, "") + "M";
    if (n >= 1000) return "$" + Math.round(n / 1000) + "k";
    return "$" + n;
  }
  const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const MONTH_NAMES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const DIA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const WEEKDAYS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];

  function fmtLong(s) {
    const d = parseYMD(s);
    return DIA[d.getDay()] + " " + d.getDate() + " de " + MES[d.getMonth()] + " " + d.getFullYear();
  }
  function fmtShort(s) {
    const d = parseYMD(s);
    return d.getDate() + " " + MES[d.getMonth()] + " " + d.getFullYear();
  }
  function guestsLabel(r) {
    let g = r.adults + " adulto" + (r.adults === 1 ? "" : "s");
    if (r.children > 0) g += " · " + r.children + " niño" + (r.children === 1 ? "" : "s");
    if (r.pets) g += " · mascota";
    return g;
  }

  /* ---------- Producto: cabañas, capacidades y tarifas ------- */
  /* Tarifas del motor original (manifest.js antes de migrar a Airbnb).
     Viven solo en la demo: el sitio público no publica tarifas. */
  const TARIFAS = {
    luxe:            { semana: 340000, finde: 430000,  temporada: 500000 },
    comfort:         { semana: 340000, finde: 430000,  temporada: 500000 },
    prestige:        { semana: 340000, finde: 430000,  temporada: 500000 },
    "casa-completa": { semana: 990000, finde: 1250000, temporada: 1500000 }
  };
  const LIMITS = {
    luxe:            { adultsMax: 3,  childrenMax: 2, totalMax: 4,  pub: "3 huéspedes", real: "hasta 3 adultos o 2 ad + 2 niños" },
    comfort:         { adultsMax: 5,  childrenMax: 2, totalMax: 6,  pub: "5 huéspedes", real: "hasta 5 adultos o 4 ad + 2 niños" },
    prestige:        { adultsMax: 3,  childrenMax: 2, totalMax: 4,  pub: "3 huéspedes", real: "hasta 3 adultos o 2 ad + 2 niños" },
    "casa-completa": { adultsMax: 11, childrenMax: 6, totalMax: 14, pub: "8 huéspedes", real: "hasta 11 adultos o 8 ad + 6 niños" }
  };
  const CABINS = [
    { id: "luxe",          nombre: "Luxe",         full: "Cabaña Luxe" },
    { id: "comfort",       nombre: "Comfort",      full: "Cabaña Comfort" },
    { id: "prestige",      nombre: "Prestige",     full: "Cabaña Prestige" },
    { id: "casa-completa", nombre: "Deluxe House", full: "Deluxe House — las 3 cabañas" }
  ];
  const SINGLE = ["luxe", "comfort", "prestige"];
  const cabinById = id => CABINS.find(c => c.id === id);

  const HOLD_MS = 2 * 3600 * 1000;   // fechas apartadas mientras se paga
  const GATEWAY_FEE = 0.05;          // comisión de la pasarela, como en Bold

  /* Códigos de descuento por defecto (api/data/discount_codes.json). */
  const DEFAULT_CODES = {
    BAYRON10:    { type: "pct", pct: 15, active: true, requiresRef: false, notes: "Bayron · permanente" },
    CORPORATIVO: { type: "pct", pct: 25, active: true, until: "2026-12-31", requiresRef: true, refLabel: "Nombre de tu empresa", notes: "Corporativo · 25% · renueva dic" },
    SOCIOS:      { type: "pct", pct: 30, active: true, requiresRef: true, refLabel: "Empresa o asociación", notes: "Socios · 30% · permanente" },
    SEGUNDA50:   { type: "second_night", active: false, requiresRef: false, notes: "50% 2ª noche · activar según demanda" },
    SEMANA2X1:   { type: "weekday_2x1", active: false, requiresRef: false, notes: "2x1 semana · activar según demanda" }
  };

  /* ---------- Festivos colombianos y tarifa por noche -------- */
  function easterSunday(year) {
    const a = year % 19, b = Math.floor(year / 100), c = year % 100;
    const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
  }
  /** Ley Emiliani: mueve al siguiente lunes si no es lunes. */
  function emiliani(dt) {
    const d = new Date(dt);
    const dow = d.getDay();
    if (dow !== 1) d.setDate(d.getDate() + (dow === 0 ? 1 : 8 - dow));
    return d;
  }
  const _holidayCache = {};
  function colombiaHolidays(year) {
    if (_holidayCache[year]) return _holidayCache[year];
    const s = new Set();
    const addD = dt => s.add(ymd(dt));
    const add = (m, d) => addD(new Date(year, m - 1, d));
    add(1, 1); add(5, 1); add(7, 20); add(8, 7); add(12, 8); add(12, 25);
    const easter = easterSunday(year);
    const off = n => { const d = new Date(easter); d.setDate(d.getDate() + n); return d; };
    addD(off(-3));              // Jueves Santo
    addD(off(-2));              // Viernes Santo
    addD(emiliani(off(39)));    // Ascensión
    addD(emiliani(off(60)));    // Corpus Christi
    addD(emiliani(off(71)));    // Sagrado Corazón
    [[1, 6], [3, 19], [6, 29], [8, 15], [10, 12], [11, 1], [11, 11]].forEach(([m, d]) =>
      addD(emiliani(new Date(year, m - 1, d))));
    _holidayCache[year] = s;
    return s;
  }
  const isHoliday = d => colombiaHolidays(d.getFullYear()).has(ymd(d));

  /* Una noche cobra tarifa de fin de semana si amanece en sábado, domingo
     o festivo, o si la noche misma es festivo (lunes festivo). */
  function isWeekendNight(date) {
    const next = new Date(date);
    next.setDate(next.getDate() + 1);
    const dow = next.getDay();
    return dow === 6 || dow === 0 || isHoliday(date) || isHoliday(next);
  }
  /* Temporada alta: 20 dic – 6 ene, tarifa plana. */
  function isHighSeason(date) {
    const m = date.getMonth() + 1, d = date.getDate();
    return (m === 12 && d >= 20) || (m === 1 && d <= 6);
  }
  function splitNights(start, end) {
    const n = { semana: 0, finde: 0, temporada: 0 };
    const cur = new Date(start);
    while (cur < end) {
      if (isHighSeason(cur)) n.temporada++;
      else if (isWeekendNight(cur)) n.finde++;
      else n.semana++;
      cur.setDate(cur.getDate() + 1);
    }
    n.total = n.semana + n.finde + n.temporada;
    return n;
  }

  /* ---------- Almacenamiento (localStorage) ------------------ */
  const KEYS = { res: "clc_demo_reservas", blk: "clc_demo_bloqueos", codes: "clc_demo_codes" };
  function load(key, fallback) {
    try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; }
    catch (_) { return fallback; }
  }
  function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (_) {}
  }
  const getReservas = () => load(KEYS.res, {});
  const saveReservas = r => save(KEYS.res, r);
  const getBloqueos = () => load(KEYS.blk, []);
  const saveBloqueos = b => save(KEYS.blk, b);
  const getCodes = () => load(KEYS.codes, null) || JSON.parse(JSON.stringify(DEFAULT_CODES));
  const saveCodes = c => save(KEYS.codes, c);

  function getReserva(orderId) {
    if (!orderId) return null;
    return getReservas()[String(orderId).toUpperCase()] || null;
  }
  function putReserva(r) {
    const all = getReservas();
    all[r.orderId] = r;
    saveReservas(all);
  }
  function newOrderId() {
    const all = getReservas();
    let id;
    do {
      const bytes = new Uint8Array(3);
      (window.crypto || {}).getRandomValues ? crypto.getRandomValues(bytes) : bytes.forEach((_, i) => bytes[i] = Math.random() * 256);
      id = "CLC-" + Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("").toUpperCase();
    } while (all[id]);
    return id;
  }
  /* Una reserva bloquea fechas si está confirmada, o pendiente de pago
     dentro de la ventana de 2 horas. */
  function isActive(r) {
    if (r.status === "confirmed") return true;
    if (r.status === "pending") return Date.now() - new Date(r.createdAt).getTime() < HOLD_MS;
    return false;
  }

  /* ---------- Ocupación de Airbnb simulada ------------------- */
  /* Estancias pseudoaleatorias pero estables: la misma semilla por anuncio
     y mes produce siempre las mismas fechas ocupadas. */
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    return function () {
      seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const _simCache = {};
  function simStays(listing) {
    if (_simCache[listing]) return _simCache[listing];
    const out = [];
    const now = new Date();
    for (let i = -1; i <= 14; i++) {
      const first = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const r = rng(hashStr(listing + ":" + first.getFullYear() + "-" + first.getMonth()));
      const count = listing === "casa-completa" ? (r() < 0.55 ? 1 : 0) : 2 + (r() < 0.4 ? 1 : 0);
      for (let k = 0; k < count; k++) {
        const start = new Date(first.getFullYear(), first.getMonth(), 1 + Math.floor(r() * 26));
        if (r() < 0.65) start.setDate(start.getDate() + ((5 - start.getDay() + 7) % 7)); // a viernes
        const nights = 1 + Math.floor(r() * 3);
        const end = new Date(start);
        end.setDate(end.getDate() + nights);
        out.push({ start: ymd(start), end: ymd(end) });
      }
    }
    _simCache[listing] = out;
    return out;
  }

  /* Qué anuncios afectan la disponibilidad de otro: Deluxe House ocupa las
     tres cabañas, y cualquier cabaña ocupada bloquea Deluxe House. */
  const relatedListings = l => l === "casa-completa" ? ["casa-completa"].concat(SINGLE) : [l, "casa-completa"];

  /** Mapa ymd → {type, label} con cada noche ocupada del anuncio.
      type: airbnb | web | pending | bloqueo. Prioridad web > bloqueo > airbnb. */
  function occupancy(listing, opts) {
    opts = opts || {};
    const map = new Map();
    const rank = { airbnb: 1, bloqueo: 2, pending: 3, web: 4 };
    const mark = (start, end, info) => {
      const cur = parseYMD(start), stop = parseYMD(end);
      while (cur < stop) {
        const k = ymd(cur);
        const prev = map.get(k);
        if (!prev || rank[info.type] > rank[prev.type]) map.set(k, info);
        cur.setDate(cur.getDate() + 1);
      }
    };
    const reservas = Object.values(getReservas());
    const bloqueos = getBloqueos();
    relatedListings(listing).forEach(l => {
      const via = l === listing ? "" : " (vía " + cabinById(l).nombre + ")";
      simStays(l).forEach(s => mark(s.start, s.end, { type: "airbnb", label: "Reserva Airbnb" + via }));
      bloqueos.filter(b => b.cabin === l).forEach(b =>
        mark(b.start, b.end, { type: "bloqueo", label: "Bloqueo: " + (b.note || "sin nota") + via }));
      reservas.filter(r => r.cabin === l && isActive(r) && r.orderId !== opts.exclude).forEach(r =>
        mark(r.start, r.end, {
          type: r.status === "confirmed" ? "web" : "pending",
          label: (r.status === "confirmed" ? "Reserva web " : "Pendiente de pago ") + r.orderId + " · " + r.name + via,
          orderId: r.orderId
        }));
    });
    return map;
  }
  const busyNights = (listing, opts) => new Set(occupancy(listing, opts).keys());

  function hasConflict(listing, start, end, exclude) {
    const busy = busyNights(listing, { exclude });
    const cur = parseYMD(start), stop = parseYMD(end);
    while (cur < stop) {
      if (busy.has(ymd(cur))) return true;
      cur.setDate(cur.getDate() + 1);
    }
    return false;
  }

  /* ---------- Descuentos y cotización ------------------------ */
  function checkCode(raw) {
    const code = String(raw || "").toUpperCase().trim();
    if (!code) return { valid: false, message: "" };
    const entry = getCodes()[code];
    if (!entry) return { valid: false, message: "✗ Código no válido" };
    const t = ymd(todayDate());
    if (entry.active === false) return { valid: false, message: "✗ Este código no está activo en este momento" };
    if (entry.from && t < entry.from) return { valid: false, message: "✗ Este código aún no está vigente" };
    if (entry.until && t > entry.until) return { valid: false, message: "✗ Este código ya venció" };
    let message = "✓ Código aplicado";
    if (entry.type === "pct") message = "✓ " + entry.pct + "% de descuento aplicado";
    if (entry.type === "second_night") message = "✓ 50% en la segunda noche";
    if (entry.type === "weekday_2x1") message = "✓ 2x1 en noches entre semana";
    return { valid: true, code, entry, message };
  }

  /** Igual que clc_compute_amount() del backend PHP original: el mayor
      descuento entre estadía larga, código porcentual o código especial,
      más 5% de comisión de la pasarela. */
  function quote(cabin, start, end, codeCheck) {
    const t = TARIFAS[cabin];
    if (!t || !start || !end) return null;
    const n = splitNights(start, end);
    const subtotal = n.semana * t.semana + n.finde * t.finde + n.temporada * t.temporada;

    const autoPct = n.total >= 7 ? 15 : n.total >= 4 ? 10 : 0;
    let codePct = 0, specialAmt = 0;
    const entry = codeCheck && codeCheck.valid ? codeCheck.entry : null;
    if (entry) {
      if (entry.type === "pct") codePct = +entry.pct || 0;
      else if (entry.type === "second_night" && n.total >= 2) specialAmt = Math.round(subtotal / n.total * 0.5);
      else if (entry.type === "weekday_2x1" && n.semana >= 2) specialAmt = t.semana;
    }
    const pct = Math.max(autoPct, codePct);
    const pctAmt = pct > 0 ? subtotal * pct / 100 : 0;
    const discount = Math.max(pctAmt, specialAmt);
    let discountLabel = "";
    if (discount > 0) {
      if (specialAmt > pctAmt) discountLabel = "Código " + codeCheck.code;
      else if (codePct >= autoPct) discountLabel = "Código " + codeCheck.code + " (" + codePct + "%)";
      else discountLabel = "Estadía larga (" + autoPct + "%)";
    }
    const afterDiscount = subtotal - discount;
    const fee = afterDiscount * GATEWAY_FEE;
    return {
      nights: n.total, semana: n.semana, finde: n.finde, temporada: n.temporada,
      subtotal, discount, discountLabel, fee,
      total: Math.max(1000, Math.round(afterDiscount + fee))
    };
  }

  function nightsBreakdown(q) {
    const parts = [];
    if (q.semana) parts.push(q.semana + " L–J");
    if (q.finde) parts.push(q.finde + " V–D / festivo");
    if (q.temporada) parts.push(q.temporada + " temporada alta");
    return q.nights + " (" + parts.join(", ") + ")";
  }

  /* =========================================================== */
  /* 1. Reservar                                                  */
  /* =========================================================== */
  function initReservar() {
    const root = $("[data-booking]");
    if (!root) return;

    const state = {
      cabin: null, start: null, end: null,
      adults: 2, children: 0, pets: false,
      name: "", cedula: "", email: "", phone: "", message: "",
      code: null, monthOffset: 0
    };

    /* Avisos de vuelta desde la pasarela */
    const params = new URLSearchParams(location.search);
    const notice = $("[data-booking-notice]");
    if (notice && params.get("cancelado")) {
      notice.innerHTML = "Cancelaste el pago. Las fechas se liberaron y puedes elegir de nuevo.";
      notice.hidden = false;
    }

    /* --- Selector de cabaña --- */
    const cabinShell = $("[data-booking-cabins]", root);
    cabinShell.innerHTML = CABINS.map(c => {
      const t = TARIFAS[c.id], lim = LIMITS[c.id];
      return `
        <label class="booking-cabin-option" data-cabin-opt="${c.id}">
          <input type="radio" name="cabin" value="${c.id}" />
          <span class="booking-cabin-option-name">${esc(c.nombre)}</span>
          <span class="booking-cabin-option-pax">${esc(lim.pub)}</span>
          <span class="booking-cabin-option-price-split"><span><i>L–J</i> ${fmtCOPshort(t.semana)}</span><span><i>V–D</i> ${fmtCOPshort(t.finde)}</span></span>
          <span class="booking-cabin-option-realcap">${esc(lim.real)}</span>
        </label>`;
    }).join("");

    function selectCabin(id) {
      state.cabin = id;
      $$(".booking-cabin-option", cabinShell).forEach(el =>
        el.classList.toggle("is-selected", el.dataset.cabinOpt === id));
      const lim = LIMITS[id];
      state.adults = Math.min(state.adults, lim.adultsMax);
      state.children = Math.min(state.children, lim.childrenMax, lim.totalMax - state.adults);
      // Si el rango elegido ya no está libre en la nueva cabaña, se limpia.
      if (state.start && state.end && hasConflict(id, ymd(state.start), ymd(state.end))) {
        state.start = null; state.end = null;
      }
      refreshCounters();
      renderCalendars();
      renderExtraGuests();
      updateSummary();
    }
    cabinShell.addEventListener("change", e => {
      if (e.target.name === "cabin") selectCabin(e.target.value);
    });

    /* --- Calendario --- */
    const calShell = $("[data-booking-calendar]", root);
    function renderCalendars() {
      calShell.innerHTML = "";
      const t = todayDate();
      for (let i = 0; i < 2; i++) {
        calShell.appendChild(buildMonth(new Date(t.getFullYear(), t.getMonth() + state.monthOffset + i, 1), i === 0));
      }
    }
    function buildMonth(monthDate, withNav) {
      const today = todayDate();
      const wrap = document.createElement("div");
      wrap.className = "booking-calendar";
      wrap.innerHTML = `
        <div class="booking-calendar-head">
          <span class="booking-calendar-title">${MONTH_NAMES[monthDate.getMonth()]} ${monthDate.getFullYear()}</span>
          ${withNav ? `
          <div class="booking-calendar-nav">
            <button type="button" class="booking-cal-btn" data-cal-nav="-1" aria-label="Mes anterior" ${state.monthOffset <= 0 ? "disabled" : ""}>‹</button>
            <button type="button" class="booking-cal-btn" data-cal-nav="1" aria-label="Mes siguiente" ${state.monthOffset >= 11 ? "disabled" : ""}>›</button>
          </div>` : ""}
        </div>
        <div class="booking-calendar-grid">
          ${WEEKDAYS.map(d => `<span class="booking-cal-weekday">${d}</span>`).join("")}
        </div>`;
      const grid = $(".booking-calendar-grid", wrap);
      const firstDow = (monthDate.getDay() + 6) % 7;
      const days = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
      for (let i = 0; i < firstDow; i++) {
        const empty = document.createElement("span");
        empty.className = "booking-cal-day is-out";
        grid.appendChild(empty);
      }
      const busy = state.cabin ? busyNights(state.cabin) : new Set();
      for (let d = 1; d <= days; d++) {
        const date = new Date(monthDate.getFullYear(), monthDate.getMonth(), d);
        const k = ymd(date);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "booking-cal-day";
        btn.textContent = d;
        btn.dataset.date = k;
        if (isWeekendNight(date)) btn.classList.add("is-weekend");
        if (isHoliday(date)) { btn.classList.add("is-holiday"); btn.title = "Festivo"; }
        if (date < today) btn.classList.add("is-past", "is-disabled");
        if (date.getTime() === today.getTime()) btn.classList.add("is-today");
        if (busy.has(k)) { btn.classList.add("is-busy", "is-disabled"); btn.title = "Ocupado"; }
        if (state.start && state.end) {
          if (date.getTime() === state.start.getTime()) btn.classList.add("is-start");
          if (date.getTime() === state.end.getTime()) btn.classList.add("is-end");
          if (date > state.start && date < state.end) btn.classList.add("is-range");
        } else if (state.start && date.getTime() === state.start.getTime()) {
          btn.classList.add("is-start", "is-end");
        }
        btn.addEventListener("click", () => onPickDay(date));
        grid.appendChild(btn);
      }
      $$("[data-cal-nav]", wrap).forEach(b => b.addEventListener("click", () => {
        state.monthOffset = Math.max(0, Math.min(11, state.monthOffset + parseInt(b.dataset.calNav, 10)));
        renderCalendars();
      }));
      return wrap;
    }
    function flash(msg) {
      if (!submitNote) return;
      submitNote.textContent = msg;
      submitNote.style.color = "var(--accent)";
      const cal = $(".booking-calendar-hint", root);
      if (cal) { cal.textContent = msg; cal.hidden = false; setTimeout(() => { cal.hidden = true; }, 3500); }
    }
    function onPickDay(date) {
      if (!state.cabin) { flash("Primero selecciona una cabaña."); return; }
      if (date < todayDate()) return;
      const busy = busyNights(state.cabin);
      if (!state.start || state.end) {
        if (busy.has(ymd(date))) return;          // no se puede dormir esa noche
        state.start = date; state.end = null;
      } else if (date.getTime() === state.start.getTime()) {
        state.start = null; state.end = null;
      } else if (date < state.start) {
        if (busy.has(ymd(date))) return;
        state.start = date; state.end = null;
      } else {
        // La salida puede caer en una noche ocupada: esa noche no se duerme.
        const cur = new Date(state.start);
        while (cur < date) {
          if (busy.has(ymd(cur))) { flash("El rango incluye noches ocupadas. Elige otro intervalo."); return; }
          cur.setDate(cur.getDate() + 1);
        }
        state.end = date;
      }
      renderCalendars();
      updateSummary();
    }

    /* --- Huéspedes --- */
    const counters = $$("[data-counter]", root);
    function limitsFor(key) {
      const lim = LIMITS[state.cabin] || LIMITS.luxe;
      if (key === "adults") return { min: 1, max: Math.min(lim.adultsMax, lim.totalMax - state.children) };
      return { min: 0, max: Math.min(lim.childrenMax, lim.totalMax - state.adults) };
    }
    function refreshCounters() {
      counters.forEach(group => {
        const key = group.dataset.counter;
        const { min, max } = limitsFor(key);
        $(".val", group).textContent = state[key];
        $("[data-counter-dec]", group).disabled = state[key] <= min;
        $("[data-counter-inc]", group).disabled = state[key] >= max;
      });
    }
    counters.forEach(group => {
      const key = group.dataset.counter;
      $("[data-counter-dec]", group).addEventListener("click", () => {
        if (state[key] > limitsFor(key).min) { state[key]--; refreshCounters(); renderExtraGuests(); updateSummary(); }
      });
      $("[data-counter-inc]", group).addEventListener("click", () => {
        if (state[key] < limitsFor(key).max) { state[key]++; refreshCounters(); renderExtraGuests(); updateSummary(); }
      });
    });
    const pets = $("[data-pets]", root);
    pets && pets.addEventListener("change", () => { state.pets = pets.checked; updateSummary(); });

    function renderExtraGuests() {
      const wrap = $("#extra-guests-wrap"), list = $("#extra-guests-list");
      if (!wrap || !list) return;
      const extra = (state.adults - 1) + state.children;
      if (extra <= 0) { wrap.style.display = "none"; list.innerHTML = ""; return; }
      // Conserva lo que ya se escribió al cambiar el número de huéspedes.
      const kept = {};
      $$("input", list).forEach(i => { kept[i.id] = i.value; });
      wrap.style.display = "";
      list.innerHTML = "";
      let idx = 1;
      for (let i = 1; i < state.adults; i++, idx++) list.appendChild(guestRow(idx, "Adulto " + (i + 1), true));
      for (let i = 0; i < state.children; i++, idx++) list.appendChild(guestRow(idx, "Menor " + (i + 1), false));
      $$("input", list).forEach(i => { if (kept[i.id]) i.value = kept[i.id]; });
    }
    function guestRow(idx, label, requireDoc) {
      const d = document.createElement("div");
      d.className = "extra-guest-row";
      d.innerHTML = `
        <p class="extra-guest-label">${label}</p>
        <div class="booking-fields-row booking-fields-guest">
          <div class="booking-field"><label for="eg-name-${idx}">Nombre completo *</label><input type="text" id="eg-name-${idx}" placeholder="Nombre completo" /></div>
          <div class="booking-field"><label for="eg-doc-${idx}">N.º de documento${requireDoc ? " *" : " (opcional)"}</label><input type="text" id="eg-doc-${idx}" placeholder="Cédula o pasaporte" /></div>
          <div class="booking-field"><label for="eg-email-${idx}">Email (opcional)</label><input type="email" id="eg-email-${idx}" placeholder="correo@ejemplo.com" /></div>
        </div>`;
      return d;
    }

    /* --- Campos del titular y código --- */
    ["name", "cedula", "email", "phone", "message"].forEach(k => {
      const inp = $(`[data-field='${k}']`, root);
      inp && inp.addEventListener("input", () => { state[k] = inp.value; updateSummary(); });
    });
    const codeInput = $("[data-field='discount']", root);
    const codeMsg = $("#discount-message");
    const refWrap = $("#discount-ref-wrap"), refInput = $("#discount-ref"), refLabel = $("#discount-ref-label");
    let codeTimer = null;
    codeInput && codeInput.addEventListener("input", () => {
      state.code = null;
      refWrap.style.display = "none";
      const raw = codeInput.value.trim();
      codeMsg.textContent = raw ? "…" : "";
      codeMsg.style.color = "";
      clearTimeout(codeTimer);
      updateSummary();
      if (!raw) return;
      codeTimer = setTimeout(() => {
        const res = checkCode(raw);
        codeMsg.textContent = res.message;
        codeMsg.style.color = res.valid ? "var(--accent-2)" : "var(--accent)";
        if (res.valid) {
          state.code = res;
          if (res.entry.requiresRef) {
            refLabel.textContent = (res.entry.refLabel || "Empresa") + " *";
            refInput.placeholder = res.entry.refLabel || "Empresa";
            refWrap.style.display = "";
          }
        }
        updateSummary();
      }, 400);
    });
    const terms = $("[data-terms]", root);
    terms && terms.addEventListener("change", updateSummary);

    /* --- Resumen --- */
    const summary = $("[data-booking-summary]", root);
    const submitBtn = $("[data-booking-submit]", root);
    const submitNote = $("[data-booking-note]", root);

    function currentQuote() {
      return state.cabin && state.start && state.end ? quote(state.cabin, state.start, state.end, state.code) : null;
    }
    function updateSummary() {
      const q = currentQuote();
      const cabin = cabinById(state.cabin);
      const rows = [
        ["Cabaña", cabin ? cabin.full : "—"],
        ["Llegada", state.start ? fmtLong(ymd(state.start)) + " · 4:00 p. m." : "—"],
        ["Salida", state.end ? fmtLong(ymd(state.end)) + " · 11:00 a. m." : "—"],
        ["Noches", q ? nightsBreakdown(q) : "—"],
        ["Huéspedes", guestsLabel(state)]
      ];
      let extra = "";
      if (q) {
        extra += `<div class="booking-summary-row"><span class="booking-summary-label">Subtotal</span><span class="booking-summary-value">${fmtCOP(q.subtotal)}</span></div>`;
        if (q.discount > 0) extra += `<div class="booking-summary-row" style="color:var(--accent);font-weight:500;"><span class="booking-summary-label">Descuento · ${esc(q.discountLabel)}</span><span class="booking-summary-value">−${fmtCOP(q.discount)}</span></div>`;
        extra += `<div class="booking-summary-row" style="color:var(--ink-soft);font-size:.9rem;"><span class="booking-summary-label">Comisión pasarela (5%)</span><span class="booking-summary-value">+${fmtCOP(q.fee)}</span></div>`;
      }
      summary.innerHTML = rows.map(([l, v]) => `
        <div class="booking-summary-row">
          <span class="booking-summary-label">${esc(l)}</span>
          <span class="booking-summary-value">${esc(v)}</span>
        </div>`).join("") + extra + `
        <div class="booking-summary-total">
          <span class="booking-summary-label">Total</span>
          <span class="booking-summary-value">${q ? fmtCOP(q.total) + " COP" : "A calcular"}</span>
        </div>`;

      const termsOk = terms && terms.checked;
      const ready = !!(q && termsOk);
      submitBtn.classList.toggle("is-not-ready", !ready);
      submitNote.style.color = "";
      if (!state.cabin) submitNote.textContent = "Selecciona una cabaña para continuar.";
      else if (!state.start || !state.end) submitNote.textContent = "Selecciona fechas de llegada y salida.";
      else if (!termsOk) { submitNote.textContent = "Debes aceptar las políticas de reserva para continuar."; submitNote.style.color = "var(--accent)"; }
      else submitNote.textContent = "Te llevamos a la pasarela de pago. La reserva se confirma en cuanto el pago se aprueba.";
    }

    /* --- Enviar a la pasarela --- */
    submitBtn.addEventListener("click", e => {
      e.preventDefault();
      if (submitBtn.classList.contains("is-not-ready")) {
        submitNote.style.fontWeight = "700";
        setTimeout(() => { submitNote.style.fontWeight = ""; }, 2500);
        submitNote.scrollIntoView({ behavior: "smooth", block: "nearest" });
        return;
      }
      const required = [["name", "Nombre completo"], ["cedula", "Número de documento"], ["phone", "Teléfono"], ["email", "Email"]];
      const missing = required.filter(([k]) => !state[k].trim());
      const badEmail = state.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.email.trim());
      const needsRef = refWrap.style.display !== "none" && !refInput.value.trim();
      const guestInputs = $$("#extra-guests-list input[id^='eg-name-'], #extra-guests-list input[id^='eg-doc-']")
        .filter(i => !i.value.trim() && !(i.id.startsWith("eg-doc-") && i.closest(".extra-guest-row").textContent.includes("Menor")));
      if (missing.length || badEmail || needsRef || guestInputs.length) {
        const parts = missing.map(m => m[1]);
        if (badEmail) parts.push("un email válido");
        if (needsRef) parts.push(refLabel.textContent.replace(" *", ""));
        if (guestInputs.length) parts.push("datos de los acompañantes");
        submitNote.textContent = "Completa: " + parts.join(", ") + ".";
        submitNote.style.color = "var(--accent)";
        const targets = missing.map(([k]) => $(`[data-field='${k}']`, root));
        if (badEmail) targets.push($("[data-field='email']", root));
        if (needsRef) targets.push(refInput);
        targets.push(...guestInputs);
        targets.forEach(el => { el.style.outline = "2px solid var(--accent)"; setTimeout(() => { el.style.outline = ""; }, 3000); });
        targets[0] && targets[0].focus();
        return;
      }

      const start = ymd(state.start), end = ymd(state.end);
      submitBtn.disabled = true;
      submitBtn.classList.add("is-loading");
      submitBtn.textContent = "Verificando disponibilidad…";

      setTimeout(() => {
        // Re-verificación justo antes de apartar las fechas.
        if (hasConflict(state.cabin, start, end)) {
          state.start = null; state.end = null;
          renderCalendars(); updateSummary();
          submitBtn.disabled = false;
          submitBtn.classList.remove("is-loading");
          submitBtn.textContent = "Proceder al pago →";
          submitNote.textContent = "Esas fechas se acaban de ocupar. Elige otras, por favor.";
          submitNote.style.color = "var(--accent)";
          return;
        }
        const q = currentQuote();
        const guests = [];
        let gi = 1;
        for (let i = 1; i < state.adults; i++, gi++) guests.push(readGuest(gi, "adult"));
        for (let i = 0; i < state.children; i++, gi++) guests.push(readGuest(gi, "child"));
        const r = {
          orderId: newOrderId(),
          status: "pending",
          createdAt: new Date().toISOString(),
          cabin: state.cabin,
          cabinName: cabinById(state.cabin).full,
          start, end,
          nights: q.nights, semNights: q.semana, finNights: q.finde, seasonNights: q.temporada,
          adults: state.adults, children: state.children, pets: state.pets,
          name: state.name.trim(), cedula: state.cedula.trim(), email: state.email.trim(),
          phone: state.phone.trim(), message: state.message.trim(),
          discount: state.code ? state.code.code : "",
          discountRef: refWrap.style.display !== "none" ? refInput.value.trim() : "",
          subtotal: q.subtotal, discountAmount: Math.round(q.discount), discountLabel: q.discountLabel,
          fee: Math.round(q.fee), amount: q.total, currency: "COP",
          guests
        };
        putReserva(r);
        try { sessionStorage.setItem("clc_pending", r.orderId); } catch (_) {}
        location.href = BASE + "/pago?order=" + encodeURIComponent(r.orderId);
      }, 700);
    });
    function readGuest(i, type) {
      const v = id => (($("#" + id) || {}).value || "").trim();
      return { type, name: v("eg-name-" + i), cedula: v("eg-doc-" + i), email: v("eg-email-" + i) };
    }

    refreshCounters();
    renderCalendars();
    renderExtraGuests();
    updateSummary();

    const pre = params.get("cabin");
    if (pre && cabinById(pre)) {
      const radio = $(`input[name="cabin"][value="${pre}"]`, cabinShell);
      if (radio) { radio.checked = true; selectCabin(pre); }
    }
  }

  /* =========================================================== */
  /* 2. Pasarela de pago simulada                                 */
  /* =========================================================== */
  function initPago() {
    const shell = $("[data-pay]");
    if (!shell) return;
    const params = new URLSearchParams(location.search);
    let orderId = params.get("order");
    if (!orderId) { try { orderId = sessionStorage.getItem("clc_pending"); } catch (_) {} }
    const r = getReserva(orderId);

    if (!r) {
      shell.innerHTML = `<div class="pay-empty"><p class="pay-empty-title">No encontramos esta orden de pago.</p>
        <p>Es posible que haya vencido o que se haya abierto en otro navegador.</p>
        <a class="btn btn-accent mt-3" href="${BASE}">Volver a reservar</a></div>`;
      return;
    }
    if (r.status === "confirmed") { location.replace(BASE + "/gracias?reference=" + encodeURIComponent(r.orderId) + "&status=approved"); return; }
    if (!isActive(r)) {
      shell.innerHTML = `<div class="pay-empty"><p class="pay-empty-title">Esta orden venció.</p>
        <p>Las fechas se apartan por 2 horas mientras se completa el pago. Vuelve a reservar para generar una nueva orden.</p>
        <a class="btn btn-accent mt-3" href="${BASE}?cabin=${encodeURIComponent(r.cabin)}">Volver a reservar</a></div>`;
      return;
    }

    /* Resumen del pedido */
    $("[data-pay-order]").textContent = r.orderId;
    $("[data-pay-cabin]").textContent = r.cabinName;
    $("[data-pay-dates]").textContent = fmtShort(r.start) + " → " + fmtShort(r.end);
    $("[data-pay-nights]").textContent = r.nights + (r.nights === 1 ? " noche" : " noches") + " · " + guestsLabel(r);
    const lines = [["Subtotal", fmtCOP(r.subtotal)]];
    if (r.discountAmount > 0) lines.push(["Descuento · " + r.discountLabel, "−" + fmtCOP(r.discountAmount)]);
    lines.push(["Comisión pasarela (5%)", "+" + fmtCOP(r.fee)]);
    $("[data-pay-lines]").innerHTML = lines.map(([l, v]) =>
      `<div class="pay-line"><span>${esc(l)}</span><span>${esc(v)}</span></div>`).join("");
    $$("[data-pay-amount]").forEach(el => { el.textContent = fmtCOP(r.amount) + " COP"; });
    $("[data-pay-holder]").textContent = (r.name || "Titular").toUpperCase();
    const digits = (r.phone || "").replace(/\D/g, "");
    $("[data-pay-phone]").textContent = digits.length >= 4 ? "+57 3•• ••• ••" + digits.slice(-2) : "+57 3•• ••• ••••";
    $("[data-pay-email]").textContent = r.email;

    /* Cuenta regresiva de la ventana de 2 horas */
    const timer = $("[data-pay-timer]");
    const expires = new Date(r.createdAt).getTime() + HOLD_MS;
    const tick = () => {
      const left = Math.max(0, expires - Date.now());
      const h = Math.floor(left / 3600000), m = Math.floor(left % 3600000 / 60000), s = Math.floor(left % 60000 / 1000);
      timer.textContent = h + ":" + pad(m) + ":" + pad(s);
      if (left <= 0) location.reload();
    };
    tick();
    setInterval(tick, 1000);

    /* Métodos de pago */
    let method = "card";
    const METHOD_NAMES = { card: "Tarjeta de crédito", pse: "PSE", nequi: "Nequi" };
    $$("[data-pay-tab]").forEach(tab => tab.addEventListener("click", () => {
      method = tab.dataset.payTab;
      $$("[data-pay-tab]").forEach(t => {
        t.classList.toggle("is-active", t === tab);
        t.setAttribute("aria-selected", t === tab ? "true" : "false");
      });
      $$("[data-pay-panel]").forEach(p => { p.hidden = p.dataset.payPanel !== method; });
    }));

    const overlay = $("[data-pay-overlay]");
    const ovIcon = $("[data-pay-ov-icon]"), ovTitle = $("[data-pay-ov-title]"), ovText = $("[data-pay-ov-text]"), ovActions = $("[data-pay-ov-actions]");
    function showOverlay(kind, title, text, actions) {
      overlay.hidden = false;
      overlay.dataset.kind = kind;
      ovIcon.textContent = kind === "ok" ? "✓" : kind === "fail" ? "✕" : "";
      ovTitle.textContent = title;
      ovText.textContent = text;
      ovActions.innerHTML = actions || "";
    }

    function pay(approve) {
      showOverlay("loading", "Procesando pago…", "Conectando con " + METHOD_NAMES[method] + ". No cierres esta ventana.");
      setTimeout(() => {
        const current = getReserva(r.orderId);
        if (!current || !isActive(current)) {
          showOverlay("fail", "La orden venció", "Vuelve a reservar para generar una nueva orden.",
            `<a class="btn btn-accent" href="${BASE}">Volver a reservar</a>`);
          return;
        }
        if (!approve) {
          current.payments = (current.payments || []).concat({ method, status: "rejected", at: new Date().toISOString() });
          putReserva(current);
          showOverlay("fail", "Pago rechazado", "El banco no aprobó la transacción. Tus fechas siguen apartadas: puedes intentar con otro método.",
            `<button type="button" class="btn btn-accent" data-pay-retry>Intentar de nuevo</button>`);
          $("[data-pay-retry]").addEventListener("click", () => { overlay.hidden = true; });
          return;
        }
        current.status = "confirmed";
        current.paidAt = new Date().toISOString();
        current.paymentMethod = METHOD_NAMES[method];
        current.paymentRef = "TX-" + Math.random().toString(36).slice(2, 10).toUpperCase();
        current.payments = (current.payments || []).concat({ method, status: "approved", at: current.paidAt, ref: current.paymentRef });
        putReserva(current);
        showOverlay("ok", "Pago aprobado", "Te estamos llevando a la confirmación de tu reserva…");
        setTimeout(() => {
          location.href = BASE + "/gracias?reference=" + encodeURIComponent(current.orderId) + "&status=approved";
        }, 1300);
      }, 2000);
    }
    $("[data-pay-submit]").addEventListener("click", () => pay(true));
    $("[data-pay-reject]").addEventListener("click", () => pay(false));
    $("[data-pay-cancel]").addEventListener("click", e => {
      e.preventDefault();
      const current = getReserva(r.orderId);
      if (current && current.status === "pending") { current.status = "cancelled"; current.cancelledAt = new Date().toISOString(); putReserva(current); }
      location.href = BASE + "?cabin=" + encodeURIComponent(r.cabin) + "&cancelado=1";
    });
  }

  /* =========================================================== */
  /* 3. Gracias / voucher                                         */
  /* =========================================================== */
  function initGracias() {
    if (!$("#voucher-card")) return;
    const params = new URLSearchParams(location.search);
    let orderId = params.get("reference") || params.get("order");
    if (!orderId) { try { orderId = sessionStorage.getItem("clc_pending"); } catch (_) {} }
    const r = getReserva(orderId);
    if (!r) {
      $("[data-voucher-title]").innerHTML = "No encontramos <em>esta reserva.</em>";
      $("[data-voucher-sub]").textContent = "Si la hiciste en otro navegador o dispositivo, ábrela desde allí.";
      return;
    }
    if (r.status !== "confirmed") {
      $("[data-voucher-eyebrow]").lastChild.textContent = "Pago pendiente";
      $("[data-voucher-title]").innerHTML = "Tu reserva está <em>pendiente de pago.</em>";
      $("[data-voucher-sub]").innerHTML = `Completa el pago para confirmarla. <a href="${BASE}/pago?order=${encodeURIComponent(r.orderId)}" style="color:var(--accent);text-decoration:underline;">Ir al pago →</a>`;
      $(".voucher-check-icon").textContent = "…";
    }
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set("v-cabin-name", r.cabinName);
    set("v-order", r.orderId);
    set("v-checkin", fmtLong(r.start));
    set("v-checkout", fmtLong(r.end));
    set("v-nights", r.nights + (r.nights === 1 ? " noche" : " noches"));
    set("v-guests", guestsLabel(r));
    set("v-name", r.name);
    set("v-email", r.email);
    set("v-amount", fmtCOP(r.amount) + " COP");
    set("v-total-label", r.status === "confirmed" ? "Total pagado" : "Total a pagar");
    set("v-method", r.paymentMethod ? r.paymentMethod + " · ref. " + r.paymentRef : "");
    $("#voucher-card").style.display = "";

    const gcal = "https://calendar.google.com/calendar/render?action=TEMPLATE"
      + "&text=" + encodeURIComponent("Estadía Casa Los Curazaos — " + r.cabinName)
      + "&dates=" + r.start.replace(/-/g, "") + "/" + r.end.replace(/-/g, "")
      + "&details=" + encodeURIComponent("Cabaña: " + r.cabinName + "\nOrden: " + r.orderId)
      + "&location=" + encodeURIComponent("Casa Los Curazaos, Llanogrande, Rionegro, Antioquia");
    $("#gcal-btn").href = gcal;
    $("#gcal-wrap").style.display = "";
    $("#mireserva-link").href = BASE + "/mi-reserva?order=" + encodeURIComponent(r.orderId);
    const adminLink = $("[data-admin-link]");
    if (adminLink) adminLink.href = BASE + "/admin?tab=reservas&order=" + encodeURIComponent(r.orderId);
  }

  /* =========================================================== */
  /* 4. Mi reserva                                                */
  /* =========================================================== */
  function initMiReserva() {
    const input = $("#order-input");
    if (!input) return;
    const btn = $("#lookup-btn"), err = $("#lookup-error"), result = $("#reservation-result");
    const changeWrap = $("#change-form-wrap"), badge = $("#policy-badge");
    const changeErr = $("#change-error"), changeOk = $("#change-success");
    let current = null;

    function showErr(el, msg) { el.textContent = msg; el.style.display = ""; }
    function policy(days, r) {
      if (r.changeRequest && r.changeRequest.status === "pendiente") {
        badge.className = "change-policy-badge change-policy-warn";
        badge.innerHTML = `<span class="cpb-icon">⏳</span><div><strong>Solicitud de cambio en revisión</strong>Pediste mover tu estadía al ${esc(fmtShort(r.changeRequest.newStart))} → ${esc(fmtShort(r.changeRequest.newEnd))}. El equipo la revisará y te escribirá.</div>`;
        changeWrap.style.display = "none";
        return;
      }
      if (r.status !== "confirmed") {
        badge.className = "change-policy-badge change-policy-past";
        badge.innerHTML = `<span class="cpb-icon">💳</span><div><strong>Reserva sin pago confirmado</strong>Los cambios de fecha aplican a reservas pagadas.</div>`;
        changeWrap.style.display = "none";
        return;
      }
      if (days < 0) {
        badge.className = "change-policy-badge change-policy-past";
        badge.innerHTML = `<span class="cpb-icon">📅</span><div><strong>Estadía finalizada o en curso</strong>No es posible solicitar cambios de fecha.</div>`;
        changeWrap.style.display = "none";
      } else if (days >= 8) {
        badge.className = "change-policy-badge change-policy-ok";
        badge.innerHTML = `<span class="cpb-icon">✅</span><div><strong>Cambio de fecha sin penalidad</strong>Faltan ${days} días para tu check-in. Puedes solicitar el cambio gratis.</div>`;
        changeWrap.style.display = "";
      } else if (days >= 2) {
        badge.className = "change-policy-badge change-policy-warn";
        badge.innerHTML = `<span class="cpb-icon">⚠️</span><div><strong>Penalidad del 50%</strong>Faltan ${days} días para tu check-in. Si solicitas un cambio se aplica una penalidad del 50% sobre el valor total.</div>`;
        changeWrap.style.display = "";
      } else {
        badge.className = "change-policy-badge change-policy-no";
        badge.innerHTML = `<span class="cpb-icon">🚫</span><div><strong>Cambio no permitido</strong>Faltan menos de 48 horas para tu check-in.</div>`;
        changeWrap.style.display = "none";
      }
    }
    const STATUS = { confirmed: "Confirmada ✓", pending: "Pendiente de pago", cancelled: "Cancelada" };

    function lookup() {
      const id = input.value.trim().toUpperCase();
      err.style.display = "none";
      result.style.display = "none";
      if (!id) { showErr(err, "Ingresa tu código de orden."); return; }
      btn.textContent = "Buscando…";
      btn.disabled = true;
      setTimeout(() => {
        btn.textContent = "Buscar reserva";
        btn.disabled = false;
        const r = getReserva(id);
        if (!r) { showErr(err, "No encontramos una reserva con ese código."); return; }
        current = r;
        $("#r-cabin").textContent = r.cabinName;
        $("#r-checkin").textContent = fmtLong(r.start);
        $("#r-checkout").textContent = fmtLong(r.end);
        $("#r-nights").textContent = r.nights + (r.nights === 1 ? " noche" : " noches");
        $("#r-guests").textContent = guestsLabel(r);
        $("#r-name").textContent = r.name;
        $("#r-status").textContent = (r.status === "pending" && !isActive(r)) ? "Vencida" : (STATUS[r.status] || r.status);
        $("#r-order").textContent = "Orden · " + r.orderId;
        policy(Math.round((parseYMD(r.start) - todayDate()) / 86400000), r);
        changeErr.style.display = "none";
        changeOk.style.display = "none";
        result.style.display = "";
      }, 450);
    }
    btn.addEventListener("click", lookup);
    input.addEventListener("keydown", e => { if (e.key === "Enter") lookup(); });

    const t = ymd(todayDate());
    $("#new-start").min = t;
    $("#new-end").min = t;
    $("#change-btn").addEventListener("click", () => {
      if (!current) return;
      const ns = $("#new-start").value, ne = $("#new-end").value;
      changeErr.style.display = "none";
      if (!ns || !ne) { showErr(changeErr, "Ingresa las nuevas fechas."); return; }
      if (ns >= ne) { showErr(changeErr, "La fecha de salida debe ser posterior a la de llegada."); return; }
      if (ns < t) { showErr(changeErr, "La nueva llegada no puede ser en el pasado."); return; }
      if (hasConflict(current.cabin, ns, ne, current.orderId)) {
        showErr(changeErr, "La cabaña no está disponible en esas fechas. Prueba con otras.");
        return;
      }
      const r = getReserva(current.orderId);
      r.changeRequest = { newStart: ns, newEnd: ne, message: $("#change-msg").value.trim(), createdAt: new Date().toISOString(), status: "pendiente" };
      putReserva(r);
      current = r;
      changeOk.textContent = "✓ Solicitud enviada. Las fechas están disponibles; el equipo de Casa Los Curazaos la revisará y te confirmará por WhatsApp.";
      changeOk.style.display = "";
      changeWrap.style.display = "none";
    });

    const pre = new URLSearchParams(location.search).get("order");
    if (pre) { input.value = pre.toUpperCase(); lookup(); }
  }

  /* =========================================================== */
  /* 5. Panel del hotel                                           */
  /* =========================================================== */
  function initAdmin() {
    const panel = $("[data-admin]");
    if (!panel) return;
    const params = new URLSearchParams(location.search);
    let tab = params.get("tab") || "calendario";
    let monthOffset = 0;

    function setTab(next) {
      tab = next;
      $$("[data-adm-tab]").forEach(a => a.classList.toggle("is-active", a.dataset.admTab === tab));
      $$("[data-adm-panel]").forEach(p => { p.hidden = p.dataset.admPanel !== tab; });
      const url = new URL(location.href);
      url.searchParams.set("tab", tab);
      history.replaceState(null, "", url.pathname + url.search);
    }
    $$("[data-adm-tab]").forEach(a => a.addEventListener("click", e => { e.preventDefault(); setTab(a.dataset.admTab); }));

    /* --- KPIs --- */
    function renderKpis() {
      const all = Object.values(getReservas());
      const confirmed = all.filter(r => r.status === "confirmed");
      const income = confirmed.reduce((s, r) => s + (r.amount || 0), 0);
      const nights = confirmed.reduce((s, r) => s + (r.nights || 0), 0);
      const pending = all.filter(r => r.status === "pending" && isActive(r)).length;
      // Ocupación del mes visible en el calendario (cabaña-noches de las 3 cabañas).
      const t = todayDate();
      const month = new Date(t.getFullYear(), t.getMonth() + monthOffset, 1);
      const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
      let busy = 0;
      SINGLE.forEach(c => {
        const occ = occupancy(c);
        for (let d = 1; d <= days; d++) if (occ.has(ymd(new Date(month.getFullYear(), month.getMonth(), d)))) busy++;
      });
      const occPct = Math.round(busy / (days * 3) * 100);
      $("[data-kpis]").innerHTML = [
        ["Reservas web confirmadas", confirmed.length],
        ["Ingresos por web", fmtCOP(income)],
        ["Noches vendidas por web", nights],
        ["Pagos pendientes", pending],
        ["Ocupación " + MONTH_NAMES[month.getMonth()], occPct + "%"]
      ].map(([l, v]) => `<div class="adm-kpi"><span class="adm-kpi-val">${esc(v)}</span><span class="adm-kpi-label">${esc(l)}</span></div>`).join("");
    }

    /* --- Calendario de ocupación --- */
    function renderCalendar() {
      const t = todayDate();
      const month = new Date(t.getFullYear(), t.getMonth() + monthOffset, 1);
      const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
      $("[data-adm-month]").textContent = MONTH_NAMES[month.getMonth()] + " " + month.getFullYear();
      $("[data-adm-prev]").disabled = monthOffset <= -1;
      $("[data-adm-next]").disabled = monthOffset >= 12;
      let head = `<div class="adm-cal-row adm-cal-head" style="--days:${days}"><span class="adm-cal-name"></span>`;
      for (let d = 1; d <= days; d++) {
        const date = new Date(month.getFullYear(), month.getMonth(), d);
        const cls = [isWeekendNight(date) ? "is-weekend" : "", isHoliday(date) ? "is-holiday" : "", date.getTime() === t.getTime() ? "is-today" : ""].join(" ");
        head += `<span class="adm-cal-dayhead ${cls}" title="${esc(fmtLong(ymd(date)))}${isHoliday(date) ? " · festivo" : ""}"><b>${d}</b>${WEEKDAYS[(date.getDay() + 6) % 7].charAt(0)}</span>`;
      }
      head += "</div>";
      const rows = CABINS.map(c => {
        const occ = occupancy(c.id);
        let row = `<div class="adm-cal-row" style="--days:${days}"><span class="adm-cal-name">${esc(c.nombre)}</span>`;
        for (let d = 1; d <= days; d++) {
          const date = new Date(month.getFullYear(), month.getMonth(), d);
          const info = occ.get(ymd(date));
          const past = date < t ? " is-past" : "";
          row += info
            ? `<span class="adm-cal-cell is-${info.type}${past}" title="${esc(fmtShort(ymd(date)) + " · " + info.label)}"></span>`
            : `<span class="adm-cal-cell${past}" title="${esc(fmtShort(ymd(date)))} · libre"></span>`;
        }
        return row + "</div>";
      }).join("");
      $("[data-adm-cal]").innerHTML = head + rows;
    }
    $("[data-adm-prev]").addEventListener("click", () => { monthOffset--; renderCalendar(); renderKpis(); });
    $("[data-adm-next]").addEventListener("click", () => { monthOffset++; renderCalendar(); renderKpis(); });

    /* --- Bloqueos --- */
    const blkForm = $("[data-blk-form]");
    const blkMsg = $("[data-blk-msg]");
    blkForm.cabin.innerHTML = CABINS.map(c => `<option value="${c.id}">${esc(c.full)}</option>`).join("");
    blkForm.start.min = ymd(todayDate());
    blkForm.end.min = ymd(todayDate());
    blkForm.addEventListener("submit", e => {
      e.preventDefault();
      const cabin = blkForm.cabin.value, start = blkForm.start.value, end = blkForm.end.value;
      blkMsg.style.color = "var(--accent)";
      if (!start || !end || start >= end) { blkMsg.textContent = "Elige un rango válido: la fecha final es el día de salida."; return; }
      const occ = occupancy(cabin);
      const cur = parseYMD(start);
      while (cur < parseYMD(end)) {
        const info = occ.get(ymd(cur));
        if (info && (info.type === "web" || info.type === "pending")) {
          blkMsg.textContent = "Ese rango choca con una reserva web (" + info.label + ").";
          return;
        }
        cur.setDate(cur.getDate() + 1);
      }
      const all = getBloqueos();
      all.push({ id: "BLK-" + Date.now().toString(36).toUpperCase(), cabin, start, end, note: blkForm.note.value.trim(), createdAt: new Date().toISOString() });
      saveBloqueos(all);
      blkForm.reset();
      blkMsg.style.color = "var(--accent-2)";
      blkMsg.textContent = "✓ Fechas bloqueadas. Ya no aparecen disponibles en el motor.";
      renderAll();
    });
    function renderBloqueos() {
      const list = getBloqueos().slice().sort((a, b) => a.start.localeCompare(b.start));
      const host = $("[data-blk-list]");
      if (!list.length) { host.innerHTML = `<p class="adm-empty">No hay bloqueos manuales. Las noches ocupadas vienen de Airbnb y de las reservas web.</p>`; return; }
      host.innerHTML = `<div class="adm-table-wrap"><table class="adm-table"><thead><tr>
        <th>Cabaña</th><th>Desde</th><th>Hasta (salida)</th><th>Nota</th><th></th></tr></thead><tbody>
        ${list.map(b => `<tr><td>${esc(cabinById(b.cabin).nombre)}</td><td>${esc(fmtShort(b.start))}</td><td>${esc(fmtShort(b.end))}</td>
          <td class="adm-notes">${esc(b.note || "—")}</td>
          <td><button type="button" class="adm-btn adm-btn-danger" data-blk-del="${esc(b.id)}">Liberar fechas</button></td></tr>`).join("")}
        </tbody></table></div>`;
    }
    $("[data-blk-list]").addEventListener("click", e => {
      const b = e.target.closest("[data-blk-del]");
      if (!b) return;
      saveBloqueos(getBloqueos().filter(x => x.id !== b.dataset.blkDel));
      renderAll();
    });

    /* --- Reservas --- */
    const STATUS = { confirmed: ["Confirmada", "ok"], pending: ["Pendiente de pago", "warn"], cancelled: ["Cancelada", "off"], expired: ["Vencida", "off"] };
    function renderReservas() {
      const focus = (params.get("order") || "").toUpperCase();
      const all = Object.values(getReservas()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const host = $("[data-res-list]");
      if (!all.length) {
        host.innerHTML = `<p class="adm-empty">Todavía no hay reservas web. <a href="${BASE}">Haz una reserva de prueba</a> y aparecerá aquí al instante.</p>`;
        return;
      }
      host.innerHTML = `<div class="adm-table-wrap"><table class="adm-table"><thead><tr>
        <th>Código</th><th>Estado</th><th>Cabaña</th><th>Huésped</th><th>Check-in</th><th>Check-out</th><th>Noches</th><th>Huéspedes</th><th>Total</th><th>Creada</th><th></th></tr></thead><tbody>
        ${all.map(r => {
          const st = r.status === "pending" && !isActive(r) ? "expired" : r.status;
          const [label, tone] = STATUS[st] || [st, "off"];
          const cr = r.changeRequest && r.changeRequest.status === "pendiente" ? r.changeRequest : null;
          const actions = [];
          if (st === "pending") actions.push(`<button type="button" class="adm-btn" data-res-act="confirm" data-id="${r.orderId}">Marcar pagada</button>`);
          if (st === "confirmed" || st === "pending") actions.push(`<button type="button" class="adm-btn" data-res-act="cancel" data-id="${r.orderId}">Cancelar</button>`);
          actions.push(`<button type="button" class="adm-btn adm-btn-danger" data-res-act="delete" data-id="${r.orderId}">Borrar</button>`);
          return `<tr class="${r.orderId === focus ? "is-focus" : ""}">
            <td><span class="adm-code">${esc(r.orderId)}</span></td>
            <td><span class="adm-pill adm-pill-${tone}">${esc(label)}</span>${r.paymentMethod ? `<span class="adm-sub">${esc(r.paymentMethod)}</span>` : ""}</td>
            <td>${esc(cabinById(r.cabin).nombre)}</td>
            <td>${esc(r.name)}<span class="adm-sub">${esc(r.email)} · ${esc(r.phone)}</span>${r.discount ? `<span class="adm-sub">Código ${esc(r.discount)}${r.discountRef ? " · " + esc(r.discountRef) : ""}</span>` : ""}${r.message ? `<span class="adm-sub">“${esc(r.message)}”</span>` : ""}</td>
            <td>${esc(fmtShort(r.start))}</td>
            <td>${esc(fmtShort(r.end))}</td>
            <td>${r.nights}</td>
            <td>${esc(guestsLabel(r))}</td>
            <td><strong>${fmtCOP(r.amount)}</strong></td>
            <td>${esc(new Date(r.createdAt).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }))}</td>
            <td><div class="adm-actions">${actions.join("")}</div></td>
          </tr>${cr ? `<tr class="adm-change-row"><td colspan="11">
            <strong>Solicitud de cambio de fecha:</strong> ${esc(fmtShort(r.start))} → ${esc(fmtShort(r.end))} pasaría a <strong>${esc(fmtShort(cr.newStart))} → ${esc(fmtShort(cr.newEnd))}</strong>${cr.message ? ` · “${esc(cr.message)}”` : ""}
            <span class="adm-actions"><button type="button" class="adm-btn" data-res-act="approve" data-id="${r.orderId}">Aprobar cambio</button><button type="button" class="adm-btn adm-btn-danger" data-res-act="reject" data-id="${r.orderId}">Rechazar</button></span>
          </td></tr>` : ""}`;
        }).join("")}
        </tbody></table></div>`;
    }
    $("[data-res-list]").addEventListener("click", e => {
      const b = e.target.closest("[data-res-act]");
      if (!b) return;
      const all = getReservas();
      const r = all[b.dataset.id];
      if (!r) return;
      const act = b.dataset.resAct;
      if (act === "confirm") {
        if (hasConflict(r.cabin, r.start, r.end, r.orderId)) { alert("Esas fechas ya se ocuparon con otra reserva o bloqueo."); return; }
        r.status = "confirmed"; r.paidAt = new Date().toISOString(); r.paymentMethod = "Registrado manualmente";
      } else if (act === "cancel") {
        if (!confirm("¿Cancelar la reserva " + r.orderId + "? Las fechas quedan libres en el motor.")) return;
        r.status = "cancelled"; r.cancelledAt = new Date().toISOString();
      } else if (act === "delete") {
        if (!confirm("¿Borrar la reserva " + r.orderId + " del registro de la demo?")) return;
        delete all[r.orderId];
      } else if (act === "approve") {
        const cr = r.changeRequest;
        if (hasConflict(r.cabin, cr.newStart, cr.newEnd, r.orderId)) { alert("Las nuevas fechas ya no están disponibles."); return; }
        r.previousDates = { start: r.start, end: r.end };
        r.start = cr.newStart; r.end = cr.newEnd; r.nights = nightsBetween(r.start, r.end);
        cr.status = "aprobada"; cr.resolvedAt = new Date().toISOString();
      } else if (act === "reject") {
        r.changeRequest.status = "rechazada"; r.changeRequest.resolvedAt = new Date().toISOString();
      }
      saveReservas(all);
      renderAll();
    });

    /* --- Descuentos --- */
    const TYPE_LABEL = { pct: "Porcentaje", second_night: "50% 2.ª noche", weekday_2x1: "2x1 entre semana" };
    function renderCodes() {
      const codes = getCodes();
      $("[data-codes-list]").innerHTML = `<div class="adm-table-wrap"><table class="adm-table"><thead><tr>
        <th>Código</th><th>Tipo</th><th>Valor</th><th>Vigencia</th><th>Pide empresa</th><th>Estado</th><th>Notas</th><th></th></tr></thead><tbody>
        ${Object.keys(codes).sort().map(k => {
          const c = codes[k];
          const vig = c.from || c.until ? (c.from ? fmtShort(c.from) : "hoy") + " → " + (c.until ? fmtShort(c.until) : "sin fin") : "Permanente";
          return `<tr><td><span class="adm-code">${esc(k)}</span></td><td>${esc(TYPE_LABEL[c.type] || c.type)}</td>
            <td>${c.type === "pct" ? esc(c.pct) + "%" : "—"}</td><td>${esc(vig)}</td><td>${c.requiresRef ? esc(c.refLabel || "Sí") : "No"}</td>
            <td><button type="button" class="adm-switch ${c.active !== false ? "is-on" : ""}" data-code-toggle="${esc(k)}" aria-pressed="${c.active !== false}">${c.active !== false ? "Activo" : "Inactivo"}</button></td>
            <td class="adm-notes">${esc(c.notes || "")}</td>
            <td><button type="button" class="adm-btn adm-btn-danger" data-code-del="${esc(k)}">Eliminar</button></td></tr>`;
        }).join("")}
        </tbody></table></div>`;
    }
    $("[data-codes-list]").addEventListener("click", e => {
      const codes = getCodes();
      const tg = e.target.closest("[data-code-toggle]");
      const del = e.target.closest("[data-code-del]");
      if (tg) { const c = codes[tg.dataset.codeToggle]; c.active = c.active === false; }
      else if (del) { if (!confirm("¿Eliminar el código " + del.dataset.codeDel + "?")) return; delete codes[del.dataset.codeDel]; }
      else return;
      saveCodes(codes);
      renderCodes();
    });
    const codeForm = $("[data-code-form]");
    const codeMsg = $("[data-code-msg]");
    const syncType = () => { codeForm.pct.closest(".booking-field").style.display = codeForm.type.value === "pct" ? "" : "none"; };
    codeForm.type.addEventListener("change", syncType);
    syncType();
    codeForm.requiresRef.addEventListener("change", () => {
      codeForm.refLabel.closest(".booking-field").style.display = codeForm.requiresRef.checked ? "" : "none";
    });
    codeForm.addEventListener("submit", e => {
      e.preventDefault();
      const code = codeForm.code.value.trim().toUpperCase().replace(/\s+/g, "");
      codeMsg.style.color = "var(--accent)";
      if (!/^[A-Z0-9-]{3,20}$/.test(code)) { codeMsg.textContent = "El código debe tener de 3 a 20 letras, números o guiones."; return; }
      const codes = getCodes();
      if (codes[code]) { codeMsg.textContent = "Ese código ya existe."; return; }
      const pct = parseFloat(codeForm.pct.value);
      if (codeForm.type.value === "pct" && !(pct > 0 && pct <= 90)) { codeMsg.textContent = "El porcentaje debe estar entre 1 y 90."; return; }
      codes[code] = {
        type: codeForm.type.value,
        pct: codeForm.type.value === "pct" ? pct : undefined,
        active: true,
        from: codeForm.from.value || undefined,
        until: codeForm.until.value || undefined,
        requiresRef: codeForm.requiresRef.checked,
        refLabel: codeForm.requiresRef.checked ? (codeForm.refLabel.value.trim() || "Nombre de tu empresa") : undefined,
        notes: codeForm.notes.value.trim()
      };
      saveCodes(codes);
      codeForm.reset();
      syncType();
      codeForm.refLabel.closest(".booking-field").style.display = "none";
      codeMsg.style.color = "var(--accent-2)";
      codeMsg.textContent = "✓ Código " + code + " creado. Ya funciona en el motor de reservas.";
      renderCodes();
    });

    /* --- Restablecer --- */
    $("[data-adm-reset]").addEventListener("click", () => {
      if (!confirm("¿Restablecer la demo? Se borran las reservas, bloqueos y códigos creados en este navegador.")) return;
      try { Object.values(KEYS).forEach(k => localStorage.removeItem(k)); sessionStorage.removeItem("clc_pending"); } catch (_) {}
      renderAll();
    });

    function renderAll() {
      renderKpis();
      renderCalendar();
      renderBloqueos();
      renderReservas();
      renderCodes();
    }
    renderAll();
    setTab(["calendario", "reservas", "descuentos"].includes(tab) ? tab : "calendario");

    // Si otra pestaña hace una reserva, el panel se actualiza solo.
    window.addEventListener("storage", e => { if (Object.values(KEYS).includes(e.key)) renderAll(); });
  }

  /* ---------- Boot ------------------------------------------- */
  const PAGES = { reservar: initReservar, pago: initPago, gracias: initGracias, "mi-reserva": initMiReserva, admin: initAdmin };
  function boot() {
    const fn = PAGES[document.body.dataset.demo];
    if (!fn) return;
    try { fn(); } catch (e) { console.warn("[demo-reservas]", e); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
