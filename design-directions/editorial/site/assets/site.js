/* bcns site draft: shared foundation. Exposes window.bcns (see README.md). Vanilla, no deps. */
(function () {
  "use strict";
  var root = document.documentElement, NS = "http://www.w3.org/2000/svg";
  var KEY = "bcns-site-theme";
  var clamp = function (x, a, b) { return Math.min(b === undefined ? 1 : b, Math.max(a === undefined ? 0 : a, x)); };
  var q = function (el, s) { return el.querySelector(s); };
  var qa = function (el, s) { return [].slice.call(el.querySelectorAll(s)); };
  var reduce = function () { return matchMedia("(prefers-reduced-motion: reduce)").matches; };
  var page = (location.pathname.split("/").pop() || "index.html").replace(/\.html$/, "");

  /* ---------- shared data ---------- */
  var TOOLS = { shopify: "#5f8f62", square: "#7b6cc4", quickbooks: "#4f978f", calendar: "#c08a3e", gmail: "#c0625a" };
  var PILLARS = [
    { n: "01", label: "Get organized", name: "bcns Connect", line: "Every tool you use, connected in one organized place.", price: "$200 a month", href: "services-connect.html" },
    { n: "02", label: "Put it to work", name: "Deluxe builds", line: "An AI agent, an app or a dashboard, built on top of Connect around how you work.", price: "From $5,000 setup", href: "services-deluxe.html" },
    { n: "03", label: "Learn to optimize", name: "AI consulting", line: "One day on your business: where AI actually helps, built with you, and your team using it.", price: "$1,000 a day", href: "services-ai.html" }
  ];

  /* the logo: three isometric cubes. stroke follows the theme (--cs) */
  function logoSvg(cls) {
    return '<svg class="' + (cls || "") + '" viewBox="44 -10.5 132 133.5" aria-hidden="true" focusable="false"><g stroke="var(--cs)" stroke-width="2.5" stroke-linejoin="round">' +
      '<g><path d="M110 -8.5 L142 10 L110 28.5 L78 10 Z" fill="#C7DDFA"/><path d="M78 10 L110 28.5 L110 65.5 L78 47 Z" fill="#7EB3F7"/><path d="M110 28.5 L142 10 L142 47 L110 65.5 Z" fill="#4A86D7"/></g>' +
      '<g><path d="M78 47 L110 65.5 L78 84 L46 65.5 Z" fill="#C7DDFA"/><path d="M46 65.5 L78 84 L78 121 L46 102.5 Z" fill="#7EB3F7"/><path d="M78 84 L110 65.5 L110 102.5 L78 121 Z" fill="#4A86D7"/></g>' +
      '<g><path d="M142 47 L174 65.5 L142 84 L110 65.5 Z" fill="#C7DDFA"/><path d="M110 65.5 L142 84 L142 121 L110 102.5 Z" fill="#7EB3F7"/><path d="M142 84 L174 65.5 L174 102.5 L142 121 Z" fill="#4A86D7"/></g></g></svg>';
  }

  /* ---------- header + footer ---------- */
  var SUN = '<svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>' +
    '<svg class="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';
  var SVC = [
    ["services", "Overview", "Three ways we help your business"],
    ["services-connect", "bcns Connect", "Every tool in one organized place"],
    ["services-deluxe", "Deluxe builds", "An agent, app or dashboard on top"],
    ["services-ai", "AI consulting", "One day on your business"]
  ];
  var onServices = /^services(-|$)/.test(page);
  function cur(key) { return page === key ? ' aria-current="page"' : ""; }

  function headerHtml() {
    return '<header class="site-header" id="site-header"><div class="top-in">' +
      '<a class="logo" href="index.html" aria-label="bcns home">' + logoSvg() + '<span>bcns</span></a>' +
      '<div class="site-menu" id="site-menu"><nav class="site-nav" aria-label="Primary">' +
      '<div class="dd' + (onServices ? " is-current" : "") + '" id="dd"><button class="ddb" id="ddb" type="button" aria-haspopup="true" aria-controls="ddm">Services ' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>' +
      '<div class="ddm" id="ddm">' + SVC.map(function (s) { return '<a href="' + s[0] + '.html"' + cur(s[0]) + "><b>" + s[1] + "</b><span>" + s[2] + "</span></a>"; }).join("") + "</div></div>" +
      '<a href="work.html"' + cur("work") + '>Work</a><a href="pricing.html"' + cur("pricing") + '>Pricing</a><a href="about.html"' + cur("about") + ">About</a></nav>" +
      '<div class="site-tools"><a class="btn-outline btn-sm" href="connect-login.html">Sign in to Connect</a><a class="btn-primary btn-sm" href="index.html#contact">Book a free consult</a></div></div>' +
      '<button class="theme" type="button" aria-label="Toggle light and dark mode">' + SUN + "</button>" +
      '<button class="burger" id="burger" type="button" aria-label="Menu" aria-expanded="false" aria-controls="site-menu">' +
      '<svg class="b3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>' +
      '<svg class="x" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div></header>';
  }
  function footerHtml() {
    var L = [["services.html", "Services"], ["services-connect.html", "bcns Connect"], ["services-deluxe.html", "Deluxe builds"], ["services-ai.html", "AI consulting"],
      ["work.html", "Work"], ["pricing.html", "Pricing"], ["about.html", "About"], ["connect-login.html", "Sign in to Connect"], ["index.html#contact", "Book a free consult"],
      ["mailto:nseluga@bcn-services.com", "nseluga@bcn-services.com"]];
    return '<footer class="gut site-footer"><div><a href="index.html" class="wm">bcns</a><p class="tag">Your small business, connected and ready for AI.</p></div>' +
      "<ul>" + L.map(function (l) { return '<li><a href="' + l[0] + '">' + l[1] + "</a></li>"; }).join("") + "</ul>" +
      "<small>&copy; 2026 bcns. Prototype draft.</small></footer>";
  }

  function setTheme(t) { root.setAttribute("data-theme", t); try { localStorage.setItem(KEY, t); } catch (e) {} }
  function initChrome() {
    var h = q(document, "[data-site-header]"), f = q(document, "[data-site-footer]");
    if (h) h.outerHTML = headerHtml();
    if (f) f.outerHTML = footerHtml();
    qa(document, ".theme").forEach(function (b) {
      b.addEventListener("click", function () { setTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark"); });
    });
    var bar = q(document, "#site-header"); if (!bar) return;
    var burger = q(bar, "#burger"), dd = q(bar, "#dd"), ddb = q(bar, "#ddb"), desk = matchMedia("(min-width: 1024px)");
    function menu(o) { bar.classList.toggle("open", o); burger.setAttribute("aria-expanded", String(o)); }
    function setDD(o) { dd.classList.toggle("open", o); if (desk.matches) ddb.setAttribute("aria-expanded", String(o)); }
    function sync() { if (desk.matches) { ddb.setAttribute("aria-expanded", "false"); menu(false); } else { ddb.removeAttribute("aria-expanded"); dd.classList.remove("open"); } }
    burger.addEventListener("click", function () { menu(!bar.classList.contains("open")); });
    ddb.addEventListener("click", function () { setDD(!dd.classList.contains("open")); });
    document.addEventListener("click", function (e) { if (!dd.contains(e.target)) setDD(false); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") { setDD(false); menu(false); } });
    qa(bar, "#site-menu a").forEach(function (a) { a.addEventListener("click", function () { menu(false); }); });
    sync(); if (desk.addEventListener) desk.addEventListener("change", sync);
  }

  /* ---------- pinStage ---------- */
  /* Markup contract (see _template.html): section.stage-section containing
       .stage-track > .stage-pin > .stage-panel > (.stage-dia, .stage-caps, nav.stage-rail)   (pinned, >=1024px)
       ol.stage-stack > li.stage-step > (.steplabel, h2, p.l, .stage-fig)                        (stacked, everything else)
     .stage-caps and .stage-rail are filled from the .stage-step copy when left empty. */
  function pinStage(sec, n, onStep) {
    sec.classList.add("stage"); sec.style.setProperty("--steps", n);
    var track = q(sec, ".stage-track"), pin = q(sec, ".stage-pin"), dia = q(sec, ".stage-dia"), caps = q(sec, ".stage-caps"), rail = q(sec, ".stage-rail");
    var steps = qa(sec, ".stage-step"), figs = steps.map(function (s) { return q(s, ".stage-fig"); });
    if (caps && !caps.children.length) steps.forEach(function (s, i) {
      var c = document.createElement("div"); c.className = "stage-cap" + (i ? "" : " on");
      c.innerHTML = q(s, ".steplabel").outerHTML + q(s, "h2").outerHTML + (q(s, "p.l") ? q(s, "p.l").outerHTML : "");
      caps.appendChild(c);
    });
    if (rail && !rail.children.length) steps.forEach(function (s, i) {
      var b = document.createElement("button"); b.type = "button";
      b.setAttribute("aria-label", "Go to step " + (i + 1) + ": " + q(s, "h2").textContent.trim());
      b.innerHTML = '<span class="n">0' + (i + 1) + '</span><span class="b"><i></i></span>'; rail.appendChild(b);
    });
    var capEls = caps ? qa(caps, ".stage-cap") : [], rls = rail ? qa(rail, "button") : [];
    var mq = matchMedia("(min-width: 1024px) and (prefers-reduced-motion: no-preference)"), pinned = false, lastStep = -1, lastP = -1;

    function pinTop() { return parseFloat(getComputedStyle(pin).top) || 0; }
    function range() { return Math.max(track.offsetHeight - pin.offsetHeight, 1); }
    function paintStacked() {
      steps.forEach(function (s, i) { var f = figs[i]; if (f && f.clientWidth > 0) onStep(i, 1, f); });
    }
    function paintPinned(force) {
      var f = clamp((pinTop() - track.getBoundingClientRect().top) / range()), P = f * n, step = Math.min(n - 1, Math.floor(P)), p = clamp(P - step);
      capEls.forEach(function (c, i) { c.classList.toggle("on", i === step); });
      rls.forEach(function (b, i) {
        b.classList.toggle("on", i === step);
        if (i === step) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
        b.querySelector("i").style.setProperty("--f", clamp(P - i).toFixed(3));
      });
      if (force || step !== lastStep || Math.abs(p - lastP) > 0.002) { lastStep = step; lastP = p; onStep(step, p, dia); }
    }
    var ticking = false;
    function onScroll() { if (!pinned || ticking) return; ticking = true; requestAnimationFrame(function () { ticking = false; paintPinned(false); }); }
    function apply() {
      pinned = mq.matches && !!track && !!pin;
      sec.classList.toggle("pinned", pinned); sec.classList.toggle("stacked", !pinned);
      if (pinned) paintPinned(true); else paintStacked();
    }
    rls.forEach(function (b, i) {
      b.addEventListener("click", function () {
        var abs = track.getBoundingClientRect().top + window.scrollY;
        window.scrollTo({ top: abs - pinTop() + (i + 0.5) / n * range(), behavior: "smooth" });
      });
    });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", function () { if (pinned) paintPinned(true); });
    if (mq.addEventListener) mq.addEventListener("change", apply);
    if ("ResizeObserver" in window) {
      var seen = new Map();
      figs.forEach(function (f, i) { if (f) new ResizeObserver(function () {
        var w = Math.round(f.clientWidth); if (pinned || w < 100 || seen.get(f) === w) return; seen.set(f, w); onStep(i, 1, f);
      }).observe(f); });
      if (dia) new ResizeObserver(function () { if (pinned && dia.clientWidth > 100) paintPinned(true); }).observe(dia);
    }
    apply();
    return { refresh: apply, pinned: function () { return pinned; } };
  }

  /* ---------- flowDots ---------- */
  function flowDots(svg, path, color, o) {
    o = o || {};
    var n = o.n || 6, r = o.r || 3, period = o.period || 3.6, host = path.parentNode || svg, len = 0, vis = true, raf = 0, dead = false;
    var dots = [];
    for (var i = 0; i < n; i++) {
      var c = document.createElementNS(NS, "circle"); c.setAttribute("r", r); c.setAttribute("fill", color); host.appendChild(c); dots.push(c);
    }
    function place(t) {
      try { len = path.getTotalLength(); } catch (e) { len = 0; }
      if (!len) return;
      dots.forEach(function (c, k) {
        var u = ((t / period) + k / n) % 1, pt = path.getPointAtLength(u * len);
        c.setAttribute("cx", pt.x.toFixed(2)); c.setAttribute("cy", pt.y.toFixed(2));
        c.setAttribute("opacity", (Math.min(1, u / .1) * Math.min(1, (1 - u) / .14)).toFixed(3));
      });
    }
    function loop(now) { if (dead) return; if (vis) place(now / 1000); raf = requestAnimationFrame(loop); }
    var still = reduce();
    if (still) place(period * .3);
    else {
      raf = requestAnimationFrame(loop);
      if ("IntersectionObserver" in window) new IntersectionObserver(function (es) { vis = es[0].isIntersecting; }, { rootMargin: "80px" }).observe(svg);
    }
    return { destroy: function () { dead = true; cancelAnimationFrame(raf); dots.forEach(function (c) { c.remove(); }); }, refresh: function () { place(still ? period * .3 : performance.now() / 1000); } };
  }

  /* ---------- buildCube ---------- */
  var ICON = [
    '<path d="M7 9 L33 24"/><path d="M7 24 H33"/><path d="M7 39 L33 24"/><path d="M39 24 H44"/><circle class="solid" cx="6" cy="9" r="2.4" fill="#fff"/><circle class="solid" cx="6" cy="24" r="2.4" fill="#fff"/><circle class="solid" cx="6" cy="39" r="2.4" fill="#fff"/><circle class="solid" cx="36" cy="24" r="4.6" fill="#fff"/>',
    '<rect x="5" y="8" width="38" height="32" rx="4" pathLength="1"/><path d="M5 17 H43"/><path d="M12 27 H26"/><path d="M12 33 H21"/><rect x="30" y="25" width="7" height="9" rx="1.5" pathLength="1"/><circle class="solid" cx="10.5" cy="12.5" r="1.5" fill="#fff"/><circle class="solid" cx="15.5" cy="12.5" r="1.5" fill="#fff"/><circle class="solid" cx="20.5" cy="12.5" r="1.5" fill="#fff"/>',
    '<path d="M7 35 A17 17 0 0 1 41 35"/><path d="M7 35 H41"/><path d="M17.5 23 L15.6 19.6"/><path d="M24 20 V17"/><path d="M30.5 23 L32.4 19.6"/><path d="M24 35 L33 25"/><circle class="solid" cx="24" cy="35" r="3" fill="#fff"/>'
  ];
  var FACES = [
    { cls: "f-top", r: "rotateX(90deg)", c: "#C7DDFA", drop: "b" },
    { cls: "f-left", r: "rotateY(-90deg)", c: "#7EB3F7", drop: "tr" },
    { cls: "f-front", r: "rotateY(0deg)", c: "#4A86D7", drop: "" }
  ];
  /* top = 03, left = 01, right = 02 (logo order) */
  var CUBES = [
    { px: 0.5, py: 0.285714, tx: 0, ty: -1, pillar: 2 },
    { px: 0.25, py: 0.714286, tx: -0.866, ty: 0.5, pillar: 0 },
    { px: 0.75, py: 0.714286, tx: 0.866, ty: 0.5, pillar: 1 }
  ];
  function faceHtml(f, c) {
    var h = '<div class="cb-face ' + f.cls + '" style="--r:' + f.r + ";--c:" + f.c + '"><div class="fill"></div>';
    ["t", "r", "b", "l"].forEach(function (s) { if (f.drop.indexOf(s) < 0) h += '<i class="cb-edge ' + s + '"></i>'; });
    h += f.cls === "f-front" ? '<div class="cb-sheen"></div>' : '<div class="cb-shade"></div>';
    if (f.cls === "f-front") h += '<div class="cb-fc"><span class="num">0' + (c.pillar + 1) + '</span><svg class="ic" viewBox="0 0 48 48" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[c.pillar].replace(/<path /g, '<path pathLength="1" ') + "</svg></div>";
    return h + "</div>";
  }

  function buildCube(box, o) {
    o = o || {};
    var withCards = o.cards !== false, touch = matchMedia("(hover: none)").matches;
    var rm = reduce(), forced = o.forceOpen === true || /[?&]open=1\b/.test(location.search) || rm;
    box.classList.add("cb"); if (withCards) box.classList.add("has-cards"); if (rm) box.classList.add("rm");
    box.innerHTML = '<div class="cb-stack" role="button" tabindex="0" aria-expanded="false" aria-label="The three bcns cubes. Open to see our three services."><div class="cb-shadows"></div><div class="cb-layer"></div></div>' +
      '<p class="cb-hint" aria-hidden="true">' + (touch ? "Tap to open" : '<span class="h-hover">Hover to open</span><span class="h-tap">Tap to open</span>') + "</p>" +
      (withCards ? '<ul class="cb-cards">' + PILLARS.map(function (p, i) {
        return '<li style="--c:' + i + '"><a class="card cb-card" href="' + p.href + '"><p class="eyebrow">' + p.n + " &middot; " + p.label + '</p><h3>' + p.name + '</h3><p class="line">' + p.line +
          '</p><div class="foot"><span class="price">' + p.price + '</span><span class="more">Learn more <i>&rarr;</i></span></div></a></li>';
      }).join("") + "</ul>" : "");
    var stack = q(box, ".cb-stack"), layer = q(box, ".cb-layer"), shadows = q(box, ".cb-shadows"), lis = qa(box, ".cb-cards li");
    var cubeEls = [], shEls = [];
    CUBES.forEach(function (c) {
      var el = document.createElement("div"); el.className = "cb-cube"; el.style.setProperty("--i", c.pillar);
      el.innerHTML = '<div class="cb-travel"><div class="cb-glide"><div class="cb-rot">' + FACES.map(function (f) { return faceHtml(f, c); }).join("") + "</div></div></div>";
      layer.appendChild(el); cubeEls.push(el);
      var sh = document.createElement("i"); sh.className = "cb-sh"; sh.style.setProperty("--i", c.pillar); shadows.appendChild(sh); shEls.push(sh);
    });

    var wideMq = matchMedia("(min-width: 900px)");
    function layout() {
      var W = box.clientWidth, H = box.clientHeight, sr = box.getBoundingClientRect(), wide = wideMq.matches, phone = withCards && !wide;
      if (!W || !H) return;
      var Wc = withCards ? (wide ? Math.min(W * 0.46, 470) : Math.min(W * 0.62, 240)) : (wide ? Math.min(W * 0.4, 330) : Math.min(W * 0.62, 230));
      var Hc = Wc * 259 / 256, k = Wc / 128, E = 45.3157 * k, bw = 1.4 / 0.816497 * k;
      var cx = W / 2, top = phone ? 8 : Math.max(8, (H - (wide ? 60 : 56) - Hc) / 2);
      var Eo = withCards ? (wide ? 170 : Math.min(120, W / 3 * 0.8)) : Math.min(wide ? 150 : 100, W / 3 * 0.74), gs = Eo / E, T = 0.07 * Wc;
      box.style.setProperty("--E", E.toFixed(2) + "px"); box.style.setProperty("--bw", bw.toFixed(2) + "px");
      /* phone: the cubes get their own zone above the cards (closed = cluster, open = a row), so cards never sit under them */
      if (phone) { box.style.setProperty("--zc", (top + Hc + 48).toFixed(0) + "px"); box.style.setProperty("--zo", (Eo + 56).toFixed(0) + "px"); }
      CUBES.forEach(function (c, i) {
        var x0 = cx + (c.px - 0.5) * Wc, y0 = top + c.py * Hc, tx = c.tx * T, ty = c.ty * T, X, Y;
        if (withCards) {
          var r = lis[c.pillar].getBoundingClientRect();
          if (wide) { X = r.left - sr.left + r.width / 2; Y = 124; } else { X = W * (c.pillar + 0.5) / 3; Y = 16 + Eo / 2; }
        } else { X = W * (c.pillar + 0.5) / 3; Y = (H - 40) / 2; }
        var s = cubeEls[i].style;
        s.setProperty("--x0", x0.toFixed(1) + "px"); s.setProperty("--y0", y0.toFixed(1) + "px");
        s.setProperty("--tx", tx.toFixed(1) + "px"); s.setProperty("--ty", ty.toFixed(1) + "px");
        s.setProperty("--gx", (X - x0 - tx).toFixed(1) + "px"); s.setProperty("--gy", (Y - y0 - ty).toFixed(1) + "px"); s.setProperty("--gs", gs.toFixed(4));
        var w = Eo * 0.92, sh = shEls[i].style; sh.width = w + "px"; sh.left = (X - w / 2) + "px"; sh.top = (Y + Eo / 2 + (wide ? 14 : 8)) + "px";
      });
    }

    var hover = false, focus = false, pinnedOpen = false, isOpen = false;
    function update() {
      var open = forced || hover || focus || pinnedOpen;
      if (open !== isOpen) { isOpen = open; if (o.onToggle) o.onToggle(open); }
      box.classList.toggle("open", open); stack.setAttribute("aria-expanded", String(open));
    }
    function instant(fn) { box.classList.add("nt"); fn(); requestAnimationFrame(function () { requestAnimationFrame(function () { box.classList.remove("nt"); }); }); }
    instant(function () { layout(); update(); });
    var lastW = 0;
    /* phone layout depends on width only; skipping height-only changes keeps the zone/cards transitions from being cut short */
    if ("ResizeObserver" in window) new ResizeObserver(function () { var w = box.clientWidth; if (withCards && !wideMq.matches && w === lastW) return; lastW = w; instant(layout); }).observe(box);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { instant(layout); });

    var tgx = 0, tgy = 0, cgx = 0, cgy = 0, raf = 0;
    function tick() {
      cgx += (tgx - cgx) * 0.09; cgy += (tgy - cgy) * 0.09;
      layer.style.transform = "rotateX(" + (-cgy * 4.5).toFixed(3) + "deg) rotateY(" + (cgx * 5.5).toFixed(3) + "deg)"; box.style.setProperty("--mx", cgx.toFixed(3));
      raf = (Math.abs(tgx - cgx) > 0.002 || Math.abs(tgy - cgy) > 0.002) ? requestAnimationFrame(tick) : 0;
    }
    function aim(x, y) { tgx = x; tgy = y; if (!raf && !rm) raf = requestAnimationFrame(tick); }
    function mouse(e) { return e.pointerType === "mouse" || e.pointerType === "pen"; }
    box.addEventListener("pointerenter", function (e) { if (mouse(e)) { hover = true; update(); } });
    box.addEventListener("pointerleave", function (e) { if (mouse(e)) { hover = false; aim(0, 0); update(); } });
    box.addEventListener("pointermove", function (e) {
      if (!mouse(e)) return; var r = box.getBoundingClientRect();
      aim(clamp(((e.clientX - r.left) / r.width - 0.5) * 2, -1, 1), clamp(((e.clientY - r.top) / r.height - 0.5) * 2, -1, 1));
    });
    box.addEventListener("click", function (e) { if (e.target.closest("a")) return; pinnedOpen = !pinnedOpen; update(); });
    stack.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pinnedOpen = !pinnedOpen; update(); } });
    box.addEventListener("keydown", function (e) { if (e.key === "Escape") { pinnedOpen = focus = hover = false; update(); } });
    box.addEventListener("focusin", function (e) { if (e.target.matches(":focus-visible")) { focus = true; update(); } });
    box.addEventListener("focusout", function (e) { if (!box.contains(e.relatedTarget)) { focus = false; update(); } });
    if (touch && o.autoOpen !== false && "IntersectionObserver" in window && !forced) {
      var io = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { pinnedOpen = true; update(); io.disconnect(); } }, { threshold: 0.5 });
      io.observe(box);
    }
    return {
      el: box, isOpen: function () { return isOpen; },
      open: function () { pinnedOpen = true; update(); }, close: function () { pinnedOpen = focus = hover = false; update(); },
      toggle: function () { pinnedOpen = !pinnedOpen; update(); }
    };
  }

  /* ---------- home-version pill ---------- */
  function mountHomePill(current) {
    var c = String(current || "").toLowerCase(), el = document.createElement("nav");
    el.className = "prototype-pill"; el.setAttribute("aria-label", "Home page versions");
    el.innerHTML = "<span>Home</span>" + ["a", "b", "c"].map(function (v) {
      return '<a href="home-' + v + '.html"' + (c === v ? ' aria-current="page"' : "") + ">" + v.toUpperCase() + "</a>";
    }).join("");
    document.body.appendChild(el); return el;
  }

  window.bcns = { pinStage: pinStage, flowDots: flowDots, buildCube: buildCube, mountHomePill: mountHomePill, logoSvg: logoSvg, setTheme: setTheme, tools: TOOLS, pillars: PILLARS };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initChrome); else initChrome();
})();
