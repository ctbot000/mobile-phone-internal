/* ==========================================================================
   journey.js — twelve stages from a sound wave to someone else's ear.

   The canvas draws a different picture per stage. Every colour is a literal
   string read out of computed style, because a 2D context silently ignores
   `var(--x)` and keeps whatever the previous assignment set.
   ========================================================================== */
(function (App) {
  'use strict';

  var C = App.colors;
  var FONT = 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  var MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

  function font(px, weight, mono) {
    return (weight || 500) + ' ' + px + 'px ' + (mono ? MONO : FONT);
  }

  /* --- stage definitions --------------------------------------------------- */

  var STAGES = [
    {
      name: 'Sound in air', domain: 'acoustic', tag: 'Pressure wave',
      title: 'Your voice is moving air',
      body: 'Speech is a pressure wave: bands of slightly compressed and slightly rarefied air travelling at about 343 m/s. Ordinary conversation displaces air molecules by well under a micrometre and changes the pressure by a few hundredths of a pascal against an atmosphere of 101,000.',
      facts: [['Speed', '343 m/s'], ['Useful band', '300 Hz – 3.4 kHz (or 50 Hz – 7 kHz for HD voice)']],
      draw: drawAir
    },
    {
      name: 'Microphone', domain: 'analog', tag: 'Acoustic → electrical',
      title: 'A silicon diaphragm, moving',
      body: 'A MEMS microphone is a diaphragm a fraction of a millimetre across etched into silicon, sitting a few microns above a perforated backplate. Sound bends the diaphragm, the gap changes, the capacitance changes, and a charge pump alongside it turns that into a voltage. The output is still purely analogue — a wiggle.',
      facts: [['Diaphragm', '~0.5 mm across'], ['Output', 'millivolts, analogue']],
      draw: drawMic
    },
    {
      name: 'Sampling', domain: 'digital', tag: 'Analogue → numbers',
      title: 'Measured 16,000 times a second',
      body: 'An analogue-to-digital converter freezes the voltage and measures it, over and over. Nyquist sets the rule: to keep every frequency up to 8 kHz you must sample above 16 kHz. Each measurement becomes a 16-bit integer, so from here on your voice is nothing but a list of numbers.',
      facts: [['Rate', '16 kHz (HD voice)'], ['Depth', '16 bits'], ['Raw bitrate', '256 kbit/s']],
      draw: drawAdc
    },
    {
      name: 'Speech codec', domain: 'digital', tag: 'Compression',
      title: 'Throwing away 95% of it',
      body: 'A raw voice stream is far too fat for radio. A codec such as EVS or AMR-WB does not compress the waveform — it models the vocal tract that produced it, and sends the parameters of that model: pitch, the shape of the filter, the energy. The receiver rebuilds a waveform that sounds like you without being the same waveform at all.',
      facts: [['In', '256 kbit/s'], ['Out', '~13–24 kbit/s'], ['Frame', '20 ms of speech']],
      draw: drawCodec
    },
    {
      name: 'Packets', domain: 'digital', tag: 'IP',
      title: 'Wrapped in envelopes',
      body: 'Modern voice is just data. Every 20 ms frame gets an RTP header (so the far end can reorder and time it), then UDP, then IP. Voice uses UDP rather than TCP deliberately: a late packet is worthless in a conversation, so there is no point asking for it again.',
      facts: [['Payload', '~32 bytes'], ['Headers', '40+ bytes'], ['Rate', '50 packets/s']],
      draw: drawPackets
    },
    {
      name: 'Error coding', domain: 'digital', tag: 'Redundancy',
      title: 'Adding bits so bits can be lost',
      body: 'Radio corrupts things. Before transmission the modem adds mathematical redundancy — turbo codes in LTE, LDPC and polar codes in 5G — so the receiver can reconstruct the original even when a good fraction of what arrives is wrong. Bits are also interleaved in time, so a burst of interference damages many codewords slightly instead of one codeword fatally.',
      facts: [['Code rate', 'typically 1/3 to 0.9'], ['Retransmit', 'HARQ, within ~8 ms']],
      draw: drawCoding
    },
    {
      name: 'Modulation', domain: 'digital', tag: 'Bits → symbols',
      title: 'Bits become points on a plane',
      body: 'Groups of bits are mapped to a symbol: a particular amplitude and phase of the carrier. With 64-QAM there are 64 possible points, so each symbol carries 6 bits; 256-QAM carries 8. The denser the constellation, the more data per symbol — and the less noise it takes to confuse two neighbouring points, which is why your phone drops to a sparser scheme as the signal weakens.',
      facts: [['QPSK', '2 bits/symbol'], ['64-QAM', '6 bits/symbol'], ['256-QAM', '8 bits/symbol']],
      draw: drawQam
    },
    {
      name: 'Scheduling', domain: 'digital', tag: 'OFDMA',
      title: 'Your slice of time and frequency',
      body: 'The channel is cut into a grid: thousands of narrow subcarriers across frequency, slots of a fraction of a millisecond across time. The tower — not your phone — decides which tiles of that grid you get, re-deciding every slot, for every device in the cell, based on what each one reported about its channel.',
      facts: [['Subcarrier', '15–120 kHz wide'], ['Slot', '1 ms down to 0.125 ms'], ['Decided by', 'the tower']],
      draw: drawGrid
    },
    {
      name: 'RF and antenna', domain: 'radio', tag: 'Up-conversion',
      title: 'Riding on a carrier',
      body: 'The transceiver mixes the baseband signal up to the carrier frequency, a power amplifier raises it to a couple of hundred milliwatts, filters keep it inside its licensed band, and the antenna — usually a segment of the metal frame — converts the current into a radiated field. Your phone deliberately transmits as weakly as the tower will let it, to save the battery.',
      facts: [['Max power', '23 dBm ≈ 200 mW'], ['Antenna', 'part of the frame'], ['Typical', 'far below maximum']],
      draw: drawRf
    },
    {
      name: 'The air', domain: 'radio', tag: 'Propagation',
      title: 'Microseconds of flight, then a tower',
      body: 'The wave leaves at the speed of light and reaches a tower a kilometre away in about three microseconds — but it does not arrive once. It arrives many times over, reflected off buildings and ground, each copy slightly delayed. The receiver uses that multipath rather than fighting it: several antennas, several paths, several parallel streams.',
      facts: [['Flight time', '~3.3 µs per km'], ['Path loss', 'the signal falls ~10⁷-fold'], ['MIMO', '2–8 parallel streams']],
      draw: drawAir2
    },
    {
      name: 'Core network', domain: 'network', tag: 'Routing',
      title: 'Out of the radio, into the internet',
      body: 'The tower hands your packets to the operator core, which knows who you are, what you are allowed, and where to send it. A voice call is routed through an IMS subsystem that finds the other subscriber wherever they currently are; a data session is simply given a path to the public internet.',
      facts: [['Backhaul', 'fibre or microwave'], ['Core', 'knows identity, policy, billing'], ['Voice', 'routed via IMS']],
      draw: drawCore
    },
    {
      name: 'Their phone', domain: 'acoustic', tag: 'Reassembly',
      title: 'And the whole thing in reverse',
      body: 'Everything above now runs backwards: demodulate, decode, unwrap, rebuild the waveform from the codec model, convert to a voltage, push a tiny speaker cone, move air, move an eardrum. End to end it takes on the order of 100–200 milliseconds — about the length of a spoken syllable, which is why a bad connection feels like people talking over each other.',
      facts: [['End to end', '~100–200 ms'], ['Jitter buffer', 'absorbs late packets'], ['Result', 'a voice, near enough']],
      draw: drawOut
    }
  ];

  /* --- state --------------------------------------------------------------- */

  var stage = 0, playing = false, elapsed = 0, speed = 1;
  var STAGE_MS = 5200;
  var cv, host, detail, progress, playBtn;
  var stepNodes = [];

  function build() {
    cv = document.getElementById('journeyCanvas');
    host = document.getElementById('journeyTrack');
    detail = document.getElementById('journeyDetail');
    progress = document.getElementById('journeyProgress');
    playBtn = document.getElementById('journeyPlay');
    if (!cv || !host || !detail) return;

    host.innerHTML = '';
    STAGES.forEach(function (s, i) {
      var li = document.createElement('li');
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'jstep';
      b.innerHTML = '<span class="jdomain" data-domain="' + s.domain + '"></span>' +
                    '<span class="jnum">' + String(i + 1).padStart(2, '0') + '</span>' +
                    '<span class="jname">' + s.name + '</span>';
      b.addEventListener('click', function () { setStage(i); pause(); });
      li.appendChild(b);
      host.appendChild(li);
      stepNodes.push(b);
    });

    playBtn.addEventListener('click', function () { playing ? pause() : play(); });
    document.getElementById('journeyPrev').addEventListener('click', function () { setStage(stage - 1); pause(); });
    document.getElementById('journeyNext').addEventListener('click', function () { setStage(stage + 1); pause(); });

    var sp = document.getElementById('journeySpeed'), spOut = document.getElementById('journeySpeedOut');
    sp.addEventListener('input', function () {
      speed = parseFloat(sp.value);
      spOut.textContent = speed + '×';
    });

    setStage(0);
    App.onTheme(render);
    App.onResize(render);
    App.addTicker(tick);
    render();
  }

  function play() { playing = true; playBtn.textContent = '❚❚ Pause'; }
  function pause() { playing = false; playBtn.textContent = '▶ Play'; }

  /** All discrete state changes go through here, and this pushes to the DOM. */
  function setStage(i) {
    stage = ((i % STAGES.length) + STAGES.length) % STAGES.length;
    elapsed = 0;
    for (var k = 0; k < stepNodes.length; k++) {
      stepNodes[k].classList.toggle('is-on', k === stage);
      stepNodes[k].classList.toggle('is-done', k < stage);
    }
    var s = STAGES[stage];
    detail.innerHTML =
      '<div class="jd-head"><h3>' + s.title + '</h3><span class="tag">' + s.tag + '</span></div>' +
      '<p>' + s.body + '</p>' +
      '<dl class="spec-grid">' + s.facts.map(function (f) {
        return '<div class="spec"><dt>' + f[0] + '</dt><dd>' + f[1] + '</dd></div>';
      }).join('') + '</dl>';
    if (progress) progress.style.width = '0%';
    render();
  }

  function tick(dt, now) {
    if (playing) {
      elapsed += dt * speed;
      if (elapsed >= STAGE_MS) { setStage(stage + 1); }
      if (progress) progress.style.width = Math.min(100, (elapsed / STAGE_MS) * 100).toFixed(1) + '%';
    }
    render(now);
  }

  var lastNow = 0;
  function render(now) {
    if (typeof now === 'number') lastNow = now;
    var f = App.fitCanvas(cv);
    if (!f) return;                       // zero box: nothing measurable yet
    var ctx = f.ctx, w = f.w, h = f.h;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    try { STAGES[stage].draw(ctx, w, h, lastNow / 1000, elapsed / STAGE_MS); } catch (e) { /* keep the page alive */ }
    ctx.restore();
  }

  /* --- drawing helpers ----------------------------------------------------- */

  function label(ctx, text, x, y, color, size, align) {
    ctx.fillStyle = color || C.muted;
    ctx.font = font(size || 12, 600);
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, x, y);
    ctx.textAlign = 'left';
  }

  function arrow(ctx, x1, y, x2, color) {
    ctx.strokeStyle = color; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2 - 7, y); ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(x2, y); ctx.lineTo(x2 - 9, y - 5); ctx.lineTo(x2 - 9, y + 5); ctx.closePath(); ctx.fill();
  }

  /** A speech-ish waveform: a carrier shaped by a slower envelope. */
  function voice(t, phase) {
    return Math.sin(t * 2.7 + phase) * 0.55 * (0.55 + 0.45 * Math.sin(t * 0.42 + phase * 0.5)) +
           Math.sin(t * 6.1 + phase * 1.7) * 0.22 +
           Math.sin(t * 11.3 + phase) * 0.1;
  }

  /* --- the twelve pictures ------------------------------------------------- */

  function drawAir(ctx, w, h, t) {
    var cy = h * 0.5, n = 130;
    for (var i = 0; i < n; i++) {
      var base = (i / n) * (w - 90) + 60;
      var k = (base / w) * 26 - t * 5.2;
      var sq = Math.sin(k) * 9;
      var x = base + sq;
      var density = (Math.cos(k) + 1) / 2;
      ctx.strokeStyle = App.mix(C.line, C.good, 0.25 + density * 0.75);
      ctx.lineWidth = 1 + density * 1.6;
      var amp = h * 0.26 * (0.5 + density * 0.5);
      ctx.beginPath(); ctx.moveTo(x, cy - amp); ctx.lineTo(x, cy + amp); ctx.stroke();
    }
    ctx.strokeStyle = C.good; ctx.lineWidth = 2; ctx.globalAlpha = 0.9;
    ctx.beginPath();
    for (var x2 = 50; x2 < w - 30; x2 += 2) {
      var v = Math.sin((x2 / w) * 26 - t * 5.2);
      var y = cy - h * 0.34 + v * 8;
      x2 === 50 ? ctx.moveTo(x2, y) : ctx.lineTo(x2, y);
    }
    ctx.stroke(); ctx.globalAlpha = 1;
    label(ctx, 'compression', 24, h - 18, C.muted, 12);
    label(ctx, 'rarefaction', w - 24, h - 18, C.muted, 12, 'right');
    label(ctx, '≈ 343 m/s  →', w / 2, 28, C.good, 13, 'center');
  }

  function drawMic(ctx, w, h, t) {
    var cx = w * 0.22, cy = h * 0.5, r = Math.min(h * 0.3, 62);
    var wob = Math.sin(t * 9) * 4 + Math.sin(t * 21) * 1.6;

    // incoming sound
    ctx.strokeStyle = App.alpha('good', 0.5); ctx.lineWidth = 1.6;
    for (var i = 0; i < 4; i++) {
      var rr = 18 + i * 16 + ((t * 40) % 16);
      ctx.beginPath(); ctx.arc(cx - r - 26, cy, rr, -0.9, 0.9); ctx.stroke();
    }
    // package
    ctx.fillStyle = C.panelHi; ctx.strokeStyle = C.lineHi; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.roundRect(cx - r, cy - r * 0.85, r * 2, r * 1.7, 8); ctx.fill(); ctx.stroke();
    // backplate
    ctx.strokeStyle = C.muted;
    ctx.beginPath(); ctx.moveTo(cx - r * 0.6, cy + 12); ctx.lineTo(cx + r * 0.6, cy + 12); ctx.stroke();
    for (var p = -4; p <= 4; p++) {
      ctx.fillStyle = C.bg;
      ctx.beginPath(); ctx.arc(cx + p * 9, cy + 12, 1.8, 0, 6.3); ctx.fill();
    }
    // diaphragm
    ctx.strokeStyle = C.signal; ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.6, cy - 14);
    ctx.quadraticCurveTo(cx, cy - 14 + wob, cx + r * 0.6, cy - 14);
    ctx.stroke();
    label(ctx, 'diaphragm', cx, cy - r * 0.85 - 10, C.signal, 11, 'center');
    label(ctx, 'backplate', cx, cy + r * 0.85 + 20, C.muted, 11, 'center');

    arrow(ctx, cx + r + 14, cy, cx + r + 52, C.lineHi);

    // analogue trace
    var x0 = cx + r + 62, x1 = w - 26, my = cy;
    ctx.strokeStyle = App.alpha('line', 1); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0, my); ctx.lineTo(x1, my); ctx.stroke();
    ctx.strokeStyle = C.signal; ctx.lineWidth = 2.2;
    ctx.beginPath();
    for (var x = x0; x < x1; x += 1.5) {
      var u = (x - x0) / 26 - t * 4;
      var y = my - voice(u, 0) * h * 0.3;
      x === x0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    label(ctx, 'continuous voltage', x0, 26, C.signal, 12);
  }

  function drawAdc(ctx, w, h, t) {
    var x0 = 54, x1 = w - 30, cy = h * 0.52, amp = h * 0.3;
    var n = Math.max(18, Math.floor((x1 - x0) / 26));
    var step = (x1 - x0) / n;
    var shift = t * 2.2;

    ctx.strokeStyle = App.alpha('line', 1); ctx.lineWidth = 1;
    for (var g = 0; g <= 8; g++) {
      var gy = cy - amp + (g / 8) * amp * 2;
      ctx.beginPath(); ctx.moveTo(x0, gy); ctx.lineTo(x1, gy); ctx.stroke();
    }

    ctx.strokeStyle = App.alpha('signal', 0.45); ctx.lineWidth = 2;
    ctx.beginPath();
    for (var x = x0; x < x1; x += 1.5) {
      var y = cy - voice((x - x0) / 26 - shift, 0) * amp;
      x === x0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.strokeStyle = C.accent; ctx.lineWidth = 2.2;
    ctx.beginPath();
    for (var i = 0; i <= n; i++) {
      var sx = x0 + i * step;
      var raw = voice((sx - x0) / 26 - shift, 0);
      var q = Math.round(raw * 8) / 8;
      var sy = cy - q * amp;
      if (i === 0) ctx.moveTo(sx, sy); else { ctx.lineTo(sx, sy); }
      ctx.lineTo(sx + step, sy);
    }
    ctx.stroke();

    for (var j = 0; j <= n; j++) {
      var px = x0 + j * step;
      var pq = Math.round(voice((px - x0) / 26 - shift, 0) * 8) / 8;
      var py = cy - pq * amp;
      ctx.fillStyle = C.accent;
      ctx.beginPath(); ctx.arc(px, py, 2.6, 0, 6.3); ctx.fill();
      ctx.strokeStyle = App.alpha('accent', 0.25); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, cy + amp); ctx.stroke();
    }
    label(ctx, 'analogue', x0, 24, App.mix(C.signal, C.bg, 0.25), 12);
    label(ctx, 'quantised samples', x0 + 92, 24, C.accent, 12);
    label(ctx, '16 bit', 18, cy - amp + 6, C.muted, 11);
    label(ctx, '0', 18, cy + amp, C.muted, 11);
  }

  function drawCodec(ctx, w, h, t) {
    var mid = h * 0.52;
    var boxW = Math.min(w * 0.26, 210);
    // left: fat raw stream
    drawStream(ctx, 40, mid, boxW, 42, C.signal, 0.9, t, 'raw  256 kbit/s');
    // codec box
    var bx = 40 + boxW + 44, bw = Math.min(140, w * 0.18);
    ctx.fillStyle = C.panelHi; ctx.strokeStyle = C.accent; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.roundRect(bx, mid - 46, bw, 92, 12); ctx.fill(); ctx.stroke();
    label(ctx, 'EVS', bx + bw / 2, mid - 8, C.accent, 18, 'center');
    label(ctx, 'vocal-tract model', bx + bw / 2, mid + 14, C.muted, 10.5, 'center');
    arrow(ctx, 40 + boxW + 8, mid, bx - 6, C.lineHi);
    var rx = bx + bw + 30;
    arrow(ctx, bx + bw + 6, mid, rx + 14, C.lineHi);
    drawStream(ctx, rx + 24, mid, Math.max(60, w - rx - 60), 10, C.accent, 0.35, t, 'coded  ~13 kbit/s');
    label(ctx, '20 ms of speech → about 32 bytes', w / 2, h - 16, C.muted, 12, 'center');
  }

  function drawStream(ctx, x, cy, width, thick, color, density, t, text) {
    var bars = Math.max(6, Math.floor(width / (thick > 20 ? 7 : 16)));
    for (var i = 0; i < bars; i++) {
      var bx = x + (i / bars) * width;
      var ph = (i * 0.7 + t * 3) % 6.283;
      var hgt = thick * (0.4 + 0.6 * Math.abs(Math.sin(ph)));
      ctx.fillStyle = App.mix(C.line, color, 0.35 + 0.65 * Math.abs(Math.sin(ph)));
      ctx.fillRect(bx, cy - hgt, Math.max(2, width / bars - 3), hgt * 2);
    }
    label(ctx, text, x, cy - thick - 16, color, 12);
  }

  function drawPackets(ctx, w, h, t) {
    var rows = 3, cy = h * 0.5;
    for (var r = 0; r < rows; r++) {
      var y = cy - 46 + r * 46;
      var pw = 118, gap = 26;
      var off = ((t * 58) + r * 40) % (pw + gap);
      for (var x = -pw + off; x < w; x += pw + gap) {
        var alpha = App.clamp(1 - Math.abs(x + pw / 2 - w * 0.5) / (w * 0.7), 0.28, 1);
        ctx.globalAlpha = alpha;
        // headers
        ctx.fillStyle = App.alpha('accent-2', 0.85); ctx.fillRect(x, y - 13, 20, 26);
        ctx.fillStyle = App.alpha('violet', 0.85); ctx.fillRect(x + 21, y - 13, 16, 26);
        ctx.fillStyle = App.alpha('muted', 0.7); ctx.fillRect(x + 38, y - 13, 12, 26);
        // payload
        ctx.fillStyle = App.alpha('accent', 0.5); ctx.fillRect(x + 51, y - 13, pw - 51, 26);
        ctx.strokeStyle = C.lineHi; ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y - 13.5, pw, 27);
        ctx.globalAlpha = 1;
      }
    }
    var lx = 24, ly = h - 16;
    swatch(ctx, lx, ly, App.alpha('accent-2', 0.85), 'IP');
    swatch(ctx, lx + 62, ly, App.alpha('violet', 0.85), 'UDP');
    swatch(ctx, lx + 134, ly, App.alpha('muted', 0.7), 'RTP');
    swatch(ctx, lx + 206, ly, App.alpha('accent', 0.5), '20 ms of your voice');
  }

  function swatch(ctx, x, y, color, text) {
    ctx.fillStyle = color; ctx.fillRect(x, y - 9, 11, 11);
    label(ctx, text, x + 16, y, C.muted, 11.5);
  }

  function drawCoding(ctx, w, h, t) {
    var cols = 24, rows = 6;
    var cw = Math.min(22, (w - 90) / cols), ch = Math.min(20, (h - 80) / rows);
    var ox = (w - cols * cw) / 2, oy = (h - rows * ch) / 2 + 6;
    var flip = Math.floor(t * 0.6) % (cols * rows);
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var idx = r * cols + c;
        var parity = c >= cols * 0.62;
        var hit = idx === flip;
        ctx.fillStyle = hit ? C.hot : (parity ? App.alpha('violet', 0.5) : App.alpha('accent', 0.42));
        ctx.fillRect(ox + c * cw, oy + r * ch, cw - 2, ch - 2);
      }
    }
    ctx.strokeStyle = C.lineHi; ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    var sx = ox + Math.floor(cols * 0.62) * cw - 1;
    ctx.beginPath(); ctx.moveTo(sx, oy - 8); ctx.lineTo(sx, oy + rows * ch + 8); ctx.stroke();
    ctx.setLineDash([]);
    label(ctx, 'your bits', ox, oy - 14, C.accent, 12);
    label(ctx, 'parity bits', sx + 8, oy - 14, C.violet, 12);
    label(ctx, 'a corrupted bit — recoverable from the parity', w / 2, oy + rows * ch + 26, C.hot, 12, 'center');
  }

  function drawQam(ctx, w, h, t) {
    var size = Math.min(h - 46, w * 0.4);
    var cx = w * 0.3, cy = h * 0.5, half = size / 2;
    ctx.strokeStyle = App.alpha('line', 1); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx - half, cy); ctx.lineTo(cx + half, cy);
    ctx.moveTo(cx, cy - half); ctx.lineTo(cx, cy + half); ctx.stroke();

    var n = 8, sp = size / n;
    var live = Math.floor(t * 3) % (n * n);
    for (var i = 0; i < n; i++) {
      for (var j = 0; j < n; j++) {
        var px = cx - half + sp * (i + 0.5);
        var py = cy - half + sp * (j + 0.5);
        var idx = j * n + i;
        var on = idx === live;
        ctx.fillStyle = on ? C.accent : App.alpha('accent', 0.28);
        ctx.beginPath(); ctx.arc(px, py, on ? 5 : 2.6, 0, 6.3); ctx.fill();
        if (on) {
          ctx.strokeStyle = App.alpha('accent', 0.4); ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(px, py, 11 + Math.sin(t * 8) * 2.5, 0, 6.3); ctx.stroke();
          ctx.strokeStyle = App.alpha('accent', 0.55);
          ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(px, py); ctx.stroke();
        }
      }
    }
    label(ctx, 'I', cx + half + 8, cy + 4, C.muted, 12);
    label(ctx, 'Q', cx - 4, cy - half - 8, C.muted, 12);
    label(ctx, '64-QAM', cx, cy + half + 22, C.accent, 13, 'center');

    var tx = w * 0.62;
    label(ctx, 'one symbol', tx, h * 0.3, C.textDim, 14);
    ctx.fillStyle = C.accent;
    ctx.font = font(22, 700, true);
    ctx.fillText('110101', tx, h * 0.3 + 30);
    label(ctx, '= 6 bits, sent as one amplitude and phase', tx, h * 0.3 + 54, C.muted, 12);
    label(ctx, 'weaker signal → fewer points → less data', tx, h * 0.3 + 78, C.muted, 12);
  }

  function drawGrid(ctx, w, h, t) {
    var cols = 20, rows = 9;
    var cw = (w - 92) / cols, ch = (h - 62) / rows;
    var ox = 70, oy = 28;
    var TONES = ['accent', 'violet', 'signal', 'good', 'accent-2'];
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var seed = Math.sin((r * 31 + c * 17 + Math.floor(t * 0.9) * 7) * 12.9898) * 43758.5453;
        var u = Math.floor((seed - Math.floor(seed)) * TONES.length);
        var mine = u === 0;
        ctx.fillStyle = mine ? C.accent : App.alpha(TONES[u], 0.26);
        ctx.fillRect(ox + c * cw, oy + r * ch, cw - 2, ch - 2);
      }
    }
    ctx.save();
    ctx.translate(18, oy + rows * ch / 2); ctx.rotate(-Math.PI / 2);
    label(ctx, 'frequency →', 0, 0, C.muted, 12, 'center');
    ctx.restore();
    label(ctx, 'time →', ox + cols * cw / 2, h - 12, C.muted, 12, 'center');
    label(ctx, 'your device', ox, 18, C.accent, 12);
    label(ctx, 'everyone else in the cell', ox + 92, 18, C.muted, 12);
  }

  function drawRf(ctx, w, h, t) {
    var cy = h * 0.5, x0 = 34, x1 = w * 0.62;
    ctx.strokeStyle = App.alpha('accent', 0.4); ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (var xa = x0; xa < x1; xa += 1.5) {
      var env = 0.35 + 0.35 * Math.abs(Math.sin((xa - x0) / 58 - t * 1.4));
      var y = cy - env * h * 0.34;
      xa === x0 ? ctx.moveTo(xa, y) : ctx.lineTo(xa, y);
    }
    ctx.stroke();
    ctx.beginPath();
    for (var xb = x0; xb < x1; xb += 1.5) {
      var env2 = 0.35 + 0.35 * Math.abs(Math.sin((xb - x0) / 58 - t * 1.4));
      var y2 = cy + env2 * h * 0.34;
      xb === x0 ? ctx.moveTo(xb, y2) : ctx.lineTo(xb, y2);
    }
    ctx.stroke();
    ctx.strokeStyle = C.accent; ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (var x = x0; x < x1; x += 1) {
      var e = 0.35 + 0.35 * Math.abs(Math.sin((x - x0) / 58 - t * 1.4));
      var yy = cy - Math.sin((x - x0) * 0.62 - t * 16) * e * h * 0.34;
      x === x0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
    }
    ctx.stroke();
    label(ctx, 'baseband envelope', x0, 24, App.mix(C.accent, C.bg, 0.35), 12);
    label(ctx, 'carrier', x0 + 150, 24, C.accent, 12);

    // PA triangle + antenna
    var px = w * 0.72, py = cy;
    ctx.fillStyle = App.alpha('signal', 0.2); ctx.strokeStyle = C.signal; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(px - 28, py - 30); ctx.lineTo(px + 26, py); ctx.lineTo(px - 28, py + 30); ctx.closePath();
    ctx.fill(); ctx.stroke();
    label(ctx, 'PA', px - 12, py + 5, C.signal, 14);
    label(ctx, '≤ 200 mW', px - 2, py + 52, C.muted, 11.5, 'center');
    arrow(ctx, x1 + 4, cy, px - 34, C.lineHi);

    var ax = w - 54;
    ctx.strokeStyle = C.accent; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(ax, py + 34); ctx.lineTo(ax, py - 34); ctx.stroke();
    arrow(ctx, px + 30, cy, ax - 8, C.lineHi);
    for (var k = 0; k < 3; k++) {
      var rr = 12 + k * 15 + ((t * 34) % 15);
      ctx.strokeStyle = App.alpha('accent', 0.55 - k * 0.14); ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(ax, py, rr, -1.0, 1.0); ctx.stroke();
    }
  }

  function drawAir2(ctx, w, h, t) {
    var px = 62, py = h * 0.72, tx = w - 82, ty = h * 0.3;
    // phone
    ctx.fillStyle = C.panelHi; ctx.strokeStyle = C.lineHi; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.roundRect(px - 13, py - 24, 26, 48, 5); ctx.fill(); ctx.stroke();
    // tower
    ctx.strokeStyle = C.accent2; ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(tx - 16, ty + 74); ctx.lineTo(tx, ty); ctx.lineTo(tx + 16, ty + 74);
    ctx.moveTo(tx - 9, ty + 40); ctx.lineTo(tx + 9, ty + 40);
    ctx.stroke();
    ctx.fillStyle = C.accent2;
    ctx.beginPath(); ctx.arc(tx, ty - 4, 4, 0, 6.3); ctx.fill();

    // buildings that create the reflected paths
    ctx.fillStyle = App.alpha('line-hi', 0.55);
    ctx.fillRect(w * 0.34, h * 0.08, 46, h * 0.3);
    ctx.fillRect(w * 0.54, h * 0.62, 56, h * 0.3);

    var paths = [
      { via: null, lag: 0, a: 0.95 },
      { via: { x: w * 0.36, y: h * 0.32 }, lag: 0.33, a: 0.5 },
      { via: { x: w * 0.57, y: h * 0.66 }, lag: 0.62, a: 0.38 }
    ];
    paths.forEach(function (p, i) {
      ctx.strokeStyle = App.alpha(i === 0 ? 'accent' : 'violet', p.a * 0.8);
      ctx.lineWidth = i === 0 ? 2 : 1.4;
      ctx.setLineDash(i === 0 ? [] : [6, 5]);
      ctx.beginPath(); ctx.moveTo(px + 14, py - 6);
      if (p.via) ctx.lineTo(p.via.x, p.via.y);
      ctx.lineTo(tx - 6, ty + 12); ctx.stroke();
      ctx.setLineDash([]);
      // the travelling packet
      var u = ((t * 0.55 + p.lag) % 1);
      var pos = p.via ? segPos(px + 14, py - 6, p.via.x, p.via.y, tx - 6, ty + 12, u)
                      : lerpPt(px + 14, py - 6, tx - 6, ty + 12, u);
      ctx.fillStyle = i === 0 ? C.accent : C.violet;
      ctx.globalAlpha = p.a;
      ctx.beginPath(); ctx.arc(pos.x, pos.y, i === 0 ? 4.5 : 3.2, 0, 6.3); ctx.fill();
      ctx.globalAlpha = 1;
    });
    label(ctx, 'direct path', px + 6, py + 44, C.accent, 12);
    label(ctx, 'reflections arrive late — and are used, not discarded', w / 2, h - 12, C.violet, 12, 'center');
  }

  function lerpPt(x1, y1, x2, y2, u) { return { x: App.lerp(x1, x2, u), y: App.lerp(y1, y2, u) }; }
  function segPos(x1, y1, mx, my, x2, y2, u) {
    return u < 0.5 ? lerpPt(x1, y1, mx, my, u * 2) : lerpPt(mx, my, x2, y2, (u - 0.5) * 2);
  }

  function drawCore(ctx, w, h, t) {
    var nodes = [
      { x: 0.08, y: 0.5, label: 'tower', c: 'accent-2' },
      { x: 0.30, y: 0.5, label: 'backhaul', c: 'muted' },
      { x: 0.52, y: 0.32, label: 'core: who are you?', c: 'violet' },
      { x: 0.52, y: 0.70, label: 'IMS: find the callee', c: 'signal' },
      { x: 0.76, y: 0.5, label: 'internet', c: 'accent' },
      { x: 0.94, y: 0.5, label: 'them', c: 'good' }
    ];
    var links = [[0, 1], [1, 2], [1, 3], [2, 4], [3, 4], [4, 5]];
    links.forEach(function (l, i) {
      var a = nodes[l[0]], b = nodes[l[1]];
      ctx.strokeStyle = App.alpha('line-hi', 0.9); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(a.x * w, a.y * h); ctx.lineTo(b.x * w, b.y * h); ctx.stroke();
      var u = ((t * 0.5 + i * 0.16) % 1);
      var p = lerpPt(a.x * w, a.y * h, b.x * w, b.y * h, u);
      ctx.fillStyle = C.accent;
      ctx.globalAlpha = Math.sin(u * Math.PI);
      ctx.beginPath(); ctx.arc(p.x, p.y, 3.4, 0, 6.3); ctx.fill();
      ctx.globalAlpha = 1;
    });
    nodes.forEach(function (n) {
      var x = n.x * w, y = n.y * h;
      ctx.fillStyle = C.panel; ctx.strokeStyle = C[n.c.replace(/-(\w)/g, function (_, c) { return c.toUpperCase(); })] || C.muted;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 13, 0, 6.3); ctx.fill(); ctx.stroke();
      label(ctx, n.label, x, y + 30, C.muted, 11, 'center');
    });
  }

  function drawOut(ctx, w, h, t) {
    var cx = w * 0.74, cy = h * 0.5;
    var x0 = 40, x1 = w * 0.52;
    ctx.strokeStyle = C.accent; ctx.lineWidth = 2;
    ctx.beginPath();
    for (var x = x0; x < x1; x += 1.5) {
      var y = cy - voice((x - x0) / 26 - t * 4, 0) * h * 0.3;
      x === x0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    label(ctx, 'rebuilt waveform', x0, 26, C.accent, 12);
    arrow(ctx, x1 + 8, cy, cx - 46, C.lineHi);

    // speaker cone
    var wob = Math.sin(t * 13) * 3;
    ctx.fillStyle = App.alpha('good', 0.18); ctx.strokeStyle = C.good; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 34, cy - 12); ctx.lineTo(cx - 34, cy + 12);
    ctx.lineTo(cx - 8 + wob, cy + 30); ctx.lineTo(cx - 8 + wob, cy - 30);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    for (var i = 0; i < 4; i++) {
      var rr = 20 + i * 20 + ((t * 52) % 20);
      ctx.strokeStyle = App.alpha('good', 0.6 - i * 0.12); ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.arc(cx - 6, cy, rr, -0.85, 0.85); ctx.stroke();
    }
    label(ctx, 'about a tenth of a second after you spoke', w / 2, h - 14, C.muted, 12, 'center');
  }

  App.register('journey', build);
})(window.PhoneApp);
