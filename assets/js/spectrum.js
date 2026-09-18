/* ==========================================================================
   spectrum.js — one slider, and the trade-off that shapes every mobile network.
   The wave is drawn to scale against a phone, so the size of a wavelength is
   something you can see rather than a number you have to trust.
   ========================================================================== */
(function (App) {
  'use strict';

  var C = App.colors;
  var F_MIN = 600, F_MAX = 39000;              // MHz
  var RATIO = F_MAX / F_MIN;
  var PX_PER_M = 520;                          // drawing scale
  var c = 299.792458;                          // so that lambda(m) = c / f(MHz)

  var BANDS = [
    { max: 1000,  name: 'Low band',        blurb: 'The coverage layer. One tower can hold a whole rural district, and the signal reaches the inside of buildings and the lower floors of car parks. There is simply not much spectrum down here, so everyone shares a narrow slice.' },
    { max: 2700,  name: 'Mid band',        blurb: 'The workhorse. Enough reach for a few kilometres of city, enough bandwidth for most of what people actually do. Almost every LTE network you have ever used lives here.' },
    { max: 7125,  name: 'C-band / upper mid', blurb: 'The sweet spot that made 5G worth deploying: roughly a hundred megahertz of contiguous spectrum, with cells still measured in kilometres rather than metres. Antennas are small enough here to put 64 of them on one panel and steer beams at individual users.' },
    { max: 24000, name: 'Upper mid (emerging)', blurb: 'Spectrum between roughly 7 and 24 GHz is the current frontier — enough bandwidth to matter, propagation that is still workable, and no incumbent mobile use. Expect the next decade of standards work to concentrate here.' },
    { max: 1e9,   name: 'Millimetre wave', blurb: 'Enormous capacity, almost no reach. Cells are a street corner wide, a body or a pane of coated glass is an obstacle, and it only works at all because beams are steered directly at you. Useful in stadiums and stations; useless for coverage.' }
  ];

  var WALLS = [
    { min: 0.82, text: 'Brick, and into a basement' },
    { min: 0.58, text: 'Most walls; weak deep inside' },
    { min: 0.35, text: 'A wall or two, then it fades' },
    { min: 0.15, text: 'Barely indoors at all' },
    { min: -1,   text: 'Line of sight. A hand blocks it.' }
  ];

  var PRESETS = [
    { f: 700,   label: 'Low band',  note: '700 MHz' },
    { f: 1800,  label: 'Mid band',  note: '1.8 GHz' },
    { f: 3500,  label: 'C-band',    note: '3.5 GHz' },
    { f: 28000, label: 'mmWave',    note: '28 GHz' }
  ];

  var slider, canvas, readout, chips;
  var freq = 2400;

  function sliderToFreq(v) { return F_MIN * Math.pow(RATIO, v / 1000); }
  function freqToSlider(f) { return 1000 * Math.log(f / F_MIN) / Math.log(RATIO); }

  function model(f) {
    var lambda = c / f;                                       // metres
    var reachKm = 12 * Math.pow(700 / f, 1.2);                // illustrative
    var bwMHz = App.clamp(f * 0.025, 10, 800);
    var peakMbps = bwMHz * 7;                                 // ~7 bit/s/Hz on a good link
    var pen = App.clamp(1 - Math.log(f / F_MIN) / Math.log(RATIO) * 1.15, 0.02, 1);
    var band = BANDS[0];
    for (var i = 0; i < BANDS.length; i++) { if (f <= BANDS[i].max) { band = BANDS[i]; break; } }
    var wall = WALLS[WALLS.length - 1];
    for (var j = 0; j < WALLS.length; j++) { if (pen >= WALLS[j].min) { wall = WALLS[j]; break; } }
    return {
      f: f, lambda: lambda, reachKm: reachKm, bwMHz: bwMHz,
      peakMbps: peakMbps, pen: pen, band: band, wall: wall,
      reachNorm: App.clamp((Math.log(reachKm) - Math.log(0.05)) / (Math.log(15) - Math.log(0.05)), 0.02, 1),
      capNorm: App.clamp(bwMHz / 800, 0.02, 1)
    };
  }

  function fmtFreq(f) {
    return f >= 1000 ? (f / 1000).toFixed(f >= 10000 ? 1 : 2) + ' GHz' : Math.round(f) + ' MHz';
  }
  function fmtLambda(m) {
    return m >= 1 ? m.toFixed(2) + ' m' : (m * 100).toFixed(m < 0.05 ? 2 : 1) + ' cm';
  }
  function fmtReach(km) {
    return km >= 1 ? km.toFixed(1) + ' km' : Math.round(km * 1000) + ' m';
  }

  function build() {
    slider = document.getElementById('radioFreq');
    canvas = document.getElementById('radioCanvas');
    readout = document.getElementById('radioReadout');
    chips = document.getElementById('bandChips');
    if (!slider || !canvas || !readout) return;

    chips.innerHTML = '';
    PRESETS.forEach(function (p) {
      var b = App.el('button', 'band-chip');
      b.type = 'button';
      b.innerHTML = '<b>' + p.label + '</b><span>' + p.note + '</span>';
      b.addEventListener('click', function () {
        slider.value = String(Math.round(freqToSlider(p.f)));
        onInput();
      });
      b.dataset.f = String(p.f);
      chips.appendChild(b);
    });

    slider.addEventListener('input', onInput);
    App.onTheme(function () { renderReadout(model(freq)); draw(0); });
    App.onResize(function () { draw(lastT); });
    App.addTicker(function (dt, now) { draw(now / 1000); });
    onInput();
  }

  /** Slider moved: push every dependent piece of DOM now, in this handler. */
  function onInput() {
    freq = sliderToFreq(parseFloat(slider.value));
    var m = model(freq);
    renderReadout(m);
    markChips(m);
    draw(lastT);
  }

  function markChips(m) {
    Array.prototype.forEach.call(chips.children, function (b) {
      var pf = parseFloat(b.dataset.f);
      b.classList.toggle('is-on', Math.abs(Math.log(pf / m.f)) < 0.06);
    });
  }

  function renderReadout(m) {
    readout.innerHTML =
      '<div>' +
        '<div class="freq-big">' + fmtFreq(m.f) + '</div>' +
        '<div class="band-name">' + m.band.name + '</div>' +
      '</div>' +
      metric('Wavelength', fmtLambda(m.lambda), null, null) +
      metric('Typical cell radius', fmtReach(m.reachKm), m.reachNorm, 'reach') +
      metric('Usable bandwidth', Math.round(m.bwMHz) + ' MHz · ~' + fmtRate(m.peakMbps), m.capNorm, 'cap') +
      metric('Indoors', m.wall.text, m.pen, 'walls') +
      '<p class="note">' + m.band.blurb + '</p>';
  }

  function fmtRate(mbps) {
    return mbps >= 1000 ? (mbps / 1000).toFixed(1) + ' Gbit/s' : Math.round(mbps) + ' Mbit/s';
  }

  function metric(label, value, norm, cls) {
    var bar = norm == null ? '' :
      '<div class="meter ' + cls + '"><i style="width:' + (norm * 100).toFixed(1) + '%"></i></div>';
    return '<div class="metric"><div class="metric-label"><span>' + label + '</span><b>' + value + '</b></div>' + bar + '</div>';
  }

  /* --- canvas -------------------------------------------------------------- */

  var lastT = 0;
  function draw(t) {
    lastT = t || 0;
    var fit = App.fitCanvas(canvas);
    if (!fit) return;
    var ctx = fit.ctx, w = fit.w, h = fit.h;
    var m = model(freq);
    var scale = PX_PER_M * (w / 760);

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, w, h);

    var cy = h * 0.45, amp = h * 0.24;
    var wallX = w * 0.66;
    var pxLambda = Math.max(3.2, m.lambda * scale);
    var phoneW = 0.071 * scale;
    var phase = App.reduceMotion.matches ? 0 : lastT * 3.4;
    var through = m.pen > 0.35;

    // the wall
    ctx.fillStyle = App.alpha('line-hi', 0.9);
    ctx.fillRect(wallX, h * 0.10, 15, h * 0.82);
    ctx.strokeStyle = App.alpha('muted', 0.3); ctx.lineWidth = 1;
    for (var hy = h * 0.12; hy < h * 0.92; hy += 9) {
      ctx.beginPath(); ctx.moveTo(wallX, hy); ctx.lineTo(wallX + 15, hy - 7); ctx.stroke();
    }

    // the wave, to scale, attenuated past the wall
    ctx.strokeStyle = App.alpha('line', 1); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(30, cy); ctx.lineTo(w - 16, cy); ctx.stroke();

    var grad = ctx.createLinearGradient(30, 0, w, 0);
    var far = through ? C.accent : C.hot;
    grad.addColorStop(0, C.accent);
    grad.addColorStop(Math.min(0.97, wallX / w), C.accent);
    grad.addColorStop(Math.min(0.98, wallX / w + 0.01), far);
    grad.addColorStop(1, far);
    ctx.strokeStyle = grad; ctx.lineWidth = 2.2;
    ctx.beginPath();
    for (var x = 30; x < w - 16; x += 1) {
      var att = x < wallX ? 1 : Math.max(0.035, m.pen * m.pen);
      var y = cy - Math.sin((x - 30) / pxLambda * 6.283 - phase) * amp * att;
      x === 30 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    // two measures on adjacent baselines, so they can be compared by eye
    ruler(ctx, 30, h * 0.80, pxLambda, C.signal, 'λ = ' + fmtLambda(m.lambda));
    ruler(ctx, 30, h * 0.93, phoneW, C.muted, 'a phone, 7.1 cm wide');

    ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = C.muted;
    ctx.textAlign = 'center';
    ctx.fillText('wall', wallX + 7, h * 0.07);
    ctx.textAlign = 'right';
    ctx.fillStyle = far;
    ctx.fillText(Math.round(m.pen * 100) + '% gets through', w - 16, h * 0.07);
    ctx.textAlign = 'left';
  }

  function ruler(ctx, x, y, len, color, text) {
    ctx.strokeStyle = color; ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x, y - 5); ctx.lineTo(x, y + 5);
    ctx.moveTo(x, y); ctx.lineTo(x + len, y);
    ctx.moveTo(x + len, y - 5); ctx.lineTo(x + len, y + 5);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(text, x + len + 9, y + 4);
  }

  App.register('spectrum', build);
})(window.PhoneApp);
