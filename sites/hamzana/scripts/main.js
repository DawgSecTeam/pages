/*==================================================
main.js — page engine
Discrete horizontal pagination with hash routing,
keyboard + swipe navigation, staggered reveals, and
a persisted Day/Night edition toggle.
==================================================*/
(function () {
  "use strict";

  var root = document.documentElement;
  var body = document.body;

  var sections = [
    "meet",
    "leadership",
    "skills",
    "clubs",
    "achievements",
    "work",
    "projects",
    "volunteering",
    "contact"
  ];

  var pages = Array.prototype.slice.call(document.querySelectorAll(".page"));
  var tabs = Array.prototype.slice.call(document.querySelectorAll(".rail-tab"));
  var bar = document.querySelector(".progress i");
  var prevBtn = document.querySelector('[data-nav="prev"]');
  var nextBtn = document.querySelector('[data-nav="next"]');
  var deck = document.querySelector(".deck");
  var counter = document.querySelector(".counter");

  var supportsInert = "inert" in HTMLElement.prototype;
  var mqReduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  var index = 0;

  function clamp(i) {
    return Math.max(0, Math.min(sections.length - 1, i));
  }

  function idxFromHash() {
    var h = (window.location.hash || "").replace("#", "");
    var i = sections.indexOf(h);
    return i === -1 ? 0 : i;
  }

  function setFocusable(page, focusable) {
    if (supportsInert) {
      page.inert = !focusable;
    }
    if (focusable) {
      page.removeAttribute("aria-hidden");
    } else {
      page.setAttribute("aria-hidden", "true");
    }
  }

  function render() {
    for (var i = 0; i < pages.length; i++) {
      var page = pages[i];
      var o = i - index;
      page.classList.toggle("is-active", o === 0);
      page.classList.toggle("is-past", o < 0);
      page.classList.toggle("is-future", o > 0);
      setFocusable(page, o === 0);
      if (o === 0) {
        page.scrollTop = 0;
        var inner = page.querySelector(".page-inner");
        if (inner) inner.scrollTop = 0;
      }
    }

    for (var t = 0; t < tabs.length; t++) {
      var on = t === index;
      tabs[t].classList.toggle("active", on);
      if (on) {
        tabs[t].setAttribute("aria-current", "page");
      } else {
        tabs[t].removeAttribute("aria-current");
      }
    }

    /* Keep the active pill visible when the rail scrolls horizontally (mobile) */
    if (tabs[index] && tabs[index].scrollIntoView) {
      try {
        tabs[index].scrollIntoView({
          inline: "center",
          block: "nearest",
          behavior: mqReduce.matches ? "auto" : "smooth"
        });
      } catch (e) {
        /* ignore */
      }
    }

    var p = sections.length > 1 ? index / (sections.length - 1) : 0;
    if (bar) bar.style.setProperty("--p", p);

    if (prevBtn) prevBtn.disabled = index <= 0;
    if (nextBtn) nextBtn.disabled = index >= sections.length - 1;

    if (counter) {
      var title = (tabs[index] && tabs[index].getAttribute("data-title")) || "";
      counter.innerHTML =
        "<b>" + String(index + 1).padStart(2, "0") + "</b> / " +
        String(sections.length).padStart(2, "0") +
        (title ? ' &middot; ' + title : "");
    }

    document.title =
      (tabs[index] && tabs[index].getAttribute("data-title"))
        ? tabs[index].getAttribute("data-title") + " — Hamza Nasher-Alneam"
        : "Hamza Nasher-Alneam";
  }

  function goTo(i, push) {
    i = clamp(i);
    if (i === index) return;
    index = i;
    render();
    var h = "#" + sections[i];
    if (push !== false) {
      try {
        history.pushState({ i: i }, "", h);
      } catch (e) {
        /* ignore */
      }
    }
    var active = pages[i];
    if (active && active.focus) {
      active.focus({ preventScroll: true });
    }
  }

  function next() {
    goTo(index + 1);
  }
  function prev() {
    goTo(index - 1);
  }

  /* ---------- Navigation wiring ---------- */

  tabs.forEach(function (tab, i) {
    tab.addEventListener("click", function (e) {
      e.preventDefault();
      goTo(i);
    });
  });

  if (prevBtn) prevBtn.addEventListener("click", prev);
  if (nextBtn) nextBtn.addEventListener("click", next);

  window.addEventListener("hashchange", function () {
    var i = idxFromHash();
    if (i !== index) {
      index = i;
      render();
    }
  });

  window.addEventListener("popstate", function () {
    var i = idxFromHash();
    if (i !== index) {
      index = i;
      render();
    }
  });

  document.addEventListener("keydown", function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    switch (e.key) {
      case "ArrowRight":
      case "PageDown":
        e.preventDefault();
        next();
        break;
      case "ArrowLeft":
      case "PageUp":
        e.preventDefault();
        prev();
        break;
      case "Home":
        e.preventDefault();
        goTo(0);
        break;
      case "End":
        e.preventDefault();
        goTo(sections.length - 1);
        break;
    }
  });

  /* ---------- Touch swipe ---------- */
  if (deck && window.matchMedia("(pointer: coarse)").matches) {
    var sx = 0,
      sy = 0,
      tracking = false;
    deck.addEventListener(
      "touchstart",
      function (e) {
        if (e.touches.length !== 1) return;
        sx = e.touches[0].clientX;
        sy = e.touches[0].clientY;
        tracking = true;
      },
      { passive: true }
    );
    deck.addEventListener(
      "touchend",
      function (e) {
        if (!tracking) return;
        tracking = false;
        var dx = e.changedTouches[0].clientX - sx;
        var dy = e.changedTouches[0].clientY - sy;
        if (Math.abs(dx) > 64 && Math.abs(dx) > Math.abs(dy) * 1.4) {
          if (dx < 0) next();
          else prev();
        }
      },
      { passive: true }
    );
  }

  /* ---------- Edition (Day / Night) ---------- */
  var KEY = "hna-edition";
  var mq = window.matchMedia("(prefers-color-scheme: dark)");
  var toggle = document.querySelector(".edition");
  var toggleLabel = toggle ? toggle.querySelector(".edition-label") : null;

  function applyEdition(ed, persist) {
    root.setAttribute("data-edition", ed);
    if (toggleLabel) toggleLabel.textContent = ed === "day" ? "Light" : "Dark";
    if (persist) {
      try {
        localStorage.setItem(KEY, ed);
      } catch (e) {
        /* ignore */
      }
    }
  }

  function currentEdition() {
    return root.getAttribute("data-edition") || (mq.matches ? "night" : "day");
  }

  if (toggle) {
    toggle.addEventListener("click", function () {
      applyEdition(currentEdition() === "day" ? "night" : "day", true);
    });
    applyEdition(currentEdition(), false);
    if (mq.addEventListener) {
      mq.addEventListener("change", function (e) {
        var stored = null;
        try {
          stored = localStorage.getItem(KEY);
        } catch (err) {
          /* ignore */
        }
        if (!stored) applyEdition(e.matches ? "night" : "day", false);
      });
    }
  }

  /* ---------- Boot ---------- */
  index = idxFromHash();
  render();
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      body.classList.remove("boot");
    });
  });
})();
