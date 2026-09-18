/* ==========================================================================
   app.js — shared plumbing: theme, tokens, canvas sizing, one animation loop.

   Two rules this file exists to enforce:
     1. A canvas 2D context cannot resolve `var(--x)`; it silently keeps the
        previous value. So colours are read out of computed style once and
        handed to the modules as literal strings.
     2. Discrete state changes are pushed to the DOM by the handler that made
        them. The frame loop only animates things that genuinely change every
        frame, because a hidden tab delivers no frames at all.
   ========================================================================== */
window.PhoneApp = (function () {
  'use strict';

  var TOKENS = ['bg', 'bg-2', 'panel', 'panel-hi', 'line', 'line-hi', 'text',
                'text-dim', 'muted', 'accent', 'accent-2', 'signal', 'good',
                'hot', 'violet'];

  var colors = {};
  var modules = [];
  var tickers = [];
  var themeListeners = [];
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* --- theme -------------------------------------------------------------- */

  function readTokens() {
    var cs = getComputedStyle(document.documentElement);
    for (var i = 0; i < TOKENS.length; i++) {
      var k = TOKENS[i];
      var v = cs.getPropertyValue('--' + k).trim();
      // camelCase alias so modules can write colors.accent2
      colors[k] = v;
      colors[k.replace(/-(\w)/g, function (_, c) { return c.toUpperCase(); })] = v;
    }
  }

  /** Mix two hex colours; canvas has no color-mix(). */
  function mix(a, b, t) {
    var ca = hex(a), cb = hex(b);
    if (!ca || !cb) return a;
    return 'rgb(' + Math.round(ca[0] + (cb[0] - ca[0]) * t) + ',' +
                    Math.round(ca[1] + (cb[1] - ca[1]) * t) + ',' +
                    Math.round(ca[2] + (cb[2] - ca[2]) * t) + ')';
  }

  /** Hex string -> [r,g,b]; returns null for anything else. */
  function hex(s) {
    if (!s) return null;
    s = s.trim();
    var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
    if (!m) return null;
    var h = m[1];
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  /** rgba() from a token, since a hex token cannot carry alpha. */
  function alpha(token, a) {
    var c = hex(colors[token] || token);
    if (!c) return token;
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  }

  function applyTheme(name) {
    document.documentElement.setAttribute('data-theme', name);
    try { localStorage.setItem('phone-theme', name); } catch (e) { /* private mode */ }
    readTokens();
    for (var i = 0; i < themeListeners.length; i++) themeListeners[i]();
  }

  function initTheme() {
    var saved = null;
    try { saved = localStorage.getItem('phone-theme'); } catch (e) { /* ignore */ }
    if (!saved) {
      saved = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    document.documentElement.setAttribute('data-theme', saved);
    readTokens();

    var btn = document.getElementById('themeToggle');
    if (btn) {
      btn.addEventListener('click', function () {
        var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        applyTheme(next);
      });
    }
  }

  function onTheme(fn) { themeListeners.push(fn); }

  /* --- canvas ------------------------------------------------------------- */

  /**
   * Size a canvas to its CSS box at device pixel ratio and return a context
   * already scaled to CSS pixels. Returns null while the box measures zero —
   * a collapsed or not-yet-laid-out element gives 0x0, and scaling anything
   * derived from that never recovers.
   */
  function fitCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var cssW = rect.width, cssH = rect.height;
    if (cssW < 2 || cssH < 2) return null;
    var dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    var w = Math.round(cssW * dpr), h = Math.round(cssH * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: cssW, h: cssH, dpr: dpr };
  }

  /** Pointer position in CSS pixels relative to a canvas. */
  function pointerPos(canvas, ev) {
    var r = canvas.getBoundingClientRect();
    var p = (ev.touches && ev.touches[0]) || ev;
    return { x: p.clientX - r.left, y: p.clientY - r.top };
  }

  /* --- one animation loop ------------------------------------------------- */

  var last = 0;
  var running = false;

  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    // Wall-clock delta, clamped: a stall must not teleport anything, and a
    // throttled tab must not leave a half-finished animation on screen.
    var dt = last ? Math.min(100, now - last) : 16.7;
    last = now;
    for (var i = 0; i < tickers.length; i++) {
      try { tickers[i](dt, now); } catch (e) { /* one bad module must not stop the rest */ }
    }
  }

  function startLoop() {
    if (running) return;
    running = true;
    last = 0;                 // rebase, or the first frame carries the whole pause
    requestAnimationFrame(frame);
  }

  function addTicker(fn) { tickers.push(fn); startLoop(); }

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) { last = 0; startLoop(); }
  });

  /* --- resize ------------------------------------------------------------- */

  var resizeListeners = [];
  function onResize(fn) { resizeListeners.push(fn); }
  var resizeTimer = null;
  window.addEventListener('resize', function () {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      for (var i = 0; i < resizeListeners.length; i++) {
        try { resizeListeners[i](); } catch (e) { /* ignore */ }
      }
    }, 120);
  });

  /* --- nav scroll spy ------------------------------------------------------ */

  function initNav() {
    var links = Array.prototype.slice.call(document.querySelectorAll('.navlinks a'));
    if (!links.length || !('IntersectionObserver' in window)) return;
    var byId = {};
    var targets = [];
    links.forEach(function (a) {
      var id = a.getAttribute('href').slice(1);
      var el = document.getElementById(id);
      if (el) { byId[id] = a; targets.push(el); }
    });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        links.forEach(function (a) { a.classList.remove('is-active'); });
        var a = byId[en.target.id];
        if (a) a.classList.add('is-active');
      });
    }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
    targets.forEach(function (t) { io.observe(t); });
  }

  /* --- small helpers ------------------------------------------------------ */

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function svgEl(tag, attrs) {
    var n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (attrs) for (var k in attrs) if (attrs.hasOwnProperty(k)) n.setAttribute(k, attrs[k]);
    return n;
  }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  /* --- roundRect fallback --------------------------------------------------- */
  // Older engines lack it; without this every roundRect() call throws and takes
  // the whole draw with it.
  if (window.CanvasRenderingContext2D && !CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      var rad = typeof r === 'number' ? r : (r && r[0]) || 0;
      rad = Math.min(rad, Math.abs(w) / 2, Math.abs(h) / 2);
      this.moveTo(x + rad, y);
      this.arcTo(x + w, y, x + w, y + h, rad);
      this.arcTo(x + w, y + h, x, y + h, rad);
      this.arcTo(x, y + h, x, y, rad);
      this.arcTo(x, y, x + w, y, rad);
      this.closePath();
      return this;
    };
  }

  /* --- boot --------------------------------------------------------------- */

  function register(name, init) { modules.push({ name: name, init: init }); }

  function boot() {
    initTheme();
    initNav();
    // Build eagerly. Nothing here waits on an animation frame: a page opened in
    // a background tab gets no frames, and a build gated on one never happens.
    for (var i = 0; i < modules.length; i++) {
      try { modules[i].init(); }
      catch (e) { if (window.console) console.error('[' + modules[i].name + ']', e); }
    }
  }

  return {
    register: register, boot: boot,
    colors: colors, onTheme: onTheme, mix: mix, alpha: alpha, hex: hex,
    fitCanvas: fitCanvas, pointerPos: pointerPos,
    addTicker: addTicker, onResize: onResize,
    el: el, svgEl: svgEl, clamp: clamp, lerp: lerp,
    reduceMotion: reduceMotion
  };
})();
