/* ==========================================================================
   stack.js — the software layers a single tap falls through.
   Bodies are toggled with the `hidden` attribute; the reset in the stylesheet
   carries `!important`, so no layout class can quietly keep one on screen.
   ========================================================================== */
(function (App) {
  'use strict';

  var LAYERS = [
    {
      name: 'The app', ex: 'your button handler', priv: 'unprivileged',
      body: ['A tap arrives as an event object with coordinates, a timestamp and a pointer id. Your code almost never sees the raw one — by the time a handler runs, the event has already been hit-tested against a tree of views and delivered to exactly one of them.',
             'The app cannot talk to hardware at all. Everything below this line is asked for, never taken.']
    },
    {
      name: 'Framework and runtime', ex: 'SwiftUI / Jetpack Compose', priv: 'unprivileged',
      body: ['The toolkit owns the layout tree, decides which view was hit, runs your handler, and records what has to be redrawn. It also owns the render loop: your code describes a frame, the framework turns that description into draw commands.',
             'This is also where the managed runtime lives — reference counting or garbage collection, JIT or ahead-of-time compiled code, the object model your language presents.']
    },
    {
      gap: 'process boundary — a different address space'
    },
    {
      name: 'System services', ex: 'input dispatcher, compositor', priv: 'privileged user space',
      body: ['Separate processes, running with rights your app does not have. One reads the touch device and decides which window the event belongs to. Another takes every app\'s finished buffer and composes the screen from them. Others own the camera, audio routing, connectivity and power policy.',
             'Apps reach them over an IPC mechanism — Binder on Android, XPC and Mach ports on iOS — which is also where permission checks actually happen.']
    },
    {
      gap: 'syscall boundary — user space ends here'
    },
    {
      name: 'The kernel', ex: 'Linux / XNU', priv: 'supervisor',
      body: ['Schedules threads onto the right CPU cores, manages memory and page tables, owns file systems and the network stack, and arbitrates every access to a device. It is the first code that is allowed to touch hardware.',
             'It is also the main energy manager: which cores are online, at what frequency, which power domains are collapsed, and which wakelock is currently stopping the phone from suspending.']
    },
    {
      name: 'Drivers', ex: 'touch, display, GPU', priv: 'supervisor',
      body: ['The touch controller is a chip on a bus — usually I²C or SPI — that raises an interrupt when it has something to report. Its driver reads the report, converts it into an input event, and hands it up. The display driver pushes frames over MIPI DSI; the GPU driver validates and submits command buffers.',
             'Most driver bugs a user ever notices show up as something that does not move: a frozen screen, a dead touch panel, a camera that will not open.']
    },
    {
      gap: 'hardware boundary — silicon from here down'
    },
    {
      name: 'Firmware', ex: 'touch MCU, PMIC, bootloader', priv: 'signed, on-device',
      body: ['Several of the chips around the SoC are small computers with their own programs. The touch controller runs a signal-processing pipeline to turn capacitance into coordinates. The power management IC sequences a few dozen voltage rails in the right order. The bootloader chain verifies each stage before it runs it, starting from a key burned into the chip.',
             'None of this is visible to the operating system as code. It presents itself only as a device that behaves a certain way.']
    },
    {
      name: 'The baseband', ex: 'its own CPU, its own RTOS', priv: 'separate processor',
      body: ['The cellular modem is not a peripheral your OS drives — it is a second computer in the same box, running a real-time operating system and a very large signed firmware image, keeping its own timing synchronised to the network to within microseconds.',
             'The two sides exchange messages across a shared memory or PCIe interface. Your operating system asks for a connection; it does not implement one. Modern designs deliberately isolate the modem behind an IOMMU, because it is the part of the phone that processes input from the outside world at all times.']
    },
    {
      name: 'Transistors', ex: 'about 3 nm apart', priv: 'physics',
      body: ['At the bottom there is no software at all — only charge moving through channels a few dozen atoms wide, switching billions of times a second, and a battery slowly giving up the energy that moves it.']
    }
  ];

  function build() {
    var host = document.getElementById('stackWrap');
    if (!host) return;
    host.innerHTML = '';
    var buttons = [];

    LAYERS.forEach(function (L, i) {
      if (L.gap) {
        host.appendChild(App.el('div', 'stack-gap', L.gap));
        return;
      }
      var b = App.el('button', 'slayer');
      b.type = 'button';
      b.setAttribute('aria-expanded', 'false');

      var head = App.el('div', 'slayer-head');
      head.appendChild(App.el('span', 'slayer-name', L.name));
      head.appendChild(App.el('span', 'priv', L.priv));
      head.appendChild(App.el('span', 'slayer-ex', L.ex));
      b.appendChild(head);

      var body = App.el('div', 'slayer-body');
      L.body.forEach(function (p) { body.appendChild(App.el('p', null, p)); });
      body.hidden = true;
      b.appendChild(body);

      b.addEventListener('click', function () {
        var open = body.hidden;
        // One open at a time, and the DOM is updated right here in the handler.
        buttons.forEach(function (x) {
          x.b.classList.remove('is-on');
          x.body.hidden = true;
          x.b.setAttribute('aria-expanded', 'false');
        });
        if (open) {
          b.classList.add('is-on');
          body.hidden = false;
          b.setAttribute('aria-expanded', 'true');
        }
      });

      buttons.push({ b: b, body: body });
      host.appendChild(b);
    });

    if (buttons.length) buttons[0].b.click();
  }

  App.register('stack', build);
})(window.PhoneApp);
