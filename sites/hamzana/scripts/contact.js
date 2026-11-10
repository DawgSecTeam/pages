/*==================================================
contact.js — physics contact field for #contact

Seven orbs drift, bounce off the walls, and collide.
Hover or focus one and it stops, revealing its label.
Drag one and release to toss it. Click to open.

Vanilla, no dependencies. The simulation only runs
while the Contact sheet is the active, visible page.
==================================================*/
(function () {
  "use strict";

  var field = document.getElementById("contact-field");
  if (!field) return;

  var links = Array.prototype.slice.call(field.querySelectorAll(".orb"));
  if (!links.length) return;

  var page = field.closest(".page");

  var mqReduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  var mqCoarse = window.matchMedia("(pointer: coarse)");

  /* ---------- Static fallback: touch, reduced motion, narrow ---------- */

  function mountFallback() {
    field.classList.add("contact-field-fallback");
    links.forEach(function (a) {
      if (a._fb) return;
      a._fb = true;

      var name = a.querySelector(".orb-lbl");
      var val = a.querySelector(".orb-val");

      var wrap = document.createElement("div");
      wrap.className = "orb-fallback-item";

      var copy = document.createElement("span");
      copy.className = "orb-fallback-txt";
      copy.textContent = (name ? name.textContent.replace(/\s+—.*$/, "") : "") +
        (val ? " · " + val.textContent : "");

      a.parentNode.insertBefore(wrap, a);
      wrap.appendChild(a);
      wrap.appendChild(copy);

      var d = a.classList.contains("orb-email") ? 96 : 76;
      a.style.width = d + "px";
      a.style.height = d + "px";
      a.style.transform = "none";
    });

    var hint = field.querySelector(".field-hint");
    if (hint) {
      hint.textContent = mqCoarse.matches
        ? "Tap an orb to open"
        : "Select an orb to open";
    }
  }

  if (mqReduce.matches || mqCoarse.matches || window.innerWidth <= 900) {
    mountFallback();
    return;
  }

  /* ---------- Geometry ---------- */

  var W = 0;
  var H = 0;
  // Only the instruction line at the top of the field is off limits.
  // A tooltip that would not fit above its orb flips below it instead
  // (see paint), so the rest of the height stays playable.
  var TOP = 40;
  var BOTTOM = 34; // clearance below orbs for the figure caption
  var RADIUS = 0;

  function size() {
    W = field.clientWidth;
    H = field.clientHeight;
  }

  // Keep the top wall just clear of the hint. Label heights are cached
  // per orb so the flip test in paint only needs a number, and they
  // are re-measured here once the web fonts have settled.
  function measure() {
    size();

    var hint = field.querySelector(".field-hint");
    var hintBottom = hint
      ? (hint.offsetTop || 0) + (hint.offsetHeight || 0)
      : 0;
    TOP = Math.max(20, Math.round(hintBottom + 10));

    if (bodies) {
      bodies.forEach(function (b) {
        if (b.label) b.labelH = b.label.offsetHeight || 0;
      });
    }
  }

  /* ---------- Orbs ---------- */

  // Spread across the full walled area (0 = top, 1 = bottom, 0 = left,
  // 1 = right) so the first frame reads as a composed field that uses
  // the whole sheet, not a cluster up top with an empty right side.
  var spawns = [
    [0.10, 0.30], [0.33, 0.05], [0.55, 0.42], [0.80, 0.08],
    [0.16, 0.74], [0.45, 0.92], [0.95, 0.55]
  ];

  var bodies = [];

  measure();

  links.forEach(function (a, i) {
    var big = a.classList.contains("orb-email");
    var d = big ? 168 : 124;
    var r = d / 2;

    a.style.width = d + "px";
    a.style.height = d + "px";

    var s = spawns[i % spawns.length];

    var b = {
      el: a,
      label: a.querySelector(".orb-label"),
      labelH: 0,
      x: r + s[0] * (W - d),
      y: TOP + r + s[1] * (H - TOP - BOTTOM - d),
      vx: 0,
      vy: 0,
      r: r,
      big: big,
      caught: false,
      focused: false,
      grabbed: false,
      graceUntil: 0,
      flip: false,
      warp: { x: 1, y: 1, vx: 0, vy: 0, angle: 0 }
    };

    b.labelH = b.label ? b.label.offsetHeight || 0 : 0;

    // A slow, varied starting drift so the field reads as alive
    // on the first frame rather than a static diagram.
    var ang = (i * 0.9 + 0.4) % (Math.PI * 2);
    var sp = big ? 26 : 42 + (i % 3) * 10;
    b.vx = Math.cos(ang) * sp;
    b.vy = Math.sin(ang) * sp;

    a._b = b;
    bodies.push(b);

    if (r < RADIUS || RADIUS === 0) RADIUS = r;
  });

  // Resolve any spawn overlaps before the first paint.
  for (var pass = 0; pass < 8; pass++) {
    for (var i = 0; i < bodies.length; i++) {
      for (var j = i + 1; j < bodies.length; j++) {
        separate(bodies[i], bodies[j]);
      }
    }
  }

  function separate(a, b) {
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var min = a.r + b.r + 2;
    var d2 = dx * dx + dy * dy;
    if (d2 >= min * min) return;

    var dist = Math.sqrt(d2) || 0.01;
    var nx = dx / dist;
    var ny = dy / dist;
    var push = (min - dist) / 2;

    a.x -= nx * push;
    a.y -= ny * push;
    b.x += nx * push;
    b.y += ny * push;
  }

  /* ---------- Pointer ---------- */

  var pointer = { x: -9999, y: -9999, inside: false };
  var drag = null;
  var lastDragAt = 0;
  var releasePoint = { x: 0, y: 0 };

  // After a toss the cursor is still sitting on the orb. Without this
  // guard the catch rule would grab it right back the moment the
  // throw-grace expires — the orb would look dropped and stuck.
  // Re-arm catching only once the pointer actually moves away.
  function endReleaseHold() {
    if (!field.classList.contains("is-releasing")) return;
    field.classList.remove("is-releasing");
    for (var i = 0; i < bodies.length; i++) bodies[i].freeUntilMove = false;
  }

  function setPointer(e) {
    var rect = field.getBoundingClientRect();
    pointer.x = e.clientX - rect.left;
    pointer.y = e.clientY - rect.top;
  }

  function bodyAt(px, py) {
    for (var i = bodies.length - 1; i >= 0; i--) {
      var b = bodies[i];
      var dx = b.x - px;
      var dy = b.y - py;
      if (dx * dx + dy * dy < (b.r + 4) * (b.r + 4)) return b;
    }
    return null;
  }

  field.addEventListener("pointermove", function (e) {
    pointer.inside = true;
    setPointer(e);

    if (!drag && field.classList.contains("is-releasing")) {
      var rdx = pointer.x - releasePoint.x;
      var rdy = pointer.y - releasePoint.y;
      if (rdx * rdx + rdy * rdy > 36) endReleaseHold();
    }

    if (!drag) return;

    var b = drag.body;

    // Keep the held orb inside the walled area, so releasing after
    // dragging past the edge doesn't strand it outside.
    b.x = Math.max(b.r, Math.min(W - b.r, pointer.x));
    b.y = Math.max(TOP + b.r, Math.min(H - BOTTOM - b.r, pointer.y));

    // Keep the open label inside the field while the orb is dragged
    // toward an edge (pointer events, not every frame).
    if (b.caught) clampLabel(b);

    var now = performance.now();
    drag.hist.push({ x: b.x, y: b.y, t: now });
    while (drag.hist.length > 2 && now - drag.hist[0].t > 120) {
      drag.hist.shift();
    }

    if (drag.hist.length >= 2) {
      var first = drag.hist[0];
      var last = drag.hist[drag.hist.length - 1];
      var dt = Math.max(1, last.t - first.t) / 1000;
      drag.vx = (last.x - first.x) / dt;
      drag.vy = (last.y - first.y) / dt;
    }

    if (Math.abs(b.x - drag.startX) + Math.abs(b.y - drag.startY) > 2) {
      drag.moved = true;
    }

    // Capture only once this is a real drag. Capturing on pointerdown
    // would retarget the click to the field and break ordinary
    // click-to-open; a plain tap must still follow the link.
    if (drag.moved && !drag.captured) {
      drag.captured = true;
      if (field.setPointerCapture) {
        try {
          field.setPointerCapture(drag.pointerId);
        } catch (err) {
          /* ignore */
        }
      }
    }
  });

  field.addEventListener("pointerdown", function (e) {
    pointer.inside = true;
    setPointer(e);
    endReleaseHold();

    if (e.pointerType === "mouse" && e.button !== 0) return;

    var b = bodyAt(pointer.x, pointer.y);
    if (!b) return;

    drag = {
      body: b,
      startX: b.x,
      startY: b.y,
      pointerId: e.pointerId,
      captured: false,
      hist: [{ x: b.x, y: b.y, t: performance.now() }],
      vx: 0,
      vy: 0,
      moved: false
    };

    b.grabbed = true;
    field.classList.add("is-dragging");
  });

  function release() {
    if (!drag) return;

    var b = drag.body;
    var h = drag.hist;

    b.grabbed = false;
    field.classList.remove("is-dragging");

    if (drag.moved) {
      // Read the throw from the last 30ms of the gesture — that is
      // the flick, not an average across the whole drag.
      var tvx = drag.vx;
      var tvy = drag.vy;

      if (h.length >= 2) {
        var cut = performance.now() - 30;
        var base = h[0];
        for (var i = h.length - 1; i >= 0; i--) {
          if (h[i].t <= cut) {
            base = h[i];
            break;
          }
        }
        var last = h[h.length - 1];
        var dt = Math.max(1, last.t - base.t) / 1000;
        tvx = (last.x - base.x) / dt;
        tvy = (last.y - base.y) / dt;
      }

      var speed = Math.sqrt(tvx * tvx + tvy * tvy);
      if (speed > MAX_SPEED) {
        tvx = (tvx / speed) * MAX_SPEED;
        tvy = (tvy / speed) * MAX_SPEED;
        speed = MAX_SPEED;
      }

      b.vx = tvx;
      b.vy = tvy;

      if (speed > 60) {
        var ang = Math.atan2(tvy, tvx);
        squash(b, Math.cos(ang), Math.sin(ang), speed);
      }

      // Don't let the cursor instantly re-catch the orb it just threw.
      b.graceUntil = performance.now() + 250;
      b.freeUntilMove = true;
      releasePoint.x = pointer.x;
      releasePoint.y = pointer.y;
      field.classList.add("is-releasing");
      setCaught(b, false);
      lastDragAt = performance.now();
    } else {
      b.vx = 0;
      b.vy = 0;
    }

    drag = null;

    // Releasing outside the field leaves a stale "inside" pointer
    // that could catch an orb from off-canvas — clear it.
    if (
      pointer.x < 0 ||
      pointer.y < 0 ||
      pointer.x > W ||
      pointer.y > H
    ) {
      pointer.inside = false;
      pointer.x = -9999;
      pointer.y = -9999;
    }
  }

  field.addEventListener("pointerup", release);
  field.addEventListener("pointercancel", release);

  field.addEventListener("pointerleave", function () {
    if (drag) return;
    endReleaseHold();
    pointer.inside = false;
    pointer.x = -9999;
    pointer.y = -9999;
  });

  // A drag must never navigate. Ordinary clicks still follow the link.
  links.forEach(function (a) {
    a.addEventListener("dragstart", function (e) {
      e.preventDefault();
    });
  });

  field.addEventListener(
    "click",
    function (e) {
      if (drag || performance.now() - lastDragAt < 350) e.preventDefault();
    },
    true
  );

  // Keyboard focus pins the label just like hovering does. Pointer
  // focus does not: clicking an orb before dragging must not leave
  // it "caught" after the drag is released.
  links.forEach(function (a) {
    a.addEventListener("focus", function () {
      a._b.focused = a.matches(":focus-visible");
    });
    a.addEventListener("blur", function () {
      a._b.focused = false;
    });
  });

  /* ---------- Squash & stretch ---------- */

  var REST = 0.9;
  var MAX_SPEED = 1400;
  var WARP_MAX = 0.15;

  function squash(body, nx, ny, strength) {
    var w = body.warp;
    var mag = Math.min(WARP_MAX, Math.abs(strength) / 2600);
    if (mag < 0.012) return;

    w.angle = Math.atan2(ny, nx);
    w.x = 1 - mag;
    w.y = 1 + mag;
    w.vx = 0;
    w.vy = 0;
  }

  function stepWarp(b, dt) {
    // Near-critically damped spring back to round (ζ ≈ 0.63):
    // one soft overshoot, settled in under a second.
    var w = b.warp;
    var k = 46;
    var c = 8.5;

    w.vx += (k * (1 - w.x) - c * w.vx) * dt;
    w.vy += (k * (1 - w.y) - c * w.vy) * dt;
    w.x += w.vx * dt;
    w.y += w.vy * dt;

    if (Math.abs(w.x - 1) < 0.001 && Math.abs(w.vx) < 0.005) {
      w.x = 1;
      w.vx = 0;
    }
    if (Math.abs(w.y - 1) < 0.001 && Math.abs(w.vy) < 0.005) {
      w.y = 1;
      w.vy = 0;
    }
  }

  /* ---------- Collision response ---------- */

  function integrate(dt) {
    var i, j, b, A, B, dx, dy, dist, nx, ny, min;

    for (i = 0; i < bodies.length; i++) {
      b = bodies[i];
      if (!b.grabbed) {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
      }
    }

    // Two passes: the first resolves the impulse, the second cleans
    // up any residual overlap so circles never visibly intersect.
    for (var pass = 0; pass < 2; pass++) {
      for (i = 0; i < bodies.length; i++) {
        for (j = i + 1; j < bodies.length; j++) {
          A = bodies[i];
          B = bodies[j];

          dx = B.x - A.x;
          dy = B.y - A.y;
          min = A.r + B.r;
          var d2 = dx * dx + dy * dy;
          if (d2 === 0 || d2 >= min * min) continue;

          dist = Math.sqrt(d2);
          nx = dx / dist;
          ny = dy / dist;

          // Mass proportional to area, so the large orb is heavy.
          // A held or caught orb acts as immovable (inverse mass 0):
          // other orbs bounce off it instead of shoving it around.
          var inv1 = A.grabbed || A.caught ? 0 : 1 / (A.r * A.r);
          var inv2 = B.grabbed || B.caught ? 0 : 1 / (B.r * B.r);
          var invSum = inv1 + inv2;
          if (invSum === 0) continue;

          var push = min - dist;
          A.x -= nx * push * (inv1 / invSum);
          A.y -= ny * push * (inv1 / invSum);
          B.x += nx * push * (inv2 / invSum);
          B.y += ny * push * (inv2 / invSum);

          var rvn = (B.vx - A.vx) * nx + (B.vy - A.vy) * ny;
          if (rvn < 0 && pass === 0) {
            var imp = (-(1 + REST) * rvn) / invSum;
            A.vx -= imp * inv1 * nx;
            A.vy -= imp * inv1 * ny;
            B.vx += imp * inv2 * nx;
            B.vy += imp * inv2 * ny;

            // The lighter orb takes the more visible deformation.
            squash(A, nx, ny, Math.abs(rvn) * (inv1 / invSum));
            squash(B, nx, ny, Math.abs(rvn) * (inv2 / invSum));
          }
        }
      }
    }

    // Walls
    for (i = 0; i < bodies.length; i++) {
      b = bodies[i];
      var minX = b.r;
      var maxX = W - b.r;
      var minY = TOP + b.r;
      var maxY = H - BOTTOM - b.r;

      if (b.x < minX) {
        b.x = minX;
        if (b.vx < 0) {
          squash(b, -1, 0, -b.vx);
          b.vx = -b.vx * REST;
        }
      }
      if (b.x > maxX) {
        b.x = maxX;
        if (b.vx > 0) {
          squash(b, 1, 0, b.vx);
          b.vx = -b.vx * REST;
        }
      }
      if (b.y < minY) {
        b.y = minY;
        if (b.vy < 0) {
          squash(b, 0, -1, -b.vy);
          b.vy = -b.vy * REST;
        }
      }
      if (b.y > maxY) {
        b.y = maxY;
        if (b.vy > 0) {
          squash(b, 0, 1, b.vy);
          b.vy = -b.vy * REST;
        }
      }
    }
  }

  /* ---------- Frame ---------- */

  function setCaught(b, on) {
    if (b.caught === on) return;
    b.caught = on;
    b.el.classList.toggle("is-caught", on);
    if (on) clampLabel(b);
  }

  // Keep the tooltip inside the field: shift it sideways near an
  // edge, and move its arrow back so it still points at the orb.
  function clampLabel(b) {
    var lbl = b.label;
    if (!lbl) return;

    var w = lbl.offsetWidth || 240;
    var margin = 12;
    var lx = 0;

    if (b.x - w / 2 < margin) {
      lx = margin - (b.x - w / 2);
    } else if (b.x + w / 2 > W - margin) {
      lx = W - margin - (b.x + w / 2);
    }

    b.el.style.setProperty("--lx", Math.round(lx) + "px");
  }

  function step(dt) {
    var i, b;

    for (i = 0; i < bodies.length; i++) {
      b = bodies[i];
      stepWarp(b, dt);

      if (b.grabbed) {
        setCaught(b, true);
        continue;
      }

      var near = false;
      if (!b.freeUntilMove && pointer.inside && performance.now() >= b.graceUntil) {
        var dx = b.x - pointer.x;
        var dy = b.y - pointer.y;
        near = dx * dx + dy * dy < (b.r + 10) * (b.r + 10);
      }

      setCaught(b, near || b.focused);

      if (b.caught) {
        // Stop dead under the cursor, staying put to be read.
        var damp = Math.exp(-14 * dt);
        b.vx *= damp;
        b.vy *= damp;
        if (Math.abs(b.vx) < 1) b.vx = 0;
        if (Math.abs(b.vy) < 1) b.vy = 0;
      } else {
        // Very light drag: a hard toss should still cross the field.
        var drag2 = Math.exp(-0.12 * dt);
        b.vx *= drag2;
        b.vy *= drag2;

        var sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
        if (sp < 22) {
          var a = Math.random() * Math.PI * 2;
          b.vx += Math.cos(a) * 8;
          b.vy += Math.sin(a) * 8;
          sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
        }

        if (sp > MAX_SPEED) {
          b.vx = (b.vx / sp) * MAX_SPEED;
          b.vy = (b.vy / sp) * MAX_SPEED;
        }
      }
    }

    // Substep fast frames so a thrown orb can't tunnel through another.
    var fastest = 0;
    for (i = 0; i < bodies.length; i++) {
      var v = Math.sqrt(
        bodies[i].vx * bodies[i].vx + bodies[i].vy * bodies[i].vy
      );
      if (v > fastest) fastest = v;
    }

    var steps = Math.ceil((fastest * dt) / (RADIUS * 0.5)) || 1;
    steps = Math.max(1, Math.min(8, steps));

    var h = dt / steps;
    for (var s = 0; s < steps; s++) integrate(h);
  }

  function paint() {
    for (var i = 0; i < bodies.length; i++) {
      var b = bodies[i];
      var w = b.warp;

      // Round the translation so borders stay crisp on whole pixels.
      var tf = "translate(" + round(b.x - b.r, 1) + "px, " +
        round(b.y - b.r, 1) + "px)";

      // A caught orb holds still with a crisp label, so skip the
      // warp while it is being read.
      if (!b.caught && (w.x !== 1 || w.y !== 1)) {
        tf += " rotate(" + round(w.angle, 3) + "rad)" +
          " scale(" + round(w.x, 3) + "," + round(w.y, 3) + ")" +
          " rotate(" + round(-w.angle, 3) + "rad)";
      }

      // Style writes are not free — only touch the DOM on change.
      if (tf !== b.tf) {
        b.tf = tf;
        b.el.style.transform = tf;
      }

      // A tooltip needs labelH + gap of headroom above the orb. If the
      // orb drifts into the ceiling, put the label below it instead so
      // it is never clipped by the field edge. The extra margin on the
      // already-flipped state keeps it from flickering at the boundary.
      var need = (b.labelH || 0) + 18;
      var space = b.y - b.r;
      var flip = b.flip ? space < need + 10 : space < need;

      if (flip !== b.flip) {
        b.flip = flip;
        b.el.classList.toggle("flip", flip);
      }
    }
  }

  function round(n, places) {
    var p = Math.pow(10, places);
    return Math.round(n * p) / p;
  }

  /* ---------- Loop ---------- */

  var last = 0;

  function frame(t) {
    requestAnimationFrame(frame);

    if (document.hidden || !page || !page.classList.contains("is-active")) {
      last = 0;
      return;
    }

    if (!last) last = t;
    var dt = (t - last) / 1000;
    last = t;

    // Clamp long gaps (tab switches) so the field never jumps.
    if (dt > 0.05) dt = 0.05;

    step(dt);
    paint();
  }

  function fit() {
    measure();
    bodies.forEach(function (b) {
      b.x = Math.max(b.r, Math.min(W - b.r, b.x));
      b.y = Math.max(TOP + b.r, Math.min(H - BOTTOM - b.r, b.y));
      if (b.caught) clampLabel(b);
    });
  }

  if (window.ResizeObserver) {
    new ResizeObserver(fit).observe(field);
  }

  // Web fonts can change the label metrics after first paint; re-fit
  // once they have landed so the headroom is exact.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(fit).catch(function () {});
  }

  paint();
  requestAnimationFrame(frame);
})();
