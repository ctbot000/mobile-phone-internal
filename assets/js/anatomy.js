/* ==========================================================================
   anatomy.js — the exploded layer stack.

   Drawn as flat isometric slabs, painted back-to-front (bottom-most physical
   layer first). SVG has no z-index, so document order is the only depth cue
   there is, and labels live in their own group appended last.
   ========================================================================== */
(function (App) {
  'use strict';

  var LAYERS = [
    {
      name: 'Cover glass',
      sub: 'the only part you ever touch',
      tone: 'accent',
      kicker: 'Layer 1 · protection',
      body: 'Aluminosilicate glass with the sodium ions near the surface swapped for larger potassium ions in a hot salt bath. The oversized ions no longer fit, so the outer skin is left in permanent compression and a crack has to overcome that before it can even start. On top sits a fluorinated coating a few molecules thick — the reason fingerprints wipe off.',
      specs: [['Thickness', '0.5–0.8 mm'], ['Compressive layer', '~30–50 µm deep'], ['Hardness', '~6 Mohs']]
    },
    {
      name: 'Touch digitizer',
      sub: 'a grid of invisible wires',
      tone: 'accent-2',
      kicker: 'Layer 2 · sensing',
      body: 'Two sets of transparent electrodes cross at right angles, either indium tin oxide or a fine metal mesh. A controller drives one set and listens on the other; your finger diverts a little of the field at the crossing beneath it. In modern phones this layer is not a separate sheet at all — it is built into the display stack itself.',
      specs: [['Electrode pitch', '4–5 mm'], ['Change per touch', 'a few fF'], ['Scan rate', '60–240 Hz']]
    },
    {
      name: 'Display panel',
      sub: 'millions of individual lamps',
      tone: 'violet',
      kicker: 'Layer 3 · output',
      body: 'An OLED has no backlight: every subpixel is its own organic diode, driven by a thin-film transistor built onto the substrate. Black pixels are simply switched off, which is why the panel costs almost nothing to display a dark interface. Low-temperature polycrystalline oxide backplanes let the refresh rate collapse to 1 Hz on a still image and jump to 120 Hz when you scroll.',
      specs: [['Subpixels', '~6–8 million'], ['Refresh', '1–120 Hz'], ['Peak brightness', '1000–2000+ nits']]
    },
    {
      name: 'Midframe',
      sub: 'skeleton, antenna and heatsink at once',
      tone: 'muted',
      kicker: 'Layer 4 · structure',
      body: 'A machined aluminium or stainless frame that everything else bolts to. It does three jobs: it stops the phone flexing, it carries heat away from the chip through graphite sheets or a vapour chamber, and its metal segments — separated by plastic slots you can see as lines in the rail — are the antennas.',
      specs: [['Material', 'Al 7000-series / steel / Ti'], ['Heat path', 'graphite or vapour chamber'], ['Antenna slots', 'visible in the rail']]
    },
    {
      name: 'Logic board',
      sub: 'the whole computer, twice folded',
      tone: 'good',
      kicker: 'Layer 5 · computation',
      body: 'A high-density interconnect board of ten or more laminated copper layers, often two boards stacked face to face to save floor area. The SoC sits under the RAM in a package-on-package sandwich, next to flash storage, the power management IC, and a cluster of RF front-end modules — each amplifier, filter and switch matched to one band.',
      specs: [['Copper layers', '10–14'], ['Track pitch', 'down to ~30 µm'], ['Main parts', 'SoC · RAM · NAND · PMIC · RF']]
    },
    {
      name: 'Battery',
      sub: 'half the weight, most of the volume',
      tone: 'signal',
      kicker: 'Layer 6 · energy',
      body: 'A lithium-ion pouch cell: layers of graphite anode, polymer separator and lithium-metal-oxide cathode wound or stacked flat. Charging drives lithium ions into the graphite; discharging lets them travel back. It is the one component that wears out on a schedule you can feel — capacity fades with every full cycle and, faster, with heat.',
      specs: [['Nominal voltage', '3.8–3.85 V'], ['Energy', '15–20 Wh'], ['Useful cycles', '~500–1000']]
    },
    {
      name: 'Cameras, haptics, speakers',
      sub: 'the moving parts',
      tone: 'hot',
      kicker: 'Layer 7 · transducers',
      body: 'Each camera is its own stack: lens barrel, an actuator that shifts either the lens or the sensor to cancel your hand shake, and an image sensor feeding raw pixels to the chip. Beside them sits a linear resonant actuator — a mass on a spring, driven by a coil — that produces a tap you feel rather than a buzz you hear.',
      specs: [['Stabilisation', '±1–2° of shake'], ['Haptic response', '~10 ms'], ['Sensor pixels', '0.6–2 µm each']]
    },
    {
      name: 'Back cover',
      sub: 'transparent to radio on purpose',
      tone: 'accent',
      kicker: 'Layer 8 · the radio window',
      body: 'Glass or plastic, not metal, because a metal back would short out everything underneath it. Behind it sit the wireless charging coil, the NFC loop antenna, and — on phones that support millimetre wave — small antenna arrays that must be able to see out. It is also where the wireless charger dumps its waste heat.',
      specs: [['Qi charging', '5–15 W typical'], ['NFC', '13.56 MHz'], ['Why glass', 'metal blocks the coil']]
    }
  ];

  /* isometric basis */
  var U = { x: 1, y: 0.34 };        // along the phone's length
  var V = { x: -0.66, y: 0.26 };    // across its width
  var HL = 118, HW = 56, TH = 12;   // half-length, half-width, slab thickness
  var CX = 250, TOP = 86, GAP = 54;
  var VB_W = 760, VB_H = 556;

  function corner(cx, cy, a, b) {
    return { x: cx + U.x * a + V.x * b, y: cy + U.y * a + V.y * b };
  }
  function pts(list) {
    return list.map(function (p) { return p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join(' ');
  }

  var selected = 0;
  var slabs = [], labels = [], detailHost = null;

  function build() {
    var host = document.getElementById('anatomySvgHost');
    detailHost = document.getElementById('anatomyDetail');
    if (!host || !detailHost) return;

    var svg = App.svgEl('svg', {
      viewBox: '0 0 ' + VB_W + ' ' + VB_H,
      role: 'group',
      'aria-label': 'Exploded view of a phone: eight layers from cover glass to back cover'
    });

    var slabGroup = App.svgEl('g', {});
    var labelGroup = App.svgEl('g', {});

    // Back-to-front: the lowest layer on screen is the farthest from the eye.
    for (var i = LAYERS.length - 1; i >= 0; i--) slabGroup.appendChild(makeSlab(i));
    for (var j = 0; j < LAYERS.length; j++) labelGroup.appendChild(makeLabel(j));

    svg.appendChild(slabGroup);
    svg.appendChild(labelGroup);   // labels last: nothing may paint over them
    host.innerHTML = '';
    host.appendChild(svg);

    svg.addEventListener('keydown', onKey);
    select(0);
  }

  function makeSlab(i) {
    var L = LAYERS[i];
    var cy = TOP + i * GAP;
    var p0 = corner(CX, cy, -HL, -HW);
    var p1 = corner(CX, cy, HL, -HW);
    var p2 = corner(CX, cy, HL, HW);
    var p3 = corner(CX, cy, -HL, HW);

    var g = App.svgEl('g', {
      class: 'layer-slab', tabindex: '0', role: 'button',
      'aria-label': L.name + ': ' + L.sub, 'data-i': String(i)
    });

    // Two visible side faces give the slab its thickness, drawn before the top.
    var right = App.svgEl('polygon', {
      points: pts([p1, p2, { x: p2.x, y: p2.y + TH }, { x: p1.x, y: p1.y + TH }])
    });
    right.style.fill = 'var(--' + L.tone + ')';
    right.style.opacity = '0.30';

    var front = App.svgEl('polygon', {
      points: pts([p2, p3, { x: p3.x, y: p3.y + TH }, { x: p2.x, y: p2.y + TH }])
    });
    front.style.fill = 'var(--' + L.tone + ')';
    front.style.opacity = '0.18';

    var top = App.svgEl('polygon', { class: 'slab-face', points: pts([p0, p1, p2, p3]) });
    top.style.fill = 'var(--' + L.tone + ')';
    top.style.fillOpacity = '0.19';

    g.appendChild(right);
    g.appendChild(front);
    g.appendChild(top);

    g.addEventListener('click', function () { select(i); });
    slabs[i] = { g: g, cy: cy, tip: p1 };
    return g;
  }

  function makeLabel(i) {
    var L = LAYERS[i];
    var s = slabs[i];
    var y = s.tip.y;
    var g = App.svgEl('g', { class: 'layer-label', 'data-i': String(i) });

    var line = App.svgEl('line', {
      class: 'layer-leader', x1: (s.tip.x + 6).toFixed(1), y1: y.toFixed(1), x2: '452', y2: y.toFixed(1)
    });
    var dot = App.svgEl('circle', { cx: '452', cy: y.toFixed(1), r: '2.6' });
    dot.style.fill = 'var(--' + L.tone + ')';

    var name = App.svgEl('text', { class: 'layer-name', x: '464', y: (y - 3).toFixed(1) });
    name.textContent = L.name;
    var sub = App.svgEl('text', { class: 'layer-sub', x: '464', y: (y + 13).toFixed(1) });
    sub.textContent = L.sub;
    sub.style.fontSize = '11px';
    sub.style.fill = 'var(--muted)';

    g.appendChild(line); g.appendChild(dot); g.appendChild(name); g.appendChild(sub);
    g.addEventListener('click', function () { select(i); });
    labels[i] = g;
    return g;
  }

  function select(i) {
    selected = App.clamp(i, 0, LAYERS.length - 1);
    // Push to the DOM here, in the handler that changed the state — not from a
    // frame callback that a hidden tab would never deliver.
    for (var k = 0; k < LAYERS.length; k++) {
      var on = k === selected;
      slabs[k].g.classList.toggle('is-on', on);
      labels[k].classList.toggle('is-on', on);
      slabs[k].g.style.transform = on ? 'translate(42px,-16px)' : 'translate(0px,0px)';
      slabs[k].g.style.opacity = (selected === -1 || on) ? '1' : '0.72';
    }
    renderDetail(LAYERS[selected]);
  }

  function renderDetail(L) {
    var specs = L.specs.map(function (s) {
      return '<div class="spec"><dt>' + s[0] + '</dt><dd>' + s[1] + '</dd></div>';
    }).join('');
    detailHost.innerHTML =
      '<p class="kicker">' + L.kicker + '</p>' +
      '<h3>' + L.name + '</h3>' +
      '<p>' + L.body + '</p>' +
      '<dl class="spec-grid">' + specs + '</dl>';
  }

  function onKey(ev) {
    var k = ev.key;
    if (k === 'ArrowDown' || k === 'ArrowRight') { select(selected + 1); focusSel(ev); }
    else if (k === 'ArrowUp' || k === 'ArrowLeft') { select(selected - 1); focusSel(ev); }
    else if (k === 'Enter' || k === ' ') {
      var t = ev.target.closest && ev.target.closest('.layer-slab');
      if (t) { select(parseInt(t.getAttribute('data-i'), 10)); ev.preventDefault(); }
    }
  }
  function focusSel(ev) {
    ev.preventDefault();
    slabs[selected].g.focus();
  }

  App.register('anatomy', build);
})(window.PhoneApp);
