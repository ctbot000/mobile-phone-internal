/* ==========================================================================
   soc.js — the die, and who wakes up for which job.
   ========================================================================== */
(function (App) {
  'use strict';

  var VB_W = 620, VB_H = 452;

  var BLOCKS = [
    { id: 'prime', name: 'Prime core', sub: '1 × big CPU', tone: 'accent', x: 36, y: 52, w: 118, h: 78,
      body: 'One very wide, very fast core kept for whatever is blocking you right now — the frame you are waiting for, the tap you just made. It is deliberately inefficient per unit of work; its job is to finish quickly and then stop.' },
    { id: 'perf', name: 'Performance cores', sub: '2–3 × mid CPU', tone: 'accent', x: 162, y: 52, w: 158, h: 78,
      body: 'The middle of the big.LITTLE arrangement. Fast enough for real work, cheap enough to keep several of them busy at once when an app genuinely parallelises.' },
    { id: 'eff', name: 'Efficiency cores', sub: '4 × little CPU', tone: 'good', x: 328, y: 52, w: 150, h: 78,
      body: 'Small, slow, and astonishingly frugal. Nearly everything a phone does while you are not looking at it — syncing, notifications, timers — runs here, and the scheduler only promotes a thread to a bigger core when it stalls the user.' },
    { id: 'sec', name: 'Secure enclave', sub: 'its own CPU + key store', tone: 'hot', x: 486, y: 52, w: 98, h: 78,
      body: 'A separate processor with its own memory, its own boot chain and keys fused into the silicon at manufacture. Your fingerprint and face data are matched inside it; the main OS never sees them, only a yes or no.' },
    { id: 'gpu', name: 'GPU', sub: 'hundreds of shader lanes', tone: 'violet', x: 36, y: 144, w: 214, h: 98,
      body: 'Draws every pixel of every frame — not just games. The interface itself is composited on the GPU, which is why a phone with a broken GPU driver does not show a slow interface, it shows nothing.' },
    { id: 'npu', name: 'NPU', sub: 'matrix multiply engine', tone: 'accent-2', x: 258, y: 144, w: 160, h: 98,
      body: 'Fixed-function hardware for the one operation neural networks are made of. It trades flexibility for roughly an order of magnitude better efficiency than the GPU on the same model — which is what makes on-device speech, translation and computational photography possible on a battery.' },
    { id: 'isp', name: 'ISP', sub: 'image signal processor', tone: 'signal', x: 426, y: 144, w: 158, h: 98,
      body: 'Between the camera sensor and anything you would recognise as a photo sits a pipeline of demosaicing, noise reduction, lens correction, tone mapping and multi-frame fusion — running at gigapixels per second, because it must keep up with a live preview while you frame the shot.' },
    { id: 'video', name: 'Video codec', sub: 'encode / decode', tone: 'violet', x: 36, y: 256, w: 152, h: 78,
      body: 'Encoding H.265 or AV1 in software would flatten the battery in an hour. This block does it in dedicated logic at a fraction of the energy, which is why a phone can record 4K for as long as it has storage.' },
    { id: 'display', name: 'Display engine', sub: 'composition + scan-out', tone: 'accent', x: 196, y: 256, w: 152, h: 78,
      body: 'Takes the finished layers, blends them, applies colour management, and pushes pixels to the panel on a strict schedule. Miss its deadline and the user sees a dropped frame — which is the one bug nobody forgives.' },
    { id: 'dsp', name: 'DSP & sensor hub', sub: 'always-on', tone: 'good', x: 356, y: 256, w: 228, h: 78,
      body: 'A tiny low-power core that never sleeps. It counts your steps, watches the accelerometer for a wrist raise, and listens for a wake word — all without waking the main CPU, which would cost a hundred times more energy.' },
    { id: 'cache', name: 'System cache', sub: 'shared SRAM', tone: 'muted', x: 36, y: 348, w: 258, h: 66,
      body: 'A pool of fast memory that every block shares. Its real purpose is energy, not speed: fetching a byte from external DRAM costs vastly more power than finding it here, so a good cache is worth more battery than a faster core.' },
    { id: 'mem', name: 'Memory controller', sub: 'to LPDDR', tone: 'muted', x: 302, y: 348, w: 136, h: 66,
      body: 'The gate to main memory. On a phone the DRAM is usually stacked directly on top of the SoC package, millimetres away, because every millimetre of trace costs energy and latency.' },
    { id: 'modem', name: 'Modem', sub: 'cellular baseband', tone: 'accent-2', x: 446, y: 348, w: 138, h: 66,
      body: 'Sometimes on this die, sometimes a chip of its own. Either way it runs its own real-time operating system and its own firmware, keeps its own timing to the network, and talks to your OS only through a message interface.' }
  ];

  var WORKLOADS = [
    { id: 'idle', name: 'Idle in your pocket', power: '~15–40 mW',
      note: 'Almost the whole die is powered down. What is left awake is the sensor hub and enough of the modem to stay registered with the network and hear a page.',
      load: { eff: 0.12, dsp: 0.34, modem: 0.26, cache: 0.06, mem: 0.05 } },
    { id: 'scroll', name: 'Scrolling a feed', power: '~1.5–3 W',
      note: 'The classic mixed workload: a little CPU to run the app, a lot of GPU and display to composite and scan out at 120 Hz, and a modem pulling images in the background.',
      load: { prime: 0.32, perf: 0.5, eff: 0.6, gpu: 0.7, display: 0.92, cache: 0.7, mem: 0.62, modem: 0.45, npu: 0.1, dsp: 0.2 } },
    { id: 'photo', name: 'Taking a photo', power: '~3–5 W in bursts',
      note: 'The ISP and NPU dominate. A single press captures a burst of frames, aligns and fuses them, and runs several networks over the result — all before the shutter sound finishes.',
      load: { isp: 1.0, npu: 0.82, prime: 0.62, perf: 0.5, gpu: 0.42, cache: 0.84, mem: 0.9, display: 0.6, video: 0.2, dsp: 0.3 } },
    { id: 'call', name: 'Video call', power: '~2.5–4 W',
      note: 'Almost every block at once, and the hardest thermal case for a thin phone: camera in, codec both ways, modem at full duty, screen on the whole time.',
      load: { modem: 0.92, isp: 0.72, video: 0.9, dsp: 0.6, npu: 0.4, display: 0.72, perf: 0.55, eff: 0.6, cache: 0.62, mem: 0.7, gpu: 0.35 } },
    { id: 'game', name: 'A 3D game', power: '~5–8 W → throttling',
      note: 'The GPU and memory system are pinned, and this is where a phone runs out of physics: there is nowhere for 6 watts of heat to go, so the frequency comes down within minutes.',
      load: { gpu: 1.0, prime: 0.85, perf: 0.9, eff: 0.5, cache: 0.9, mem: 0.96, display: 1.0, modem: 0.3, dsp: 0.2, video: 0.1 } },
    { id: 'nav', name: 'Navigating', power: '~2–3.5 W',
      note: 'GNSS and the inertial sensors run continuously on the low-power core, the map is redrawn on the GPU, and the modem fetches tiles and traffic. Screen-on time dominates the total.',
      load: { dsp: 0.85, gpu: 0.52, modem: 0.52, display: 0.74, perf: 0.42, eff: 0.62, cache: 0.5, mem: 0.52, npu: 0.2 } }
  ];

  var nodes = {}, current = WORKLOADS[1], selected = null, detail;
  var load = {}, target = {};

  function build() {
    var host = document.getElementById('socSvgHost');
    detail = document.getElementById('socDetail');
    var wlHost = document.getElementById('socWorkloads');
    if (!host || !detail || !wlHost) return;

    var svg = App.svgEl('svg', {
      viewBox: '0 0 ' + VB_W + ' ' + VB_H, role: 'group',
      'aria-label': 'Block diagram of a phone system-on-chip'
    });

    var die = App.svgEl('rect', { x: 18, y: 26, width: VB_W - 36, height: VB_H - 52, rx: 14 });
    die.style.fill = 'var(--bg)';
    die.style.stroke = 'var(--line-hi)';
    die.style.strokeWidth = '1.6';
    svg.appendChild(die);

    var cap = App.svgEl('text', { x: 28, y: 18 });
    cap.textContent = 'system-on-chip · ~100 mm² · tens of billions of transistors';
    cap.style.fontSize = '11px';
    cap.style.fill = 'var(--muted)';
    svg.appendChild(cap);

    BLOCKS.forEach(function (b) {
      load[b.id] = 0; target[b.id] = 0;
      var g = App.svgEl('g', {
        class: 'soc-block', tabindex: '0', role: 'button',
        'aria-label': b.name + ': ' + b.sub, 'data-id': b.id
      });
      var rect = App.svgEl('rect', { class: 'blk', x: b.x, y: b.y, width: b.w, height: b.h, rx: 9 });

      var glow = App.svgEl('rect', { class: 'glow', x: b.x, y: b.y, width: b.w, height: b.h, rx: 9 });
      glow.style.fill = 'var(--' + b.tone + ')';
      glow.style.fillOpacity = '0';
      glow.style.pointerEvents = 'none';

      var name = App.svgEl('text', { class: 'blk-name', x: b.x + 12, y: b.y + 24 });
      name.textContent = b.name;
      var sub = App.svgEl('text', { class: 'blk-sub', x: b.x + 12, y: b.y + 40 });
      sub.textContent = b.sub;

      var track = App.svgEl('rect', { x: b.x + 12, y: b.y + b.h - 16, width: b.w - 24, height: 5, rx: 2.5 });
      track.style.fill = 'var(--line)';
      var bar = App.svgEl('rect', { class: 'bar', x: b.x + 12, y: b.y + b.h - 16, width: 0, height: 5, rx: 2.5 });
      bar.style.fill = 'var(--' + b.tone + ')';

      g.appendChild(rect); g.appendChild(glow);
      g.appendChild(name); g.appendChild(sub);
      g.appendChild(track); g.appendChild(bar);
      g.addEventListener('click', function () { selectBlock(b.id); });
      g.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); selectBlock(b.id); }
      });
      svg.appendChild(g);
      nodes[b.id] = { g: g, glow: glow, bar: bar, b: b };
    });

    host.innerHTML = '';
    host.appendChild(svg);

    wlHost.innerHTML = '';
    WORKLOADS.forEach(function (wl) {
      var b = App.el('button', 'wl-btn', wl.name);
      b.type = 'button';
      b.addEventListener('click', function () { setWorkload(wl); });
      wl.node = b;
      wlHost.appendChild(b);
    });

    App.addTicker(tick);
    setWorkload(WORKLOADS[1]);
  }

  function setWorkload(wl) {
    current = wl;
    WORKLOADS.forEach(function (x) { x.node.classList.toggle('is-on', x === wl); });
    BLOCKS.forEach(function (b) { target[b.id] = wl.load[b.id] || 0; });
    renderDetail();
  }

  function selectBlock(id) {
    selected = selected === id ? null : id;
    BLOCKS.forEach(function (b) { nodes[b.id].g.classList.toggle('is-on', b.id === selected); });
    renderDetail();
  }

  function renderDetail() {
    if (selected) {
      var b = BLOCKS.filter(function (x) { return x.id === selected; })[0];
      var l = Math.round((current.load[b.id] || 0) * 100);
      detail.innerHTML =
        '<h3>' + b.name + '</h3>' +
        '<p class="note" style="margin-top:-.4rem">' + b.sub + '</p>' +
        '<p>' + b.body + '</p>' +
        '<div class="load-line"><div class="metric-label"><span>Busy during “' + current.name + '”</span><b>' + l + '%</b></div>' +
        '<div class="meter cap"><i style="width:' + l + '%"></i></div></div>' +
        '<p class="note">Click the block again to go back to the workload view.</p>';
    } else {
      var busy = BLOCKS.filter(function (b) { return (current.load[b.id] || 0) > 0.35; })
                       .map(function (b) { return b.name; });
      detail.innerHTML =
        '<h3>' + current.name + '</h3>' +
        '<p>' + current.note + '</p>' +
        '<div class="spec-grid">' +
          '<div class="spec"><dt>Typical draw</dt><dd>' + current.power + '</dd></div>' +
          '<div class="spec"><dt>Blocks busy</dt><dd>' + busy.length + ' of ' + BLOCKS.length + '</dd></div>' +
        '</div>' +
        '<p class="note">' + (busy.length ? 'Carrying it: ' + busy.join(', ') + '.' : 'Nearly everything is powered down.') +
        ' Click any block for what it does.</p>';
    }
  }

  function tick(dt, now) {
    var k = Math.min(1, dt / 220);
    var t = (now || 0) / 1000;
    BLOCKS.forEach(function (b) {
      load[b.id] += (target[b.id] - load[b.id]) * k;
      var n = nodes[b.id];
      var v = load[b.id];
      // a little jitter so a busy block looks busy rather than merely filled
      var jitter = v > 0.02 ? (0.92 + 0.08 * Math.sin(t * 6 + b.x * 0.05)) : 0;
      n.bar.setAttribute('width', (Math.max(0, v * jitter) * (b.w - 24)).toFixed(1));
      n.glow.style.fillOpacity = (v * jitter * 0.17).toFixed(3);
    });
  }

  App.register('soc', build);
})(window.PhoneApp);
