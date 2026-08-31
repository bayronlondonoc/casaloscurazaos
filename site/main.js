/* Casa Los Curazaos — runtime principal.
   IIFE clásica, sin import/export.  */
(function () {
  "use strict";

  const data = window.__BRAND__ || {};

  /* ---------- Helpers --------------------------------------- */
  const $  = (sel, scope) => (scope || document).querySelector(sel);
  const $$ = (sel, scope) => Array.from((scope || document).querySelectorAll(sel));
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  function safe(fn, name) {
    try { fn(); } catch (e) { console.warn("[" + name + "]", e); }
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

    /* URLs limpias: /beneficios en vez de beneficios.html. Normalizamos
       ambos lados para que el link activo siga funcionando. */
    const slug = u => (u || "").split("#")[0].split("/").pop().replace(/\.html$/, "") || "inicio";
    const path = slug(location.pathname);
    $$(".nav-link, .nav-mobile-link").forEach(a => {
      if (slug(a.getAttribute("href")) === path) a.classList.add("is-active");
    });
  }

  /* ---------- 2b. /cabanas ---------------------------------- */
  /* La sección de cabañas vive en la home, pero se sirve y se muestra
     como /cabanas para no exponer index.html#cabanas en la barra. */
  function initCabanasRoute() {
    const target = document.getElementById("cabanas");
    if (!target) return;

    /* Mismo offset que los anclas normales: el nav es fijo y taparía
       el título de la sección. */
    const navOffset = 90;
    const goto = behavior => window.scrollTo({
      top: target.getBoundingClientRect().top + scrollY - navOffset,
      behavior
    });

    /* En carga directa reposicionamos dos veces: una al montar y otra
       en "load", porque las imágenes de arriba cambian la altura del
       documento y dejarían el scroll desfasado. */
    if (location.pathname === "/cabanas") {
      requestAnimationFrame(() => goto("auto"));
      if (document.readyState !== "complete") {
        window.addEventListener("load", () => goto("auto"), { once: true });
      }
    }

    document.addEventListener("click", e => {
      const a = e.target.closest('a[href="/cabanas"]');
      if (!a) return;
      e.preventDefault();
      history.replaceState(null, "", "/cabanas");
      goto(reduced ? "auto" : "smooth");
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


  /* ---------- 9. Year & WhatsApp ----------------------------- */
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
    safe(initCabanasRoute, "initCabanasRoute");
    safe(initReveals,      "initReveals");
    safe(initSmoothAnchors,"initSmoothAnchors");
    safe(initLightbox,     "initLightbox");
    safe(initCarousels,    "initCarousels");
    safe(initMarquee,      "initMarquee");
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
