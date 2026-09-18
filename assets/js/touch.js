/* ==========================================================================
   touch.js — what the glass actually measures, and what the OS is handed.

   The sensed grid is resampled at a fixed scan rate rather than once per
   animation frame, which is what a real controller does and what makes the
   interpolation visible.
   ========================================================================== */
(function (App) {
  'use strict';

  var C = App.colors;
  var COLS = 14, ROWS = 20;
  var SCAN_HZ = 120;
  var PITCH_MM = 4.6;
  var SCREEN_W = 1080, SCREEN_H = 2340;      // the pixel grid the OS thinks in

  var canvas, readout, mode = 'heat';
  var grid = new Float32Array(COLS * ROWS);
  var pointer = { x: -1, y: -1, down: false, press: 0, inside: false };
  var scanAcc = 0, scanRow = 0;
  var report = null;

  function build() {
    canvas = document.getElementById('touchCanvas');
    readout = document.getElementById('touchReadout');
    if (!canvas || !readout) return;

    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerdown', function (ev) {
      pointer.down = true;
      try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
      onMove(ev);
    });
    window.addEventListener('pointerup', function () { pointer.down = false; });
    canvas.addEventListener('pointerleave', function () {
      pointer.inside = false; pointer.down = false;
    });
    canvas.addEventListener('pointerenter', function () { pointer.inside = true; });

    var seg = document.getElementById('touchModes');
    seg.addEventListener('click', function (ev) {
      var b = ev.target.closest('.seg-btn');
      if (!b) return;
      mode = b.dataset.mode;
      Array.prototype.forEach.call(seg.children, function (n) { n.classList.toggle('is-on', n === b); });
      draw();                       // the click changed it, so the click paints it
    });

    App.onTheme(draw);
    App.onResize(draw);
    App.addTicker(tick);
    renderReadout();
    draw();
  }

  function onMove(ev) {
    var p = App.pointerPos(canvas, ev);
    pointer.x = p.x; pointer.y = p.y; pointer.inside = true;
    ev.preventDefault();
    // Scan and paint from the handler too. Leaving it to the frame loop means
    // a throttled or not-yet-painted surface shows a dead panel under a live
    // pointer, with the model perfectly correct and nothing on screen.
    scanOnce();
    draw();
  }

  function tick(dt) {
    // Press builds while held and relaxes when released — wall-clock, so a
    // throttled tab does not leave it stuck part-way.
    var target = pointer.down ? 1 : 0;
    pointer.press += (target - pointer.press) * Math.min(1, dt / 130);

    scanAcc += dt;
    var period = 1000 / SCAN_HZ;
    var scans = 0;
    while (scanAcc >= period && scans < 4) { scanAcc -= period; scanOnce(); scans++; }
    draw();
  }

  function scanOnce() {
    var box = App.fitCanvas(canvas);
    if (!box) return;
    var w = box.w, h = box.h;
    var cw = w / COLS, ch = h / ROWS;
    var touching = pointer.inside && pointer.x >= 0;
    // Work in node units, not pixels: a fingertip covers roughly the same
    // number of electrodes in each direction whatever the cell aspect is.
    var fx = pointer.x / cw - 0.5, fy = pointer.y / ch - 0.5;
    var sigN = 0.95 + pointer.press * 0.55;
    var amp = 0.62 + pointer.press * 0.38;

    for (var r = 0; r < ROWS; r++) {
      for (var cI = 0; cI < COLS; cI++) {
        var v = 0;
        if (touching) {
          var du = cI - fx, dv = r - fy;
          v = amp * Math.exp(-(du * du + dv * dv) / (2 * sigN * sigN));
        }
        // a little baseline noise, as every real panel has
        v += (Math.sin(cI * 12.9 + r * 78.2 + scanRow * 0.7) * 0.5 + 0.5) * 0.018;
        grid[r * COLS + cI] = v;
      }
    }
    scanRow = (scanRow + 1) % ROWS;
    resolve(cw, ch);
  }

  /** Centroid of everything above threshold — this is the interpolation step. */
  function resolve(cw, ch) {
    var TH = 0.16;
    var sum = 0, sx = 0, sy = 0, n = 0, peak = 0, pc = 0, pr = 0;
    for (var r = 0; r < ROWS; r++) {
      for (var cI = 0; cI < COLS; cI++) {
        var v = grid[r * COLS + cI];
        if (v > peak) { peak = v; pc = cI; pr = r; }
        if (v < TH) continue;
        var wgt = v - TH;
        sum += wgt; sx += wgt * (cI + 0.5); sy += wgt * (r + 0.5); n++;
      }
    }
    if (sum <= 0 || peak < TH) { report = null; renderReadout(); return; }
    var gx = sx / sum, gy = sy / sum;
    report = {
      col: pc, row: pr, peak: peak, nodes: n,
      gx: gx, gy: gy,
      px: gx * cw, py: gy * ch,
      sx: Math.round(gx / COLS * SCREEN_W),
      sy: Math.round(gy / ROWS * SCREEN_H),
      kind: n > 46 ? 'palm — rejected' : (n >= 3 ? 'finger' : 'noise — ignored')
    };
    renderReadout();
  }

  var lastReadout = '';
  function renderReadout() {
    var html;
    if (!report) {
      html = row('Peak node', '—') + row('Peak ΔC', '0.0 fF') +
             row('Nodes above threshold', '0') +
             row('Reported to the OS', 'nothing', false) +
             row('Classified as', 'no touch');
    } else {
      html = row('Peak node', 'col ' + report.col + ', row ' + report.row) +
             row('Peak ΔC', (report.peak * 2.4).toFixed(2) + ' fF') +
             row('Nodes above threshold', String(report.nodes)) +
             row('Reported to the OS', report.sx + ', ' + report.sy + ' px', true) +
             row('Classified as', report.kind);
    }
    html += row('Scan rate', SCAN_HZ + ' Hz') + row('Electrode pitch', PITCH_MM + ' mm');
    if (html !== lastReadout) { readout.innerHTML = html; lastReadout = html; }
  }

  function row(k, v, hot) {
    return '<div class="tr-row"><span>' + k + '</span><b' + (hot ? ' class="hot"' : '') + '>' + v + '</b></div>';
  }

  /* --- drawing ------------------------------------------------------------- */

  function draw() {
    var box = App.fitCanvas(canvas);
    if (!box) return;
    var ctx = box.ctx, w = box.w, h = box.h;
    var cw = w / COLS, ch = h / ROWS;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, w, h);

    if (mode === 'heat' || mode === 'both') drawHeat(ctx, cw, ch);
    if (mode === 'grid' || mode === 'both') drawElectrodes(ctx, w, h, cw, ch);

    if (report) {
      // nearest node vs interpolated point — the whole trick, in two markers
      var nx = (report.col + 0.5) * cw, ny = (report.row + 0.5) * ch;
      ctx.strokeStyle = App.alpha('muted', 0.85); ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.rect(nx - cw / 2, ny - ch / 2, cw, ch); ctx.stroke();

      ctx.strokeStyle = C.accent; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(report.px, report.py, 9, 0, 6.3); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(report.px - 15, report.py); ctx.lineTo(report.px - 4, report.py);
      ctx.moveTo(report.px + 4, report.py); ctx.lineTo(report.px + 15, report.py);
      ctx.moveTo(report.px, report.py - 15); ctx.lineTo(report.px, report.py - 4);
      ctx.moveTo(report.px, report.py + 4); ctx.lineTo(report.px, report.py + 15);
      ctx.stroke();

      ctx.fillStyle = C.accent;
      ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif';
      var tx = App.clamp(report.px + 18, 4, w - 96);
      ctx.fillText(report.sx + ', ' + report.sy, tx, App.clamp(report.py - 12, 14, h - 6));
    } else {
      ctx.fillStyle = C.muted;
      ctx.font = '500 13px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('move a pointer over the panel', w / 2, h / 2);
      ctx.textAlign = 'left';
    }
  }

  function drawHeat(ctx, cw, ch) {
    for (var r = 0; r < ROWS; r++) {
      for (var cI = 0; cI < COLS; cI++) {
        var v = App.clamp(grid[r * COLS + cI], 0, 1);
        var col = v < 0.5 ? App.mix(C.line, C.accent, v * 2) : App.mix(C.accent, C.signal, (v - 0.5) * 2);
        ctx.fillStyle = col;
        ctx.globalAlpha = 0.45 + v * 0.55;
        var pad = 1.4;
        ctx.beginPath();
        ctx.roundRect(cI * cw + pad, r * ch + pad, cw - pad * 2, ch - pad * 2, 3);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawElectrodes(ctx, w, h, cw, ch) {
    ctx.lineWidth = 1;
    ctx.strokeStyle = App.alpha('accent-2', mode === 'both' ? 0.35 : 0.55);
    for (var cI = 0; cI < COLS; cI++) {
      var x = (cI + 0.5) * cw;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    ctx.strokeStyle = App.alpha('violet', mode === 'both' ? 0.35 : 0.55);
    for (var r = 0; r < ROWS; r++) {
      var y = (r + 0.5) * ch;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    // the row currently being driven
    var sy = (scanRow + 0.5) * ch;
    ctx.strokeStyle = C.signal; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(w, sy); ctx.stroke();

    if (mode === 'grid') {
      for (var rr = 0; rr < ROWS; rr++) {
        for (var cc = 0; cc < COLS; cc++) {
          var v = App.clamp(grid[rr * COLS + cc], 0, 1);
          if (v < 0.06) continue;
          ctx.fillStyle = C.accent;
          ctx.globalAlpha = App.clamp(v, 0, 1);
          var rad = 2 + v * (Math.min(cw, ch) * 0.34);
          ctx.beginPath(); ctx.arc((cc + 0.5) * cw, (rr + 0.5) * ch, rad, 0, 6.3); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }
  }

  App.register('touch', build);
})(window.PhoneApp);
