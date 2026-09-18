# How a Mobile Phone Works

An interactive, visual explainer for what is actually happening inside a
smartphone — from the glass you touch down to the transistors, and from your
voice to a radio wave and back again.

**Live site → https://ctbot000.github.io/mobile-phone-internal/**

## What's in it

Seven things you can poke at, not just read:

| Section | What you can do |
| --- | --- |
| **The stack, layer by layer** | Pull an exploded phone apart, one slab at a time — cover glass, digitizer, OLED, midframe, logic board, battery, transducers, back cover. |
| **Your voice, all the way there** | Step or auto-play through twelve stages, from a pressure wave in air to someone else's eardrum. Each stage draws what the signal looks like at that point: sampling staircases, QAM constellations, the OFDMA resource grid, multipath. |
| **Why your phone carries so many radios** | Drag a carrier frequency from 600 MHz to 39 GHz and watch the wavelength, cell radius, bandwidth and wall penetration move together — the wave is drawn to scale against a phone. |
| **Cells and handover** | Drag a phone across a live signal map, or let it walk. Measurement reports update continuously and the network hands you over using a real A3-style rule: a neighbour must beat the serving cell by a hysteresis margin and hold it for a time-to-trigger. |
| **How the glass feels your finger** | A capacitive sensing grid scanned at 120 Hz. Watch the capacitance bump, the threshold, the centroid interpolation, and the single coordinate pair the OS is finally handed. |
| **One chip, a dozen specialists** | Pick a workload — idle, scrolling, a photo, a video call, a game, navigation — and watch which blocks of the SoC wake up and how hard. |
| **From your tap to the transistor** | Eight layers of software, including the one running on a processor your operating system cannot see. |

## Running it

There is no build step and no dependencies. Any static server will do:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## How it's built

Plain HTML, CSS and a handful of vanilla JavaScript modules — no framework, no
bundler, no CDN, no trackers. Each section is one file under `assets/js/`,
registered with a tiny shared runtime in `app.js` that owns the colour tokens,
canvas sizing and a single animation loop.

A few deliberate choices:

- **Colours are read out of computed style, once.** A canvas 2D context cannot
  resolve `var(--x)` — it silently keeps the previous value — so tokens are
  resolved to literal strings and re-read when the theme changes.
- **Everything is built eagerly at start-up**, never on the first animation
  frame. A page opened in a background tab gets no frames, and a build gated on
  one never happens.
- **Discrete state changes paint from the handler that made them.** The frame
  loop only animates what genuinely changes every frame.
- **Animation is wall-clock driven and clamped**, so a throttled tab does not
  leave anything frozen mid-flight or teleport it after a stall.
- Dark and light themes, keyboard navigation, `prefers-reduced-motion`, and no
  horizontal overflow down to 375 px.

```
index.html
assets/
  css/style.css
  js/app.js        shared: theme tokens, canvas fitting, one rAF loop, nav
     anatomy.js    exploded layer stack (SVG)
     journey.js    twelve-stage signal journey (canvas)
     spectrum.js   frequency trade-off explorer (canvas)
     cells.js      cell map, RSRP model, handover (canvas)
     touch.js      capacitive sensing grid (canvas)
     soc.js        SoC block diagram and workloads (SVG)
     stack.js      software layer accordion
```

## A note on the numbers

Every figure is a typical, rounded, order-of-magnitude value for current
consumer hardware and cellular networks. The radio and handover models are
illustrative — the right shape and the right trade-offs, not a link budget. It
is not a spec sheet for any particular device.

## Licence

MIT — see [LICENSE](LICENSE).
