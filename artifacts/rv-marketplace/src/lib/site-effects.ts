/**
 * Scroll and pointer behaviour for the marketing pages (<SiteLayout>).
 *
 * The pages render plain markup and opt in with data attributes
 * (data-reveal, data-count, data-tabs, ...). This module wires them up after
 * mount and returns a cleanup function. Everything here is presentation only:
 * forms, analytics, and navigation stay in React.
 */

const numberFormat = new Intl.NumberFormat("en-US");

function all<T extends HTMLElement = HTMLElement>(root: ParentNode, selector: string): T[] {
  return Array.from(root.querySelectorAll<T>(selector));
}

export function initSiteEffects(root: HTMLElement): () => void {
  const controller = new AbortController();
  const { signal } = controller;
  const observers: IntersectionObserver[] = [];
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const canObserve = "IntersectionObserver" in window;
  const alive = () => !signal.aborted;
  const later = (fn: () => void, ms: number) => window.setTimeout(() => { if (alive()) fn(); }, ms);
  const frame = (fn: (now: number) => void) => requestAnimationFrame(now => { if (alive()) fn(now); });

  /** Run `update` at most once per frame while the page scrolls. */
  function onScroll(update: () => void, alsoOnResize = false) {
    let ticking = false;
    const schedule = () => {
      if (ticking) return;
      ticking = true;
      frame(() => { ticking = false; update(); });
    };
    window.addEventListener("scroll", schedule, { passive: true, signal });
    if (alsoOnResize) window.addEventListener("resize", schedule, { signal });
    update();
  }

  // Header: solid after the first scroll, hidden while scrolling down, plus the progress bar.
  const header = root.querySelector<HTMLElement>("[data-header]");
  const progress = root.querySelector<HTMLElement>(".scroll-progress");
  if (header) {
    let lastY = window.scrollY;
    onScroll(() => {
      const y = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const menuOpen = document.documentElement.classList.contains("mrv-menu-open")
        || header.querySelector('.nav__link[aria-expanded="true"]') !== null;
      header.classList.toggle("is-scrolled", y > 24);
      header.classList.toggle("is-hidden", !menuOpen && y > 480 && y > lastY + 4);
      if (y < lastY - 4) header.classList.remove("is-hidden");
      progress?.style.setProperty("--progress", max > 0 ? Math.min(y / max, 1).toFixed(4) : "0");
      lastY = y;
    });
  }

  // Reveal on scroll, staggered inside [data-stagger] groups.
  const revealNodes = all(root, "[data-reveal]");
  all(root, "[data-stagger]").forEach(group => {
    all(group, "[data-reveal]")
      .filter(node => node.closest("[data-stagger]") === group)
      .forEach((node, index) => node.style.setProperty("--i", String(index)));
  });
  if (!canObserve || reduceMotion) {
    revealNodes.forEach(node => node.classList.add("is-in"));
  } else {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-in");
        observer.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
    revealNodes.forEach(node => observer.observe(node));
    observers.push(observer);
  }

  // Count-up numbers. data-count is read every frame, so a count that changes
  // mid-animation (the live RV total arriving) still lands on the new value.
  if (canObserve && !reduceMotion) {
    const run = (node: HTMLElement) => {
      const first = Number(node.dataset.count);
      const duration = Math.min(2200, 900 + Math.log10(first + 1) * 260);
      const start = performance.now();
      const step = (now: number) => {
        const target = Number(node.dataset.count);
        const t = Math.min((now - start) / duration, 1);
        node.textContent = numberFormat.format(Math.round(target * (1 - Math.pow(1 - t, 4))));
        if (t < 1) frame(step);
      };
      frame(step);
    };
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        run(entry.target as HTMLElement);
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.6 });
    all(root, "[data-count]").forEach(node => observer.observe(node));
    observers.push(observer);
  }

  // Typewriter for the hero "shopper asks" card.
  const typer = root.querySelector<HTMLElement>("[data-typer]");
  if (typer && !reduceMotion) {
    let phrases: string[] = [];
    try { phrases = JSON.parse(typer.dataset.typer ?? "[]"); } catch { /* leave the static text */ }
    if (phrases.length > 1) {
      let index = 0;
      const type = (text: string, done: () => void) => {
        let i = 0;
        const step = () => {
          typer.textContent = text.slice(0, ++i);
          if (i < text.length) later(step, 24 + Math.random() * 38);
          else later(done, 3200);
        };
        step();
      };
      const erase = (done: () => void) => {
        const step = () => {
          typer.textContent = (typer.textContent ?? "").slice(0, -2);
          if (typer.textContent) later(step, 12);
          else later(done, 350);
        };
        step();
      };
      const loop = () => erase(() => {
        index = (index + 1) % phrases.length;
        type(phrases[index], loop);
      });
      later(loop, 4200);
    }
  }

  // Hero background video: load it only when it will actually play.
  const heroVideo = root.querySelector<HTMLVideoElement>("video[data-autoplay-src]");
  const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
  if (heroVideo && !reduceMotion && !saveData) {
    heroVideo.muted = true;
    heroVideo.src = heroVideo.dataset.autoplaySrc ?? "";
    const play = () => { heroVideo.play().catch(() => { /* autoplay refused: the poster stays */ }); };
    play();
    if (canObserve) {
      const observer = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting) play(); else heroVideo.pause();
      });
      observer.observe(heroVideo);
      observers.push(observer);
    }
  }

  // Explainer video: the cover starts playback.
  all(root, "[data-player]").forEach(player => {
    const video = player.querySelector("video");
    const cover = player.querySelector<HTMLElement>(".player__cover");
    if (!video || !cover) return;
    cover.addEventListener("click", () => {
      player.classList.add("is-playing");
      video.play().catch(() => { /* the native controls remain */ });
      video.focus();
    }, { signal });
  });

  // Pointer spotlight on cards.
  all(root, "[data-spot]").forEach(card => {
    card.addEventListener("pointermove", event => {
      const rect = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${event.clientX - rect.left}px`);
      card.style.setProperty("--my", `${event.clientY - rect.top}px`);
    }, { signal });
  });

  // Parallax layers and the scroll-drawn road.
  const layers = all(root, "[data-parallax]");
  const roads = all(root, "[data-road]");
  const heroLayer = root.querySelector<HTMLElement>(".hero__video");
  if (!reduceMotion && (layers.length || roads.length || heroLayer)) {
    onScroll(() => {
      const vh = window.innerHeight;
      if (heroLayer && window.scrollY < vh * 1.2) {
        heroLayer.style.transform = `translate3d(0,${(window.scrollY * 0.22).toFixed(1)}px,0)`;
      }
      layers.forEach(layer => {
        const rect = layer.parentElement?.getBoundingClientRect();
        if (!rect || rect.bottom < 0 || rect.top > vh) return;
        const offset = (rect.top + rect.height / 2 - vh / 2) * Number(layer.dataset.parallax);
        layer.style.transform = `translate3d(0,${(-offset).toFixed(1)}px,0)`;
      });
      roads.forEach(road => {
        const rect = road.getBoundingClientRect();
        const drawn = (vh * 0.9 - rect.top) / (vh * 0.6);
        road.style.setProperty("--road", Math.max(0, Math.min(1, drawn)).toFixed(3));
      });
    }, true);
  }

  // FAQ accordion.
  all(root, "[data-accordion] .faq__q").forEach(button => {
    button.addEventListener("click", () => {
      const item = button.closest(".faq__item");
      if (!item) return;
      const open = !item.classList.contains("is-open");
      item.classList.toggle("is-open", open);
      button.setAttribute("aria-expanded", String(open));
    }, { signal });
  });

  // Tabs (ARIA tabs pattern with arrow keys).
  all(root, "[data-tabs]").forEach(tabs => {
    const buttons = all<HTMLButtonElement>(tabs, '[role="tab"]');
    const select = (button: HTMLButtonElement, focus = false) => {
      buttons.forEach(other => {
        const active = other === button;
        other.setAttribute("aria-selected", String(active));
        other.tabIndex = active ? 0 : -1;
        const panel = document.getElementById(other.getAttribute("aria-controls") ?? "");
        if (panel) panel.hidden = !active;
      });
      if (focus) button.focus();
    };
    buttons.forEach((button, index) => {
      button.addEventListener("click", () => select(button), { signal });
      button.addEventListener("keydown", event => {
        const next = event.key === "ArrowRight" ? buttons[(index + 1) % buttons.length]
          : event.key === "ArrowLeft" ? buttons[(index - 1 + buttons.length) % buttons.length]
          : event.key === "Home" ? buttons[0]
          : event.key === "End" ? buttons[buttons.length - 1]
          : null;
        if (next) { event.preventDefault(); select(next, true); }
      }, { signal });
    });
  });

  // Copy buttons.
  all(root, "[data-copy], [data-copy-from]").forEach(button => {
    const label = button.querySelector("span");
    const original = button.dataset.copyLabel || label?.textContent || "Copy";
    button.addEventListener("click", () => {
      const source = button.dataset.copyFrom ? root.querySelector(button.dataset.copyFrom) : null;
      const text = source ? (source.textContent ?? "").trim() : button.dataset.copy ?? "";
      const done = (message: string) => {
        if (!label) return;
        label.textContent = message;
        later(() => { label.textContent = original; }, 2200);
      };
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(() => done("Copied"), () => done("Select and copy the text"));
      } else {
        done("Select and copy the text");
      }
    }, { signal });
  });
  all<HTMLInputElement>(root, "[data-select-on-focus]").forEach(input => {
    input.addEventListener("focus", () => input.select(), { signal });
  });

  all(root, "[data-swipe]").forEach(deck => initSwipeDeck(deck, signal));

  return () => {
    controller.abort();
    observers.forEach(observer => observer.disconnect());
  };
}

/** The swipe preview on the Shop page: drag, buttons, or arrow keys. */
function initSwipeDeck(deck: HTMLElement, signal: AbortSignal) {
  const stack = deck.querySelector<HTMLElement>(".deck__stack");
  const done = deck.querySelector<HTMLElement>(".deck__done");
  const controls = deck.querySelector<HTMLElement>(".deck__controls");
  const status = deck.querySelector<HTMLElement>("[data-deck-status]");
  const summary = deck.querySelector<HTMLElement>("[data-deck-summary]");
  const list = deck.querySelector<HTMLElement>("[data-deck-list]");
  const cards = all(deck, ".deck__card");
  if (!stack || !done || !controls || !status || !summary || !list || !cards.length) return;

  let index = 0;
  let liked: string[] = [];
  let drag: { id: number; x: number; y: number; dx: number } | null = null;
  const nameOf = (card: HTMLElement) => card.dataset.name ?? "";

  stack.tabIndex = 0;

  function layout() {
    cards.forEach((card, i) => {
      const depth = i - index;
      card.classList.toggle("is-gone", depth < 0);
      card.classList.toggle("is-deep", depth > 2);
      card.style.zIndex = String(cards.length - i);
      card.setAttribute("aria-hidden", String(depth !== 0));
      if (depth >= 0) {
        card.style.setProperty("--depth", String(depth));
        card.style.transform = "";
        card.style.removeProperty("--like");
        card.style.removeProperty("--pass");
      }
    });
    const finished = index >= cards.length;
    stack!.hidden = finished;
    controls!.hidden = finished;
    done!.hidden = !finished;
    if (finished) {
      summary!.textContent = liked.length ? "Nice picks." : "Nothing caught your eye?";
      list!.textContent = liked.length
        ? `You liked ${liked.join(", ")}. Now swipe real RVs and compare your likes.`
        : "Set your own filters and swipe real RVs from dealer inventory.";
    }
  }

  function decide(like: boolean) {
    const card = cards[index];
    if (!card) return;
    const direction = like ? 1 : -1;
    if (like) liked.push(nameOf(card));
    card.classList.remove("is-dragging");
    card.style.setProperty(like ? "--like" : "--pass", "1");
    card.style.transform = `translate(${direction * 150}%, -4%) rotate(${direction * 22}deg)`;
    index += 1;
    const next = cards[index];
    status!.textContent = `${like ? "Liked" : "Passed on"} ${nameOf(card)}. ${next ? `Next: ${nameOf(next)}.` : "That was the last card."}`;
    layout();
  }

  function reset() {
    index = 0;
    liked = [];
    cards.forEach(card => { card.style.transform = ""; });
    status!.textContent = "Deck reset.";
    layout();
    stack!.focus({ preventScroll: true });
  }

  stack.addEventListener("pointerdown", event => {
    const card = cards[index];
    if (!card || !card.contains(event.target as Node) || event.button > 0) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0 };
    card.classList.add("is-dragging");
    try { card.setPointerCapture(event.pointerId); } catch { /* capture is optional */ }
  }, { signal });
  stack.addEventListener("pointermove", event => {
    const card = cards[index];
    if (!drag || !card || event.pointerId !== drag.id) return;
    drag.dx = event.clientX - drag.x;
    const dy = (event.clientY - drag.y) * 0.3;
    card.style.transform = `translate(${drag.dx}px,${dy}px) rotate(${drag.dx / 18}deg)`;
    card.style.setProperty("--like", String(Math.max(0, Math.min(1, drag.dx / 90))));
    card.style.setProperty("--pass", String(Math.max(0, Math.min(1, -drag.dx / 90))));
  }, { signal });
  const release = (event: PointerEvent) => {
    const card = cards[index];
    if (!drag || event.pointerId !== drag.id) return;
    const { dx } = drag;
    drag = null;
    if (!card) return;
    card.classList.remove("is-dragging");
    if (Math.abs(dx) > 90) decide(dx > 0);
    else layout();
  };
  stack.addEventListener("pointerup", release, { signal });
  stack.addEventListener("pointercancel", release, { signal });

  deck.querySelector("[data-deck-like]")?.addEventListener("click", () => decide(true), { signal });
  deck.querySelector("[data-deck-pass]")?.addEventListener("click", () => decide(false), { signal });
  deck.querySelector("[data-deck-reset]")?.addEventListener("click", reset, { signal });
  deck.addEventListener("keydown", event => {
    if ((event.target as HTMLElement).closest("a, .deck__done")) return;
    if (event.key === "ArrowRight") { event.preventDefault(); decide(true); }
    if (event.key === "ArrowLeft") { event.preventDefault(); decide(false); }
  }, { signal });

  layout();
}
