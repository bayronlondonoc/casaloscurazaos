/* Casa Los Curazaos — runtime principal.
   IIFE clásica, sin import/export.  */
(function () {
  "use strict";

  const data = window.__BRAND__ || {};

  /* ---------- Helpers --------------------------------------- */
  const $  = (sel, scope) => (scope || document).querySelector(sel);
  const $$ = (sel, scope) => Array.from((scope || document).querySelectorAll(sel));
  const escHTML = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c =>
    ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c]);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  function safe(fn, name) {
    try { fn(); } catch (e) { console.warn("[" + name + "]", e); }
  }
  function fmtCOP(n) {
    if (n == null) return "—";
    return "$" + Math.round(n).toLocaleString("es-CO");
  }
  function fmtCOPshort(n) {
    if (n == null) return "—";
    if (n >= 1000000) return "$" + (n/1000000).toFixed(1).replace(/\.0$/, "") + "M";
    if (n >= 1000)    return "$" + Math.round(n/1000) + "k";
    return "$" + n;
  }
  function ymd(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function diffDays(a, b) {
    const A = new Date(a.getFullYear(), a.getMonth(), a.getDate());
    const B = new Date(b.getFullYear(), b.getMonth(), b.getDate());
    return Math.round((B - A) / (1000 * 60 * 60 * 24));
  }
  /* === Festivos colombianos y tarifa de noche === */

  /** Domingo de Pascua (algoritmo anónimo gregoriano). */
  function easterSunday(year) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31); // 1-based
    const day   = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
  }

  /** Ley Emiliani: mueve al siguiente lunes si no es lunes. */
  function emiliani(dt) {
    const d = new Date(dt);
    const dow = d.getDay();
    if (dow !== 1) d.setDate(d.getDate() + (dow === 0 ? 1 : 8 - dow));
    return d;
  }

  /** Devuelve un Set de strings 'YYYY-MM-DD' con todos los festivos del año. */
  const _holidayCache = {};
  function colombiaHolidays(year) {
    if (_holidayCache[year]) return _holidayCache[year];
    const s = new Set();
    const pad = n => String(n).padStart(2, '0');
    const addD = dt => s.add(`${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}`);
    const add  = (m, d) => addD(new Date(year, m-1, d));

    // Fijos
    add(1,1); add(5,1); add(7,20); add(8,7); add(12,8); add(12,25);

    // Semana Santa
    const easter = easterSunday(year);
    const off = n => { const d = new Date(easter); d.setDate(d.getDate() + n); return d; };
    addD(off(-3)); // Jueves Santo
    addD(off(-2)); // Viernes Santo
    addD(emiliani(off(39)));  // Ascensión
    addD(emiliani(off(60)));  // Corpus Christi
    addD(emiliani(off(71)));  // Sagrado Corazón

    // Emiliani (mes, día original)
    [[1,6],[3,19],[6,29],[8,15],[10,12],[11,1],[11,11]].forEach(([m,d]) =>
      addD(emiliani(new Date(year, m-1, d)))
    );

    _holidayCache[year] = s;
    return s;
  }

  function isColombiHoliday(date) {
    const y = date.getFullYear();
    const pad = n => String(n).padStart(2, '0');
    const k = `${y}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
    return colombiaHolidays(y).has(k);
  }

  /**
   * Una noche cobra tarifa finde si:
   *   - El AMANECER (día siguiente) cae en sáb, dom o festivo.
   *   - O la NOCHE MISMA es un día festivo (ej: lunes 12 oct festivo).
   *
   *   noche vie → amanece sáb → finde ✓
   *   noche sáb → amanece dom → finde ✓
   *   noche dom → amanece lun (normal) → semana ✓
   *   noche dom antes de festivo lun → finde ✓
   *   noche lun festivo (12-oct) → noche misma es festivo → finde ✓
   */
  function isWeekendNight(date) {
    const next = new Date(date);
    next.setDate(next.getDate() + 1);
    const dow = next.getDay();
    if (dow === 6 || dow === 0)    return true;  // amanece sáb o dom
    if (isColombiHoliday(date))    return true;  // la noche misma es festivo
    if (isColombiHoliday(next))    return true;  // amanece en festivo
    return false;
  }
  /* Temporada alta: 20 dic – 6 ene. Tarifa plana ($500.000/cabaña). */
  function isHighSeason(date) {
    const month = date.getMonth() + 1;
    const day   = date.getDate();
    if (month === 12 && day >= 20) return true;
    if (month === 1  && day <= 6)  return true;
    return false;
  }

  /* Divide un rango llegada/salida en noches semana vs fin de semana, considerando alta temporada */
  function splitNights(start, end) {
    let semana = 0, finde = 0, semanaSeason = 0, findeSeason = 0;
    const cur = new Date(start);
    while (cur < end) {
      const isWeekend = isWeekendNight(cur);
      const isSeason = isHighSeason(cur);
      if (isWeekend) {
        if (isSeason) findeSeason++; else finde++;
      } else {
        if (isSeason) semanaSeason++; else semana++;
      }
      cur.setDate(cur.getDate() + 1);
    }
    return { semana, finde, semanaSeason, findeSeason, total: semana + finde + semanaSeason + findeSeason };
  }

  /* ---------- 1. Splash ------------------------------------- */
  function initSplash() {
    const splash = $("[data-splash]");
    if (!splash) return;
    const hide = () => splash.classList.add("is-out");
    if (document.readyState === "complete") setTimeout(hide, 500);
    else window.addEventListener("load", () => setTimeout(hide, 350));
    setTimeout(hide, 3500);
  }

  /* ---------- 2. Nav ---------------------------------------- */
  function initNav() {
    const nav = $(".nav");
    if (!nav) return;
    const onScroll = () => {
      if (scrollY > 30) nav.classList.add("is-scrolled");
      else nav.classList.remove("is-scrolled");
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    const toggle = $(".nav-toggle");
    const mobile = $(".nav-mobile");
    if (toggle && mobile) {
      toggle.addEventListener("click", () => {
        document.body.classList.toggle("is-menu-open");
        const open = document.body.classList.contains("is-menu-open");
        toggle.setAttribute("aria-expanded", open ? "true" : "false");
        mobile.setAttribute("aria-hidden", open ? "false" : "true");
      });
      $$(".nav-mobile-link, .nav-mobile a", mobile).forEach(a => {
        a.addEventListener("click", () => {
          document.body.classList.remove("is-menu-open");
          toggle.setAttribute("aria-expanded", "false");
          mobile.setAttribute("aria-hidden", "true");
        });
      });
    }

    const path = location.pathname.split("/").pop() || "index.html";
    $$(".nav-link, .nav-mobile-link").forEach(a => {
      const href = (a.getAttribute("href") || "").split("/").pop();
      if (href === path) a.classList.add("is-active");
    });
  }

  /* ---------- 3. Reveal on scroll --------------------------- */
  function initReveals() {
    const els = $$("[data-reveal]");
    if (!els.length) return;
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add("is-revealed");
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.04, rootMargin: "0px 0px -3% 0px" });
    els.forEach(el => io.observe(el));

    setTimeout(() => {
      $$("[data-reveal]:not(.is-revealed)").forEach(el => {
        if (el.getBoundingClientRect().top < window.innerHeight + 200) {
          el.classList.add("is-revealed");
        }
      });
    }, 6000);
  }

  /* ---------- 4. Smooth anchor handling --------------------- */
  function initSmoothAnchors() {
    document.addEventListener("click", e => {
      const a = e.target.closest('a[href^="#"]');
      if (!a) return;
      const id = a.getAttribute("href");
      if (!id || id === "#") return;
      const el = document.querySelector(id);
      if (!el) return;
      e.preventDefault();
      const navOffset = 90;
      window.scrollTo({
        top: el.getBoundingClientRect().top + scrollY - navOffset,
        behavior: reduced ? "auto" : "smooth"
      });
    });
  }

  /* ---------- 5. Hero parallax (GSAP) ----------------------- */
  function initHeroParallax() {
    if (!window.gsap || !window.ScrollTrigger) return;
    const heroBg = $(".hero-bg");
    const heroContent = $(".hero-content");
    const hero = $(".hero");
    if (!hero) return;
    if (heroBg) {
      gsap.to(heroBg, {
        yPercent: 22, ease: "none",
        scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: true }
      });
    }
    if (heroContent) {
      gsap.to(heroContent, {
        yPercent: -32, opacity: 0.05, ease: "none",
        scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: true }
      });
    }
  }

  /* ---------- 6. Marquee ------------------------------------ */
  function initMarquee() {
    $$("[data-marquee]").forEach(track => {
      if (track.dataset.marqueeBound) return;
      track.dataset.marqueeBound = "1";
      const clone = track.cloneNode(true);
      clone.removeAttribute("data-marquee");
      clone.setAttribute("aria-hidden", "true");
      track.parentNode.appendChild(clone);
      if (window.gsap) {
        const distance = track.scrollWidth;
        const speed = 65;
        gsap.to([track, clone], {
          x: -distance, duration: distance / speed,
          ease: "none", repeat: -1,
          modifiers: { x: gsap.utils.unitize(x => parseFloat(x) % distance) }
        });
      }
    });
  }

  /* ---------- 7. Lightbox ----------------------------------- */
  function initLightbox() {
    const triggers = $$("[data-lightbox] img");
    if (!triggers.length) return;

    const groups = new Map();
    triggers.forEach(img => {
      const parent = img.closest("[data-lightbox]");
      const key = parent ? (parent.getAttribute("data-lightbox") || "default") : "single";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(img);
    });

    let lb = $(".lightbox");
    if (!lb) {
      lb = document.createElement("div");
      lb.className = "lightbox";
      lb.setAttribute("role", "dialog");
      lb.setAttribute("aria-modal", "true");
      lb.setAttribute("aria-hidden", "true");
      lb.innerHTML = `
        <button class="lightbox-close" aria-label="Cerrar">✕</button>
        <button class="lightbox-prev" aria-label="Anterior">‹</button>
        <button class="lightbox-next" aria-label="Siguiente">›</button>
        <img class="lightbox-img" alt="" />
        <div class="lightbox-counter"></div>
      `;
      document.body.appendChild(lb);
    }
    const lbImg = $(".lightbox-img", lb);
    const lbCounter = $(".lightbox-counter", lb);
    const lbClose = $(".lightbox-close", lb);
    const lbPrev = $(".lightbox-prev", lb);
    const lbNext = $(".lightbox-next", lb);

    let currentGroup = null;
    let currentIdx = 0;

    function open(group, idx) {
      currentGroup = group;
      currentIdx = idx;
      const img = currentGroup[idx];
      lbImg.src = img.getAttribute("src");
      lbImg.alt = img.getAttribute("alt") || "";
      lbCounter.textContent = `${idx + 1} / ${currentGroup.length}`;
      lb.classList.add("is-open");
      lb.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
    }
    function close() {
      lb.classList.remove("is-open");
      lb.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
    }
    function nav(dir) {
      if (!currentGroup) return;
      currentIdx = (currentIdx + dir + currentGroup.length) % currentGroup.length;
      const img = currentGroup[currentIdx];
      lbImg.src = img.getAttribute("src");
      lbImg.alt = img.getAttribute("alt") || "";
      lbCounter.textContent = `${currentIdx + 1} / ${currentGroup.length}`;
    }

    triggers.forEach(img => {
      img.addEventListener("click", () => {
        const parent = img.closest("[data-lightbox]");
        const key = parent ? (parent.getAttribute("data-lightbox") || "default") : "single";
        const group = groups.get(key);
        const idx = group.indexOf(img);
        open(group, idx);
      });
    });
    lbClose.addEventListener("click", close);
    lbPrev.addEventListener("click", () => nav(-1));
    lbNext.addEventListener("click", () => nav(1));
    lb.addEventListener("click", e => { if (e.target === lb) close(); });
    document.addEventListener("keydown", e => {
      if (!lb.classList.contains("is-open")) return;
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") nav(-1);
      if (e.key === "ArrowRight") nav(1);
    });
  }

  /* ---------- 8. Carousel ----------------------------------- */
  /* Carrusel basado en transform: translateX — funciona en cualquier
     ambiente. Soporta flechas, dots, teclado y swipe touch. */
  function initCarousels() {
    $$("[data-carousel]").forEach(carousel => {
      if (carousel.dataset.carouselBound) return;
      carousel.dataset.carouselBound = "1";
      const track = $(".carousel-track", carousel);
      const prev  = $(".carousel-prev", carousel);
      const next  = $(".carousel-next", carousel);
      const dotsHost = $(".carousel-dots", carousel);
      if (!track) return;

      const slides = $$(".carousel-slide", track);
      if (!slides.length) return;

      if (dotsHost) {
        dotsHost.innerHTML = slides.map((_, i) =>
          `<button class="carousel-dot${i===0?' is-active':''}" aria-label="Ir a la imagen ${i+1}"></button>`
        ).join("");
      }
      const dots = $$(".carousel-dot", carousel);

      let idx = 0;

      function goTo(target) {
        idx = Math.max(0, Math.min(slides.length - 1, target));
        track.style.transform = `translate3d(${-idx * 100}%, 0, 0)`;
        dots.forEach((d, i) => d.classList.toggle("is-active", i === idx));
        if (prev) prev.disabled = idx <= 0;
        if (next) next.disabled = idx >= slides.length - 1;
      }

      prev && prev.addEventListener("click", () => goTo(idx - 1));
      next && next.addEventListener("click", () => goTo(idx + 1));
      dots.forEach((d, i) => d.addEventListener("click", () => goTo(i)));

      /* Swipe touch */
      let touchStartX = null;
      track.addEventListener("touchstart", e => {
        touchStartX = e.touches[0].clientX;
      }, { passive: true });
      track.addEventListener("touchend", e => {
        if (touchStartX == null) return;
        const dx = e.changedTouches[0].clientX - touchStartX;
        if (Math.abs(dx) > 40) goTo(dx > 0 ? idx - 1 : idx + 1);
        touchStartX = null;
      }, { passive: true });

      /* Keyboard cuando el carrusel tiene foco */
      carousel.addEventListener("keydown", e => {
        if (e.key === "ArrowLeft") { e.preventDefault(); goTo(idx - 1); }
        if (e.key === "ArrowRight") { e.preventDefault(); goTo(idx + 1); }
      });

      goTo(0);
    });
  }

  /* ---------- 9. Booking engine ----------------------------- */
  function initBookingEngine() {
    const root = $("[data-booking]");
    if (!root) return;

    /* Códigos de descuento — sincronizado con api/_config.php
       Tipos: número = %, objeto = tipo especial (active: true/false)  */
    const DISCOUNT_CODES = {
      "BAYRON10":    15,
      "CORPORATIVO": 25,
      "TEST1000":    99.0,
      // Influencers activos (añade/elimina según campaña):
      // "ISA15-CLC":  15,
      // Promocionales especiales:
      "SEGUNDA50":  { type: "second_night", active: false },
      "SEMANA2X1":  { type: "weekday_2x1",  active: false },
    };

    const AIRBNB_URLS = {
      'luxe':          'https://airbnb.com.co/h/loscurazaosluxury',
      'comfort':       'https://airbnb.com.co/h/loscurazaoscomfort',
      'prestige':      'https://airbnb.com.co/h/loscurazaosprestige',
      'casa-completa': 'https://airbnb.com.co/h/casaloscurazaos'
    };

    const CABIN_LIMITS = {
      luxe:           { adultsMax: 3, childrenMax: 2, pubLabel: "2 huéspedes",  realLabel: "hasta 3 adultos o 2 ad + 2 niños" },
      comfort:        { adultsMax: 5, childrenMax: 2, pubLabel: "5 huéspedes",  realLabel: "hasta 5 adultos + 2 niños" },
      prestige:       { adultsMax: 3, childrenMax: 2, pubLabel: "2 huéspedes",  realLabel: "hasta 3 adultos o 2 ad + 2 niños" },
      "casa-completa":{ adultsMax: 11, childrenMax: 6, pubLabel: "8 huéspedes", realLabel: "hasta 11 adultos o 8 ad + 6 niños" }
    };

    const state = {
      cabin: null,
      start: null,
      end: null,
      adults: 2,
      children: 0,
      pets: false,
      name: "",
      cedula: "",
      email: "",
      phone: "",
      message: "",
      discount: "",
      discountPercentage: 0,
      discountData: null,
      busy: {},
      monthOffset: 0
    };

    /* ---------- Cabin selector ---------- */
    const cabinShell = $("[data-booking-cabins]", root);
    const allCabinsForBooking = [
      ...data.cabanas.map(c => ({
        id: c.id, nombre: c.nombre,
        capPub: CABIN_LIMITS[c.id].pubLabel,
        capReal: CABIN_LIMITS[c.id].realLabel,
        price: data.tarifas[c.id]
      })),
      { id: "casa-completa",
        nombre: "Casa Completa",
        capPub: CABIN_LIMITS["casa-completa"].pubLabel,
        capReal: CABIN_LIMITS["casa-completa"].realLabel,
        price: data.tarifas["casa-completa"]
      }
    ];

    cabinShell.innerHTML = allCabinsForBooking.map(c => {
      const sem = c.price && c.price.semana != null ? fmtCOPshort(c.price.semana) : "Consultar";
      const fin = c.price && c.price.finde  != null ? fmtCOPshort(c.price.finde)  : "—";
      const priceLine = (c.price && c.price.semana != null)
        ? `<span><i>L–J</i> ${sem}</span><span><i>V–D</i> ${fin}</span>`
        : `<span class="num">Consultar</span>`;
      return `
        <label class="booking-cabin-option" data-cabin-opt="${c.id}">
          <input type="radio" name="cabin" value="${c.id}" />
          <span class="booking-cabin-option-name">${escHTML(c.nombre)}</span>
          <span class="booking-cabin-option-pax">${escHTML(c.capPub)}</span>
          <span class="booking-cabin-option-price-split">${priceLine}</span>
          <span class="booking-cabin-option-realcap">${escHTML(c.capReal)}</span>
        </label>
      `;
    }).join("");

    cabinShell.addEventListener("change", e => {
      if (e.target.name !== "cabin") return;
      state.cabin = e.target.value;
      $$(".booking-cabin-option", cabinShell).forEach(el => el.classList.remove("is-selected"));
      e.target.closest(".booking-cabin-option").classList.add("is-selected");

      const lim = CABIN_LIMITS[state.cabin];
      const adultsInput = $("[data-counter='adults']", root);
      const childrenInput = $("[data-counter='children']", root);
      if (adultsInput) {
        adultsInput.dataset.max = String(lim.adultsMax);
        if (state.adults > lim.adultsMax) state.adults = lim.adultsMax;
      }
      if (childrenInput) {
        childrenInput.dataset.max = String(lim.childrenMax);
        if (state.children > lim.childrenMax) state.children = lim.childrenMax;
      }
      refreshCounters();
      fetchBusyDates(state.cabin);
      renderCalendars();
      renderExtraGuests();
      updateSummary();
    });

    /* ---------- Calendars ---------- */
    const calShell = $("[data-booking-calendar]", root);
    const MONTH_NAMES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
    const WEEKDAYS = ["lun","mar","mié","jue","vie","sáb","dom"];

    function fetchBusyDates(cabin) {
      if (!cabin || state.busy[cabin]) { renderCalendars(); return; }
      state.busy[cabin] = new Set();
      const url = `api/availability.php?cabin=${encodeURIComponent(cabin)}`;
      fetch(url, { cache: "no-store" })
        .then(r => r.ok ? r.json() : null)
        .then(json => {
          if (!json) return;
          if (Array.isArray(json.busy)) {
            state.busy[cabin] = new Set(json.busy);
            renderCalendars();
          }
        })
        .catch(() => { });
    }

    function renderCalendars() {
      calShell.innerHTML = "";
      const today = new Date(); today.setHours(0,0,0,0);
      for (let i = 0; i < 2; i++) {
        const month = new Date(today.getFullYear(), today.getMonth() + state.monthOffset + i, 1);
        calShell.appendChild(buildMonth(month, i === 0));
      }
    }

    function buildMonth(monthDate, withNav) {
      const today = new Date(); today.setHours(0,0,0,0);
      const wrap = document.createElement("div");
      wrap.className = "booking-calendar";
      const monthLabel = MONTH_NAMES[monthDate.getMonth()] + " " + monthDate.getFullYear();
      wrap.innerHTML = `
        <div class="booking-calendar-head">
          <span class="booking-calendar-title">${monthLabel}</span>
          ${withNav ? `
          <div class="booking-calendar-nav">
            <button type="button" class="booking-cal-btn" data-cal-nav="-1" aria-label="Mes anterior" ${state.monthOffset <= 0 ? "disabled" : ""}>‹</button>
            <button type="button" class="booking-cal-btn" data-cal-nav="1" aria-label="Mes siguiente">›</button>
          </div>` : ""}
        </div>
        <div class="booking-calendar-grid">
          ${WEEKDAYS.map(d => `<span class="booking-cal-weekday">${d}</span>`).join("")}
        </div>
      `;
      const grid = $(".booking-calendar-grid", wrap);
      const firstDow = (monthDate.getDay() + 6) % 7;
      const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
      for (let i = 0; i < firstDow; i++) {
        const empty = document.createElement("span");
        empty.className = "booking-cal-day is-out";
        grid.appendChild(empty);
      }
      const busySet = state.busy[state.cabin] || new Set();
      for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(monthDate.getFullYear(), monthDate.getMonth(), d);
        const k = ymd(date);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "booking-cal-day";
        btn.textContent = d;
        btn.dataset.date = k;
        if (isWeekendNight(date)) btn.classList.add("is-weekend");
        if (date < today) btn.classList.add("is-past", "is-disabled");
        if (date.getTime() === today.getTime()) btn.classList.add("is-today");
        if (state.cabin && busySet.has(k)) btn.classList.add("is-busy", "is-disabled");
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
      $$("[data-cal-nav]", wrap).forEach(b => {
        b.addEventListener("click", () => {
          state.monthOffset += parseInt(b.dataset.calNav, 10);
          if (state.monthOffset < 0) state.monthOffset = 0;
          renderCalendars();
        });
      });
      return wrap;
    }

    function onPickDay(date) {
      if (!state.cabin) {
        alert("Primero selecciona una cabaña, por favor.");
        return;
      }
      const busySet = state.busy[state.cabin] || new Set();

      if (!state.start || (state.start && state.end)) {
        // Seleccionando check-in: fecha ocupada = NO (no se puede dormir esa noche)
        if (busySet.has(ymd(date))) return;
        state.start = date;
        state.end = null;
      } else {
        if (date.getTime() === state.start.getTime()) {
          state.start = null; state.end = null;
        } else if (date < state.start) {
          // Nuevo check-in anterior: también verificar
          if (busySet.has(ymd(date))) return;
          state.start = date; state.end = null;
        } else {
          // Seleccionando check-out: verificar todas las noches [start, end)
          // (end = día de salida, no se duerme esa noche → se permite aunque esté ocupada)
          let blocked = false;
          const cur = new Date(state.start);
          while (cur < date) {
            if (busySet.has(ymd(cur))) { blocked = true; break; }
            cur.setDate(cur.getDate() + 1);
          }
          if (blocked) {
            alert("El rango incluye fechas ocupadas. Por favor selecciona otro intervalo.");
            return;
          }
          state.end = date;
        }
      }
      renderCalendars();
      updateSummary();
    }

    /* ---------- Counters ---------- */
    const counterDefs = $$("[data-counter]", root);
    function refreshCounters() {
      counterDefs.forEach(group => {
        const key = group.dataset.counter;
        const val = $(".val", group);
        const dec = $("[data-counter-dec]", group);
        const inc = $("[data-counter-inc]", group);
        const min = parseInt(group.dataset.min || "0", 10);
        const max = parseInt(group.dataset.max || (key === "adults" ? "3" : "2"), 10);
        val.textContent = state[key];
        dec.disabled = state[key] <= min;
        inc.disabled = state[key] >= max;
      });
    }
    /* ── Huéspedes adicionales ─────────────────────────────── */
    function renderExtraGuests() {
      const wrap = document.getElementById("extra-guests-wrap");
      const list = document.getElementById("extra-guests-list");
      if (!wrap || !list) return;
      const totalExtra = (state.adults - 1) + state.children;
      if (totalExtra <= 0) { wrap.style.display = "none"; return; }
      wrap.style.display = "";
      list.innerHTML = "";
      let idx = 1;
      for (let i = 1; i < state.adults; i++, idx++) {
        list.appendChild(makeGuestRow(idx, "Adulto " + (i + 1), true));
      }
      for (let i = 0; i < state.children; i++, idx++) {
        list.appendChild(makeGuestRow(idx, "Menor " + (i + 1), false));
      }
    }
    function makeGuestRow(idx, label, requireDoc) {
      const d = document.createElement("div");
      d.className = "extra-guest-row";
      d.innerHTML =
        `<p class="extra-guest-label">${label}</p>` +
        `<div class="booking-fields-row booking-fields-guest">` +
          `<div class="booking-field">` +
            `<label>Nombre completo *</label>` +
            `<input type="text" id="eg-name-${idx}" placeholder="Nombre completo" />` +
          `</div>` +
          `<div class="booking-field">` +
            `<label>N.º de documento${requireDoc ? " *" : " (opcional)"}</label>` +
            `<input type="text" id="eg-doc-${idx}" placeholder="Número de cédula o pasaporte" />` +
          `</div>` +
          `<div class="booking-field">` +
            `<label>Email <span style="font-weight:400;color:var(--ink-faint);font-size:.78em">(opcional)</span></label>` +
            `<input type="email" id="eg-email-${idx}" placeholder="correo@ejemplo.com" />` +
          `</div>` +
        `</div>`;
      return d;
    }

    counterDefs.forEach(group => {
      const key = group.dataset.counter;
      const dec = $("[data-counter-dec]", group);
      const inc = $("[data-counter-inc]", group);
      const min = parseInt(group.dataset.min || "0", 10);
      const getMax = () => parseInt(group.dataset.max || (key === "adults" ? "3" : "2"), 10);
      dec.addEventListener("click", () => { if (state[key] > min) { state[key]--; refreshCounters(); renderExtraGuests(); updateSummary(); }});
      inc.addEventListener("click", () => { if (state[key] < getMax()) { state[key]++; refreshCounters(); renderExtraGuests(); updateSummary(); }});
    });
    refreshCounters();
    renderExtraGuests();

    const petsToggle = $("[data-pets]", root);
    if (petsToggle) {
      petsToggle.addEventListener("change", () => {
        state.pets = petsToggle.checked;
        updateSummary();
      });
    }

    const termsToggle = $("[data-terms]", root);
    if (termsToggle) {
      termsToggle.addEventListener("change", () => {
        updateSummary();
      });
    }

    let _discountTimer = null;
    ["name", "cedula", "email", "phone", "message", "discountRef", "discount"].forEach(k => {
      const inp = $(`[data-field='${k}']`, root);
      if (!inp) return;
      inp.addEventListener("input", () => {
        if (k === "discount") {
          const code = inp.value.toUpperCase().trim();
          const msg  = $("[id='discount-message']", root);
          const wrap = document.getElementById("discount-ref-wrap");
          // Reset state y Bold mount (precio puede cambiar)
          state.discountPercentage = 0; state.discountData = null; state.discount = "";
          if (wrap) wrap.style.display = "none";
          resetBoldMount();
          if (!code) { if (msg) msg.textContent = ""; updateSummary(); return; }
          if (msg) msg.textContent = "…";
          clearTimeout(_discountTimer);
          _discountTimer = setTimeout(async () => {
            if (inp.value.toUpperCase().trim() !== code) return; // cambió mientras esperaba
            try {
              const res = await fetch("api/discount-check.php", {
                method: "POST", headers: {"Content-Type":"application/json"},
                body: JSON.stringify({code})
              });
              const d = await res.json();
              if (inp.value.toUpperCase().trim() !== code) return;
              if (d.valid) {
                state.discount = code;
                if (msg) { msg.textContent = d.message; msg.style.color = "var(--accent-2)"; }
                if (d.type === "pct" && d.pct)           state.discountPercentage = d.pct;
                else if (d.type === "second_night")       state.discountData = {type:"second_night", active:true};
                else if (d.type === "weekday_2x1")        state.discountData = {type:"weekday_2x1",  active:true};
                if (wrap && d.requiresRef) {
                  const lbl = document.getElementById("discount-ref-label");
                  if (lbl) lbl.textContent = (d.refLabel || "Empresa") + " *";
                  wrap.style.display = "";
                }
              } else {
                if (msg) { msg.textContent = d.message || "✗ Código no válido"; msg.style.color = "var(--accent)"; }
              }
            } catch(_) {
              if (msg) { msg.textContent = "✗ Error validando"; msg.style.color = "var(--accent)"; }
            }
            updateSummary();
          }, 500);
        } else {
          state[k] = inp.value;
          updateSummary();
        }
      });
    });

    /* ---------- Summary & submit ---------- */
    const summary = $("[data-booking-summary]", root);
    const submitBtn = $("[data-booking-submit]", root);
    const submitNote = $("[data-booking-note]", root);

    function computeTotal() {
      const cabinObj = allCabinsForBooking.find(c => c.id === state.cabin);
      if (!cabinObj || !state.start || !state.end) return { nights: 0, total: null, semNights: 0, finNights: 0 };
      const { semana: semN, finde: finN, semanaSeason: semSeason, findeSeason: finSeason } = splitNights(state.start, state.end);
      const nights = semN + finN + semSeason + finSeason;
      const price = cabinObj.price;
      if (!price || price.semana == null || price.finde == null) {
        return { nights, total: null, semNights: semN, finNights: finN, priceMissing: true };
      }

      // Noches temporada alta: tarifa plana (campo 'temporada' en manifest)
      const rateTemporada  = price.temporada ?? Math.round(price.finde * 1.30);
      const highSeasonNights = semSeason + finSeason;
      let subtotal = semN * price.semana + finN * price.finde +
                     highSeasonNights * rateTemporada;

      // Descuento especial por tipo (SEGUNDA50 / SEMANA2X1)
      let specialDiscountAmt = 0;
      if (state.discountData?.active) {
        if (state.discountData.type === "second_night" && nights >= 2) {
          specialDiscountAmt = Math.round(subtotal / nights * 0.5);
        } else if (state.discountData.type === "weekday_2x1" && semN >= 2) {
          specialDiscountAmt = price.semana;
        }
      }

      // Auto-descuento por duración
      let autoDiscount = 0;
      if (nights >= 7) autoDiscount = 15;
      else if (nights >= 4) autoDiscount = 10;

      // Elegir el mayor descuento (porcentaje vs. especial en pesos)
      const effectiveDiscount = Math.max(state.discountPercentage, autoDiscount);
      const pctDiscountAmt    = effectiveDiscount > 0 ? (subtotal * effectiveDiscount) / 100 : 0;
      const discountAmount    = Math.max(pctDiscountAmt, specialDiscountAmt);
      const afterDiscount = subtotal - discountAmount;

      // Añadir 5% de comisión Bold
      const boldFee = afterDiscount * 0.05;
      const finalTotal = afterDiscount + boldFee;

      return {
        nights,
        total: finalTotal,
        semNights: semN,
        finNights: finN,
        discount: discountAmount,
        discountPercent: effectiveDiscount,
        boldFee,
        originalTotal: subtotal,
        subtotalAfterDiscount: afterDiscount,
        hasHighSeason: (semSeason + finSeason) > 0,
        highSeasonNights: semSeason + finSeason
      };
    }

    function updateSummary() {
      if (!summary) return;
      const cabinObj = allCabinsForBooking.find(c => c.id === state.cabin);
      const { nights, total, semNights, finNights, highSeasonNights, priceMissing, discount, discountPercent, boldFee, originalTotal, subtotalAfterDiscount } = computeTotal();

      const rows = [];
      rows.push(["Cabaña", cabinObj ? cabinObj.nombre : "—"]);
      rows.push(["Llegada", state.start ? state.start.toLocaleDateString("es-CO", { day:"numeric", month:"long", year:"numeric" }) : "—"]);
      rows.push(["Salida", state.end ? state.end.toLocaleDateString("es-CO", { day:"numeric", month:"long", year:"numeric" }) : "—"]);
      if (nights > 0) {
        const desglose = [];
        if (semNights > 0)       desglose.push(`${semNights} L–J`);
        if (finNights > 0)       desglose.push(`${finNights} V–D`);
        if (highSeasonNights > 0) desglose.push(`${highSeasonNights} T.Alta`);
        rows.push(["Noches", `${nights} (${desglose.join(", ")})`]);
      } else {
        rows.push(["Noches", "—"]);
      }
      rows.push(["Huéspedes", `${state.adults} adulto${state.adults === 1 ? "" : "s"}${state.children > 0 ? `, ${state.children} niño${state.children === 1 ? "" : "s"}` : ""}${state.pets ? " · mascota" : ""}`]);

      let discountRow = "";
      if (originalTotal != null && discount > 0) {
        discountRow = `<div class="booking-summary-row" style="color: var(--accent); font-weight: 500;">
          <span class="booking-summary-label">Descuento (${discountPercent}%)</span>
          <span class="booking-summary-value">-${fmtCOP(discount)}</span>
        </div>`;
      }

      let feeRow = "";
      if (subtotalAfterDiscount != null && boldFee > 0) {
        feeRow = `<div class="booking-summary-row" style="color: var(--ink-soft); font-size: 0.9rem;">
          <span class="booking-summary-label">Comisión Bold (5%)</span>
          <span class="booking-summary-value">+${fmtCOP(boldFee)}</span>
        </div>`;
      }

      let totalLabel = "Total estimado";
      let totalValue = "A confirmar";
      if (total != null) totalValue = fmtCOP(total) + " COP";
      else if (priceMissing) totalValue = "Consultar";

      summary.innerHTML = `
        ${rows.map(([l, v]) => `
          <div class="booking-summary-row">
            <span class="booking-summary-label">${escHTML(l)}</span>
            <span class="booking-summary-value">${escHTML(String(v))}</span>
          </div>
        `).join("")}
        ${discountRow}
        ${feeRow}
        <div class="booking-summary-total">
          <span class="booking-summary-label">${totalLabel}</span>
          <span class="booking-summary-value">${totalValue}</span>
        </div>
      `;

      if (submitBtn) {
        const termsChecked = termsToggle && termsToggle.checked;
        const ready = state.cabin && state.start && state.end && state.adults >= 1 && total != null && termsChecked;
        submitBtn.classList.toggle('is-not-ready', !ready);
        if (submitNote) {
          submitNote.style.color = "";
          if (!state.cabin) {
            submitNote.textContent = "Selecciona una cabaña para continuar.";
          } else if (!state.start || !state.end) {
            submitNote.textContent = "Selecciona fechas de llegada y salida.";
          } else if (priceMissing) {
            submitNote.textContent = "Esta opción aún no tiene tarifa pública. Te pediremos confirmar por otro canal.";
          } else if (!termsChecked) {
            submitNote.textContent = "⚠️ Debes aceptar las políticas de reserva para continuar.";
            submitNote.style.color = "var(--accent)";
          } else {
            submitNote.textContent = "Al hacer clic serás redirigido al checkout seguro de Bold. Tu reserva queda confirmada en cuanto el pago se acredita.";
          }
        }
      }
    }

    if (submitBtn) {
      submitBtn.addEventListener("click", e => {
        e.preventDefault();
        // Si no está listo, hacer visible el aviso del motivo
        if (submitBtn.classList.contains('is-not-ready')) {
          if (submitNote) {
            submitNote.style.fontWeight = "700";
            setTimeout(() => { submitNote.style.fontWeight = ""; }, 2500);
            submitNote.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }
          return;
        }
        // Validar campos del titular
        const missing = [];
        if (!state.name.trim())   missing.push("Nombre completo");
        if (!state.cedula.trim()) missing.push("Número de documento");
        if (!state.phone.trim())  missing.push("Teléfono");
        if (!state.email.trim())  missing.push("Email");
        // Validar referencia de empresa si el código lo requiere
        const _refWrap = document.getElementById("discount-ref-wrap");
        const _refInp  = document.getElementById("discount-ref");
        if (_refWrap && _refWrap.style.display !== "none" && _refInp && !_refInp.value.trim()) {
          missing.push("Nombre de empresa (requerido por el código de descuento)");
        }
        if (missing.length) {
          if (submitNote) {
            submitNote.textContent = "⚠️ Completa: " + missing.join(", ");
            submitNote.style.color = "var(--accent)";
            submitNote.style.fontWeight = "700";
            submitNote.scrollIntoView({ behavior: "smooth", block: "nearest" });
            setTimeout(() => { submitNote.style.fontWeight = ""; submitNote.style.color = ""; }, 3000);
          }
          const ids = { "Nombre completo": "name", "Número de documento": "cedula", "Teléfono": "phone", "Email": "email" };
          missing.forEach(f => { const el = document.getElementById(ids[f]); if (el) { el.style.outline = "2px solid var(--accent)"; setTimeout(() => { el.style.outline = ""; }, 3000); el.focus(); } });
          if (_refWrap && _refWrap.style.display !== "none" && _refInp && !_refInp.value.trim()) {
            _refInp.style.outline = "2px solid var(--accent)";
            setTimeout(() => { _refInp.style.outline = ""; }, 3000);
            _refInp.focus();
          }
          return;
        }
        const cabinObj = allCabinsForBooking.find(c => c.id === state.cabin);
        const { nights, total, semNights, finNights } = computeTotal();
        if (total == null) return;

        const payload = {
          cabin: state.cabin,
          cabinName: cabinObj.nombre,
          start: ymd(state.start),
          end: ymd(state.end),
          nights, semNights, finNights,
          adults: state.adults,
          children: state.children,
          pets: state.pets,
          name: state.name,
          cedula: state.cedula,
          email: state.email,
          phone: state.phone,
          message: state.message,
          discount: state.discount,
          discountPercentage: state.discountPercentage,
          amount: total,
          currency: "COP",
          discountRef: (document.getElementById("discount-ref") || {}).value?.trim() || "",
          guests: (function() {
            const g = []; let gi = 1;
            for (let i = 1; i < state.adults; i++, gi++) {
              const n = document.getElementById("eg-name-" + gi);
              const d = document.getElementById("eg-doc-" + gi);
              const e = document.getElementById("eg-email-" + gi);
              g.push({ type: "adult", name: n?.value.trim() || "", cedula: d?.value.trim() || "", email: e?.value.trim() || "" });
            }
            for (let i = 0; i < state.children; i++, gi++) {
              const n = document.getElementById("eg-name-" + gi);
              const d = document.getElementById("eg-doc-" + gi);
              const e = document.getElementById("eg-email-" + gi);
              g.push({ type: "child", name: n?.value.trim() || "", cedula: d?.value.trim() || "", email: e?.value.trim() || "" });
            }
            return g;
          })()
        };

        /* Save payload in sessionStorage so el flujo Bold lo recupere */
        try { sessionStorage.setItem("clc_pending", JSON.stringify(payload)); } catch(_) {}

        submitBtn.disabled = true;
        submitBtn.classList.add("is-loading");
        submitBtn.textContent = "Verificando disponibilidad…";

        // Re-fetch fresco de disponibilidad antes de enviar al servidor
        // (invalida caché local en caso de que otra reserva llegara mientras tanto)
        state.busy[state.cabin] = null;

        fetch("api/bold-checkout.php", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        })
          .then(r => r.json())
          .then(json => {
            if (!json || !json.ok) {
              // Si es conflicto de fechas, refrescar calendario y mostrar mensaje claro
              if (json && json.code === 'DATES_CONFLICT') {
                fetchBusyDates(state.cabin); // re-renderiza el calendario con fechas actualizadas
                state.start = null;
                state.end = null;
                renderCalendars();
                updateSummary();
              }
              throw new Error(json && json.error ? json.error : "checkout no disponible");
            }
            submitBtn.textContent = "Preparando pago seguro…";
            // Guardar orderId en sessionStorage para que gracias.html pueda confirmar
            try {
              const pending = JSON.parse(sessionStorage.getItem("clc_pending") || "{}");
              pending.orderId = json.orderId;
              sessionStorage.setItem("clc_pending", JSON.stringify(pending));
            } catch(_) {}
            renderBoldButton(json, payload);
          })
          .catch(err => {
            submitBtn.disabled = false;
            submitBtn.classList.remove("is-loading");
            submitBtn.textContent = "Pagar con Bold";
            alert(
              "No fue posible iniciar el pago en línea ahora mismo.\n\n" +
              "Detalle: " + (err.message || err) + "\n\n" +
              "Puedes intentar de nuevo o escribirnos por WhatsApp para confirmar tu reserva manualmente."
            );
          });
      });
    }

    /* Reinicia el checkout Bold si ya estaba montado (precio cambió) */
    function resetBoldMount() {
      const host = $("[data-bold-mount]", root);
      if (!host || !host.innerHTML.trim()) return;
      host.innerHTML = "";
      submitBtn.disabled = false;
      submitBtn.classList.remove("is-loading");
      submitBtn.textContent = "Proceder al pago →";
      submitBtn.style.display = "";
      if (submitNote) submitNote.textContent = "El precio cambió — haz clic de nuevo para continuar.";
    }

    function renderBoldButton(checkout, payload) {
      const note = $("[data-booking-note]", root);
      const host = $("[data-bold-mount]", root);
      if (!host) return;

      host.innerHTML = `
        <div class="bold-mount-inner">
          <p class="bold-mount-title">Tu reserva quedó pendiente de pago</p>
          <p class="bold-mount-sub">
            ${escHTML(payload.cabinName)} ·
            ${escHTML(payload.start)} → ${escHTML(payload.end)} ·
            ${payload.nights} noches · <strong>${fmtCOP(payload.amount)} COP</strong>
          </p>
          <div id="bold-button-host"></div>
          <p class="bold-mount-foot">
            Pago seguro procesado por Bold. La reserva se confirma automáticamente al acreditarse el pago.
          </p>
        </div>
      `;

      const btn = document.createElement("script");
      btn.setAttribute("data-bold-button", "");
      btn.setAttribute("data-order-id", checkout.orderId);
      btn.setAttribute("data-currency", checkout.currency || "COP");
      btn.setAttribute("data-amount", String(checkout.amount));
      btn.setAttribute("data-api-key", checkout.publicKey);
      btn.setAttribute("data-integrity-signature", checkout.integritySignature);
      btn.setAttribute("data-description", checkout.description || "Reserva Casa Los Curazaos");
      if (checkout.redirectionUrl) btn.setAttribute("data-redirection-url", checkout.redirectionUrl);
      btn.src = "https://checkout.bold.co/library/boldPaymentButton.js";
      $("#bold-button-host", host).appendChild(btn);

      submitBtn.style.display = "none";
      if (note) note.textContent = "Haz clic en el botón naranja para abrir el checkout de Bold.";

      host.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    renderCalendars();
    updateSummary();
  }

  /* ---------- 10. Year & WhatsApp ---------------------------- */
  function initYear() {
    $$("[data-year]").forEach(el => { el.textContent = new Date().getFullYear(); });
  }
  function initWaLinks() {
    if (!data.whatsapp || !data.whatsapp.link) return;
    $$("[data-wa-link]").forEach(a => {
      const msg = a.dataset.waMessage || "Hola, me gustaría más información sobre Casa Los Curazaos.";
      a.href = `${data.whatsapp.link}?text=${encodeURIComponent(msg)}`;
      a.setAttribute("rel", "noopener");
      a.setAttribute("target", "_blank");
    });
  }

  /* ---------- Boot all -------------------------------------- */
  function boot() {
    safe(initSplash,       "initSplash");
    safe(initNav,          "initNav");
    safe(initReveals,      "initReveals");
    safe(initSmoothAnchors,"initSmoothAnchors");
    safe(initLightbox,     "initLightbox");
    safe(initCarousels,    "initCarousels");
    safe(initMarquee,      "initMarquee");
    safe(initBookingEngine,"initBookingEngine");
    safe(initYear,         "initYear");
    safe(initWaLinks,      "initWaLinks");

    if (window.gsap && window.ScrollTrigger) {
      try { gsap.registerPlugin(ScrollTrigger); } catch (_) {}
      safe(initHeroParallax, "initHeroParallax");
    }

    document.documentElement.classList.add("is-ready");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
