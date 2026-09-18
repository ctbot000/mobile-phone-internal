/* ==========================================================================
   cells.js — a cell map you can walk across, with a real handover rule.

   The signal map does not depend on where the phone is, so it is rendered once
   into an offscreen canvas and only rebuilt on resize or theme change.
   ========================================================================== */
(function (App) {
  'use strict';

  var C = App.colors;
  var TONES = ['accent', 'violet', 'signal', 'good', 'accent-2', 'hot'];
  var NAMES = 'ABCDEFGHIJKL';

  var HYST_DB = 3;          // a neighbour must beat the serving cell by this much
  var TTT_MS = 320;         // ...and hold it for this long (time-to-trigger)
  var N_PATH = 3.2;         // path-loss exponent, dense-urban-ish
  var M_PER_REFPX = 4;      // world scale at the 760px reference width

  var canvas, ctx, w = 0, h = 0, refScale = 1;
  var towers = [];
  var phone = { x: 0.5, y: 0.5 };     // normalised position
  var serving = 0, candidate = -1, candTime = 0;
  var dragging = false, walking = false, walkT = 0, sessionT = 0;
  var flash = 0;
  var heat = null, heatKey = '';
  var rows = [], logEl, servingEl, showHeat = true, showHex = true;

  function build() {
    canvas = document.getElementById('cellsCanvas');
    logEl = document.getElementById('handoverLog');
    servingEl = document.getElementById('cellsServing');
    if (!canvas) return;

    buildRows();

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);

    document.getElementById('cellsWalk').addEventListener('click', function () {
      walking = !walking;
      this.textContent = walking ? '❚❚ Stop' : '▶ Walk';
    });
    document.getElementById('cellsReset').addEventListener('click', reset);
    document.getElementById('cellsShowRsrp').addEventListener('change', function () {
      showHeat = this.checked; draw();
    });
    document.getElementById('cellsShowHex').addEventListener('change', function () {
      showHex = this.checked; draw();
    });

    App.onTheme(function () { heatKey = ''; draw(); });
    App.onResize(function () { layout(); draw(); });
    App.addTicker(tick);
    layout();
    updateModel(0);
    draw();
  }

  function buildRows() {
    var host = document.getElementById('rsrpList');
    host.innerHTML = '';
    for (var i = 0; i < 6; i++) {
      var li = App.el('li', 'rsrp-row');
      li.innerHTML = '<span class="cid"></span><span class="rsrp-bar"><i></i></span><span class="val"></span>';
      host.appendChild(li);
      rows.push({ li: li, cid: li.querySelector('.cid'), bar: li.querySelector('i'), val: li.querySelector('.val') });
    }
  }

  /** Lay out a hex lattice of towers across whatever box we were given. */
  function layout() {
    var fit = App.fitCanvas(canvas);
    if (!fit) return false;
    ctx = fit.ctx; w = fit.w; h = fit.h;
    refScale = 760 / w;

    var R = h * 0.30;
    var dx = Math.sqrt(3) * R, dy = 1.5 * R;
    towers = [];
    var k = 0;
    for (var row = -1; row * dy < h + R; row++) {
      for (var col = -1; col * dx < w + dx; col++) {
        var x = col * dx + (row % 2 ? dx / 2 : 0) + dx * 0.25;
        var y = row * dy + R * 0.55;
        if (x < -R * 0.6 || x > w + R * 0.6 || y < -R * 0.6 || y > h + R * 0.6) continue;
        towers.push({
          x: x, y: y, R: R,
          id: NAMES[k % NAMES.length],
          tone: TONES[k % TONES.length],
          // deterministic per-tower offsets: some towers simply transmit harder
          power: -26 + ((k * 37) % 7) - 3,
          shadowSeed: (k * 91) % 97
        });
        k++;
      }
    }
    if (!towers.length) return false;
    serving = App.clamp(serving, 0, towers.length - 1);
    return true;
  }

  /* --- radio model --------------------------------------------------------- */

  function rsrp(t, px, py) {
    var dx = (px - t.x) * refScale * M_PER_REFPX;
    var dy = (py - t.y) * refScale * M_PER_REFPX;
    var d = Math.max(25, Math.sqrt(dx * dx + dy * dy));
    // Smooth, deterministic shadow fading — buildings, in effect.
    var s = Math.sin((px * 0.021) + t.shadowSeed) * 3.1 +
            Math.cos((py * 0.017) - t.shadowSeed * 0.7) * 2.6 +
            Math.sin((px + py) * 0.009 + t.shadowSeed * 1.3) * 2.2;
    return t.power - 10 * N_PATH * Math.log10(d) + s;
  }

  function measure(px, py) {
    var list = [];
    for (var i = 0; i < towers.length; i++) list.push({ i: i, v: rsrp(towers[i], px, py) });
    list.sort(function (a, b) { return b.v - a.v; });
    return list;
  }

  /* --- interaction --------------------------------------------------------- */

  function onDown(ev) {
    dragging = true;
    walking = false;
    var btn = document.getElementById('cellsWalk');
    if (btn) btn.textContent = '▶ Walk';
    try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* no active pointer */ }
    onMove(ev);
  }
  function onMove(ev) {
    if (!dragging) return;
    ev.preventDefault();
    var p = App.pointerPos(canvas, ev);
    phone.x = App.clamp(p.x / w, 0.02, 0.98);
    phone.y = App.clamp(p.y / h, 0.02, 0.98);
    updateModel(16);          // push the readout now, not on the next frame
    draw();
  }
  function onUp(ev) {
    if (!dragging) return;
    dragging = false;
    try { canvas.releasePointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
  }

  function reset() {
    phone.x = 0.5; phone.y = 0.5;
    walking = false; walkT = 0; sessionT = 0; candidate = -1; candTime = 0;
    document.getElementById('cellsWalk').textContent = '▶ Walk';
    logEl.innerHTML = '<li class="muted">Move the phone to trigger a handover.</li>';
    updateModel(0);
    draw();
  }

  /* --- per-frame ----------------------------------------------------------- */

  function tick(dt) {
    sessionT += dt;
    if (walking) {
      walkT += dt / 1000;
      // A slow closed loop across the map; wall-clock driven, so a stall does
      // not change where the phone ends up relative to the clock.
      phone.x = 0.5 + 0.38 * Math.sin(walkT * 0.42);
      phone.y = 0.5 + 0.31 * Math.sin(walkT * 0.27 + 1.1);
    }
    if (flash > 0) flash = Math.max(0, flash - dt);
    updateModel(dt);
    draw();
  }

  function updateModel(dt) {
    if (!towers.length && !layout()) return;
    var px = phone.x * w, py = phone.y * h;
    var list = measure(px, py);

    // A3-style handover: better by a margin, for long enough.
    var best = list[0];
    var servingVal = rsrp(towers[serving], px, py);
    if (best.i !== serving && best.v > servingVal + HYST_DB) {
      if (candidate === best.i) candTime += dt; else { candidate = best.i; candTime = 0; }
      if (candTime >= TTT_MS) {
        addLog(towers[serving].id, towers[best.i].id, best.v);
        serving = best.i;
        candidate = -1; candTime = 0; flash = 700;
      }
    } else {
      candidate = -1; candTime = 0;
    }

    for (var r = 0; r < rows.length; r++) {
      var row = rows[r], m = list[r];
      if (!m) { row.li.style.display = 'none'; continue; }
      row.li.style.display = '';
      var t = towers[m.i];
      row.cid.textContent = 'Cell ' + t.id;
      row.val.textContent = Math.round(m.v) + ' dBm';
      row.bar.style.width = (App.clamp((m.v + 125) / 60, 0, 1) * 100).toFixed(0) + '%';
      row.li.classList.toggle('is-serving', m.i === serving);
    }
    if (servingEl) {
      var pending = candidate >= 0
        ? ' · Cell ' + towers[candidate].id + ' is ahead — holding for ' +
          Math.max(0, Math.round(TTT_MS - candTime)) + ' ms'
        : '';
      servingEl.textContent = 'Serving: Cell ' + towers[serving].id + ' at ' +
        Math.round(servingVal) + ' dBm' + pending;
    }
  }

  function addLog(from, to, v) {
    if (logEl.querySelector('.muted')) logEl.innerHTML = '';
    var li = App.el('li', 'is-fresh');
    var secs = (sessionT / 1000).toFixed(1);
    li.innerHTML = '<span class="t">' + secs + 's</span><span>Cell ' + from + ' → <b>Cell ' + to +
                   '</b> at ' + Math.round(v) + ' dBm</span>';
    logEl.insertBefore(li, logEl.firstChild);
    while (logEl.children.length > 14) logEl.removeChild(logEl.lastChild);
    setTimeout(function () { li.classList.remove('is-fresh'); }, 1400);
  }

  /* --- drawing ------------------------------------------------------------- */

  function draw() {
    if (!ctx && !layout()) return;
    var fit = App.fitCanvas(canvas);
    if (!fit) return;
    ctx = fit.ctx;
    if (fit.w !== w || fit.h !== h) { layout(); }

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, w, h);

    if (showHeat) {
      ensureHeat();
      if (heat) ctx.drawImage(heat, 0, 0, w, h);
    }
    if (showHex) drawHexes();
    drawTowers();
    drawPhone();
  }

  /** Best-server map. Static in the phone's position, so cache it. */
  function ensureHeat() {
    var key = Math.round(w) + 'x' + Math.round(h) + '|' + C.bg + '|' + towers.length;
    if (heatKey === key && heat) return;
    var step = 7;
    var cols = Math.ceil(w / step), rowsN = Math.ceil(h / step);
    var off = document.createElement('canvas');
    off.width = cols; off.height = rowsN;
    var octx = off.getContext('2d');
    var img = octx.createImageData(cols, rowsN);
    var rgb = {};
    TONES.forEach(function (t) { rgb[t] = App.hex(C[t.replace(/-(\w)/g, function (_, ch) { return ch.toUpperCase(); })]) || [120, 120, 120]; });
    var bg = App.hex(C.bg) || [8, 12, 20];

    for (var yy = 0; yy < rowsN; yy++) {
      for (var xx = 0; xx < cols; xx++) {
        var px = xx * step, py = yy * step;
        var bestV = -999, bestT = null;
        for (var i = 0; i < towers.length; i++) {
          var v = rsrp(towers[i], px, py);
          if (v > bestV) { bestV = v; bestT = towers[i]; }
        }
        var strength = App.clamp((bestV + 118) / 48, 0, 1);
        var col = rgb[bestT.tone];
        var a = 0.10 + strength * 0.42;
        var o = (yy * cols + xx) * 4;
        img.data[o] = Math.round(bg[0] + (col[0] - bg[0]) * a);
        img.data[o + 1] = Math.round(bg[1] + (col[1] - bg[1]) * a);
        img.data[o + 2] = Math.round(bg[2] + (col[2] - bg[2]) * a);
        img.data[o + 3] = 255;
      }
    }
    octx.putImageData(img, 0, 0);
    heat = off; heatKey = key;
  }

  function drawHexes() {
    ctx.lineWidth = 1;
    towers.forEach(function (t) {
      ctx.strokeStyle = App.alpha(t.tone, 0.32);
      ctx.beginPath();
      for (var i = 0; i < 6; i++) {
        var a = Math.PI / 180 * (60 * i - 90);
        var x = t.x + t.R * Math.cos(a), y = t.y + t.R * Math.sin(a);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath(); ctx.stroke();
    });
  }

  function drawTowers() {
    towers.forEach(function (t, i) {
      var on = i === serving;
      var col = C[t.tone.replace(/-(\w)/g, function (_, ch) { return ch.toUpperCase(); })] || C.muted;
      ctx.strokeStyle = on ? col : App.alpha(t.tone, 0.65);
      ctx.lineWidth = on ? 2.6 : 1.8;
      ctx.beginPath();
      ctx.moveTo(t.x - 9, t.y + 14); ctx.lineTo(t.x, t.y - 12); ctx.lineTo(t.x + 9, t.y + 14);
      ctx.moveTo(t.x - 5, t.y + 3); ctx.lineTo(t.x + 5, t.y + 3);
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(t.x, t.y - 15, on ? 4 : 2.8, 0, 6.3); ctx.fill();
      if (on && flash > 0) {
        ctx.strokeStyle = App.alpha(t.tone, flash / 700 * 0.8);
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(t.x, t.y, 24 + (700 - flash) * 0.08, 0, 6.3); ctx.stroke();
      }
      ctx.fillStyle = on ? col : C.muted;
      ctx.font = (on ? '700 ' : '500 ') + '11px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(t.id, t.x, t.y + 27);
      ctx.textAlign = 'left';
    });
  }

  function drawPhone() {
    var px = phone.x * w, py = phone.y * h;
    var t = towers[serving];
    if (t) {
      ctx.strokeStyle = App.alpha(t.tone, 0.85);
      ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(t.x, t.y - 10); ctx.stroke();
      ctx.setLineDash([]);
    }
    if (candidate >= 0 && towers[candidate]) {
      var ct = towers[candidate];
      ctx.strokeStyle = App.alpha(ct.tone, 0.45);
      ctx.lineWidth = 1.4; ctx.setLineDash([3, 5]);
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(ct.x, ct.y - 10); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.fillStyle = C.panel;
    ctx.strokeStyle = C.text; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(px - 9, py - 15, 18, 30, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.accent;
    ctx.fillRect(px - 5.5, py - 11, 11, 18);
    ctx.strokeStyle = App.alpha('text', 0.18); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(px, py, 26, 0, 6.3); ctx.stroke();
  }

  App.register('cells', build);
})(window.PhoneApp);
