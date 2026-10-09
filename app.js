/* app.js
 * Chemulator — Atomic Emission Spectra
 * Presentation-layer labels, step titles, section headings, and DOM wiring.
 * All physics data and pure math live in chemistry.js.
 */
(function () {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';

  const state = {
    source: 'H', // one of GAS_ORDER, or 'WHITE'
    powered: false, // starts OFF: the user follows the phenomenon from the switch
    resultShown: false, // true once the power-on sequence has reached the screen
    emVisible: false,
    selectedLine: null, // hydrogen line object (any series) while the transition panel is open
    viewMode: 'levels', // 'levels' | 'atom'
    series: 'balmer', // hydrogen only: one of HYDROGEN_SERIES ids
    viewer: null, // the plate in the beam path: null | 'uv' | 'ir'
    docking: false, // true while a plate is travelling (its glow is not shown yet)
    sequenceEndsAt: 0, // when the power-on (or fan replay) in flight reaches the result card
  };

  /* ---------------- small DOM/SVG helpers ---------------- */
  function svgEl(tag, attrs) {
    const el = document.createElementNS(SVG_NS, tag);
    if (attrs) {
      Object.keys(attrs).forEach((key) => el.setAttribute(key, attrs[key]));
    }
    return el;
  }

  function clearChildren(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  /* ---------------- animation helpers ----------------
   * Every animation goes through motion.js (window.Motion), which takes its
   * easing from the design-system tokens, lands on the final state at once
   * under reduced motion, and does the same where the Web Animations API is
   * missing (jsdom, our DOM test harness). */
  const Motion = window.Motion;

  function animateOpacityIn(el, targetOpacity, delayMs, durationMs) {
    if (!el) return;
    el.style.opacity = String(targetOpacity);
    Motion.animate(el, [{ opacity: 0 }, { opacity: targetOpacity }],
      { delay: delayMs, duration: durationMs, easing: Motion.easeMove() });
  }

  function animateDrawIn(el, delayMs, durationMs) {
    Motion.draw(el, { delay: delayMs, duration: durationMs });
  }

  /* Strictly sequential power-on timeline. Each phase begins only after the
   * previous one has fully finished (requirement: no concerted animation).
   *   glow up -> rays reach the lens -> focused beam reaches the spectrometer
   *   -> diffracted fan spreads to the screen */
  const SEQ_GLOW_MS = 650;
  const SEQ_RAYS_MS = 450;
  const SEQ_BEAM_MS = 450;
  const SEQ_FAN_MS = 600;
  const SEQ_RAYS_START = SEQ_GLOW_MS;
  const SEQ_BEAM_START = SEQ_RAYS_START + SEQ_RAYS_MS;
  const SEQ_FAN_START = SEQ_BEAM_START + SEQ_BEAM_MS;
  const SEQ_TOTAL_MS = SEQ_FAN_START + SEQ_FAN_MS;

  /* The result card fills in just after the fan reaches the screen. */
  const SEQ_RESULT_DELAY_MS = SEQ_TOTAL_MS + 120;
  const RESULT_VIEWBOX_H = 110;
  const SETUP_VIEWBOX_H = 260;

  /* Timing for the electron-transition animation. */
  const ANIM_VIBRATE_MS = 450;
  const ANIM_ELECTRON_FALL_MS = 750;

  /* A new hydrogen series replays only the fan (the rest of the apparatus is already lit). */
  const FAN_REPLAY_DELAY_MS = 120;
  const FAN_REPLAY_RESULT_DELAY_MS = FAN_REPLAY_DELAY_MS + SEQ_FAN_MS + 120;

  /* The plate that makes UV / IR visible: out of the tray and into the beam, the rays land on it,
   * then the lines bloom one after another. */
  const PLATE_DOCK_MS = 900;
  const PLATE_UNDOCK_MS = 560;
  const PLATE_LAND_MS = 320;
  const GLOW_BLOOM_MS = 380;
  const GLOW_STAGGER_MS = 90;
  const GLOW_FADE_MS = 160;
  const bloomTotalMs = (lineCount) => GLOW_BLOOM_MS + Math.max(0, lineCount - 1) * GLOW_STAGGER_MS;

  const pendingTimeouts = [];
  function trackTimeout(id) {
    pendingTimeouts.push(id);
    return id;
  }
  function clearPendingTimeouts() {
    pendingTimeouts.forEach((id) => clearTimeout(id));
    pendingTimeouts.length = 0;
  }

  /* ---------------- theme toggle (shared Chemculator behaviour) ---------------- */
  /* Same storage key and values as the hub, so the choice carries across pages.
   * The flash-free inline script in <head> applies a saved 'dark' before first paint. */
  const THEME_KEY = 'theme';

  function currentIsDark() {
    const t = document.documentElement.getAttribute('data-theme');
    if (t === 'dark') return true;
    if (t === 'light') return false;
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  function updateThemeToggleIcon(btn) {
    btn.innerHTML = Icons.svg(currentIsDark() ? 'sun' : 'moon');
    btn.setAttribute('aria-pressed', String(currentIsDark()));
  }

  function initThemeToggle() {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    updateThemeToggleIcon(btn);
    if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => updateThemeToggleIcon(btn));
    btn.addEventListener('click', () => {
      if (currentIsDark()) {
        document.documentElement.setAttribute('data-theme', 'light');
        try {
          localStorage.setItem(THEME_KEY, 'light');
        } catch (err) {
          /* storage unavailable: the choice just doesn't persist */
        }
      } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        try {
          localStorage.setItem(THEME_KEY, 'dark');
        } catch (err) {
          /* storage unavailable: the choice just doesn't persist */
        }
      }
      updateThemeToggleIcon(btn);
    });
  }

  /* ---------------- source picker (Card 1, persistent) ---------------- */
  /* Each source is a signature-card tile: the front face shows the element, the back
   * face (hover / keyboard focus; always visible on touch) shows its line fingerprint.
   * Tiles keep the .source-chip class and data-source attribute that the tests use. */
  function buildSourceTile(code, symbol, name, backNodes, extraClass) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'source-chip sig-card ' + extraClass;
    btn.dataset.source = code;
    btn.setAttribute('aria-pressed', 'false');

    const front = document.createElement('span');
    front.className = 'sig-front';
    const sym = document.createElement('span');
    sym.className = 'tile-symbol';
    sym.textContent = symbol;
    const nm = document.createElement('span');
    nm.className = 'tile-name';
    nm.textContent = name;
    front.appendChild(sym);
    front.appendChild(nm);

    const back = document.createElement('span');
    back.className = 'sig-back';
    backNodes.forEach((node) => back.appendChild(node));

    btn.appendChild(front);
    btn.appendChild(back);
    btn.addEventListener('click', () => selectSource(code));
    return btn;
  }

  function buildSourcePicker() {
    const container = document.getElementById('source-picker');
    clearChildren(container);

    Chemulator.GAS_ORDER.forEach((code) => {
      const el = Chemulator.GAS_ELEMENTS[code];

      /* mini line spectrum on a dark strip (physical colours), then the wavelengths */
      const strip = document.createElement('span');
      strip.className = 'tile-spectrum';
      strip.setAttribute('aria-hidden', 'true');
      el.lines.forEach((ln) => {
        const mark = document.createElement('i');
        mark.style.left = Chemulator.visiblePercent(ln.wavelength) + '%';
        mark.style.background = Chemulator.wavelengthToRGB(ln.wavelength);
        strip.appendChild(mark);
      });
      const text = document.createElement('span');
      text.className = 'tile-lines';
      /* two short rows so the list never wraps mid-way */
      const nm = el.lines.map((ln) => Math.round(ln.wavelength));
      text.textContent = nm.slice(0, 2).join(' \u00B7 ') + '\n' + nm.slice(2).join(' \u00B7 ') + ' nm';

      const tile = buildSourceTile(code, el.symbol, el.name, [strip, text], 'sig-card--teal');
      tile.title = el.name + ': ' + nm.join(', ') + ' nm';
      container.appendChild(tile);
    });

    /* white light: continuous, so a rainbow strip instead of lines (gold = highlight accent) */
    const stripW = document.createElement('span');
    stripW.className = 'tile-spectrum';
    stripW.setAttribute('aria-hidden', 'true');
    const rainbow = document.createElement('span');
    rainbow.className = 'tile-spectrum-rainbow';
    const stops = [];
    for (let i = 0; i <= 8; i += 1) {
      const wl = Chemulator.VISIBLE_MIN_NM + ((Chemulator.VISIBLE_MAX_NM - Chemulator.VISIBLE_MIN_NM) * i) / 8;
      stops.push(Chemulator.wavelengthToRGB(wl));
    }
    rainbow.style.background = 'linear-gradient(90deg, ' + stops.join(', ') + ')';
    stripW.appendChild(rainbow);
    const textW = document.createElement('span');
    textW.className = 'tile-lines';
    textW.textContent = 'Continuous\n' + Chemulator.VISIBLE_MIN_NM + '\u2013' + Chemulator.VISIBLE_MAX_NM + ' nm';
    const tileW = buildSourceTile('WHITE', '\u2600', 'White light', [stripW, textW], 'sig-card--gold source-chip-white');
    tileW.title = 'White light: continuous, ' + Chemulator.VISIBLE_MIN_NM + '-' + Chemulator.VISIBLE_MAX_NM + ' nm';
    container.appendChild(tileW);
  }

  function selectSource(code) {
    if (code === state.source) return;
    state.source = code;
    /* the plate stays with hydrogen's apparatus; the series is remembered for the way back */
    if (!isHydrogen()) state.viewer = null;
    syncTransitionCard();
    closeTransitionPanel();
    /* a new source restarts the sequence (when on); render() handles a sequence in flight */
    render({ playSequence: state.powered });
  }

  function updatePickerHighlight() {
    document.querySelectorAll('.source-chip').forEach((btn) => {
      const isActive = btn.dataset.source === state.source;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  /* ---------------- shared source helpers ---------------- */
  function currentSourceData() {
    if (state.source === 'WHITE') return Chemulator.WHITE_LIGHT;
    return Chemulator.GAS_ELEMENTS[state.source];
  }

  function isWhite() {
    return state.source === 'WHITE';
  }

  function isHydrogen() {
    return state.source === 'H';
  }

  /* ---- hydrogen: which series is on show, and what (if anything) makes it visible ---- */
  function seriesById(id) {
    return Chemulator.HYDROGEN_SERIES.find((s) => s.id === id);
  }

  function currentSeries() {
    return seriesById(state.series);
  }

  /* a hydrogen UV / IR series: its lines can't be seen without a plate in the beam */
  function seriesNeedsViewer() {
    return isHydrogen() && currentSeries().band !== 'visible';
  }

  /* the plate in the beam is the right one for the series on show */
  function viewerFits() {
    return seriesNeedsViewer() && Chemulator.viewerHandlesSeries(state.viewer, currentSeries());
  }

  /* lines are glowing: the right plate is in place and has stopped moving */
  function viewerLit() {
    return viewerFits() && !state.docking;
  }

  /* The wavelength a line is shown at: Balmer keeps the observed values this page has always
   * shown (656.3 nm ...); every other line is its Rydberg value. */
  function lineNm(ln) {
    return ln.observedNm !== undefined ? ln.observedNm : ln.wavelength;
  }

  /* How the line looks right now (to the eye, or through the plate that is in place). */
  function lineLook(ln) {
    return Chemulator.appearance(lineNm(ln), viewerLit() ? state.viewer : null);
  }

  function currentLinesWithColor() {
    if (isWhite()) return [];
    if (isHydrogen()) {
      const series = currentSeries();
      return series.lines.map((ln) => {
        const nm = lineNm(ln);
        const look = lineLook(ln);
        return {
          ...ln,
          wavelength: nm,
          line: ln,
          color: look.color,
          visible: look.visible,
          via: look.via,
          pct: Chemulator.axisPercent(series, nm),
        };
      });
    }
    return Chemulator.GAS_ELEMENTS[state.source].lines.map((ln) => ({
      ...ln,
      color: Chemulator.wavelengthToRGB(ln.wavelength),
      pct: Chemulator.visiblePercent(ln.wavelength),
    }));
  }

  /* ---------------- the plate that makes UV and IR visible ----------------
   * A UV screen (fluorescent) or an IR viewer (phosphor) stands in a holder on the bench along the
   * bottom of the stage. Added to the experiment it lifts out of its slot in the tray, is carried
   * along the bench and set down just in front of the screen. The invisible rays land on it and the
   * lines glow in the plate's own colour: a false colour, the same whatever the wavelength. */
  const BENCH_Y = 236; // the tray's top edge: the floor the plates stand on
  const PLATE = { x: 806, w: 20, h: 172, foot: 8 }; // docked: centred on x, just in front of the screen
  const PLATE_FRONT_X = PLATE.x - PLATE.w / 2; // the invisible rays end on this face
  const PLATE_CARRY = 9; // carried this far above the bench
  const PLATE_SUNK = -(PLATE.h + 24); // "rise" of a plate down in the tray, out of sight
  const SLOT_X = { uv: 600, ir: 690 }; // the slots in the bench that the plates come up through

  const clamp01 = (t) => Math.min(1, Math.max(0, t));
  const smooth = (t) => t * t * (3 - 2 * t);

  /* A plate's pose while it travels (p = 0..1, on a linear clock): x, its rise above the bench
   * (< 0 is down in the tray) and a lean. The easing is in here, so a lift can be slow and a
   * set-down gentle. It lifts out of the slot, is carried to the beam, and is set down. */
  function dockPose(p, slotX) {
    const lift = smooth(clamp01(p / 0.36));
    const seat = smooth(clamp01((p - 0.78) / 0.22));
    const rise = PLATE_SUNK + (PLATE_CARRY - PLATE_SUNK) * lift - PLATE_CARRY * seat;
    /* carried across with a little overshoot, then settling back onto its mark */
    const glide = clamp01((p - 0.3) / 0.58);
    const travel = glide < 0.8 ? 1.045 * smooth(glide / 0.8) : 1.045 - 0.045 * smooth((glide - 0.8) / 0.2);
    const dir = PLATE.x >= slotX ? 1 : -1;
    return { x: slotX + (PLATE.x - slotX) * travel, rise, lean: dir * 3 * Math.sin(Math.PI * glide) };
  }

  /* and back: picked up, carried to the slot, lowered into the tray (from wherever it is) */
  function undockPose(p, slotX, from) {
    const x0 = from ? from.x : PLATE.x;
    const rise0 = from ? from.rise : 0;
    const lift = smooth(clamp01(p / 0.2));
    const sink = smooth(clamp01((p - 0.58) / 0.42));
    const carry = Math.max(rise0, PLATE_CARRY);
    const rise = (rise0 + (carry - rise0) * lift) + (PLATE_SUNK - carry) * sink;
    const glide = smooth(clamp01((p - 0.12) / 0.55));
    const dir = slotX >= x0 ? 1 : -1;
    return { x: x0 + (slotX - x0) * glide, rise, lean: dir * 3 * Math.sin(Math.PI * glide) };
  }

  /* handles into the live apparatus drawing (hydrogen UV / IR series only) */
  let apparatus = null;
  let dockToken = 0; // bumped whenever a plate animation is cancelled or superseded
  let dockHandles = []; // tweens and timers of the plate animation in flight

  function cancelDock() {
    dockToken += 1;
    dockHandles.forEach((h) => h.cancel());
    dockHandles = [];
    state.docking = false;
  }

  /* a Motion.tween as a promise; cancelling the plate animation stops it for good */
  function runTween(opts) {
    return new Promise((resolve) => {
      dockHandles.push(Motion.tween({ ...opts, done: resolve }));
    });
  }

  function waitMs(ms) {
    if (!(ms > 0) || Motion.reduced()) return Promise.resolve();
    return new Promise((resolve) => {
      const id = setTimeout(resolve, ms);
      dockHandles.push({ cancel: () => clearTimeout(id) });
    });
  }

  function buildBenchDefs(uid) {
    const frag = document.createDocumentFragment();
    /* a bench that fades out at both ends, so it never ends in a hard edge */
    const bench = svgEl('linearGradient', { id: `bench-${uid}`, x1: '0%', y1: '0%', x2: '100%', y2: '0%' });
    [[0, 0], [0.07, 1], [0.93, 1], [1, 0]].forEach(([offset, k]) => {
      bench.appendChild(svgEl('stop', { offset, style: 'stop-color:var(--stage-lens-line)', 'stop-opacity': 0.5 * k }));
    });
    frag.appendChild(bench);
    const shadow = svgEl('filter', { id: `plateShadow-${uid}`, x: '-80%', y: '-300%', width: '260%', height: '700%' });
    shadow.appendChild(svgEl('feGaussianBlur', { stdDeviation: 2.6 }));
    frag.appendChild(shadow);
    const bloom = svgEl('filter', { id: `glowBloom-${uid}`, x: '-100%', y: '-200%', width: '300%', height: '500%' });
    bloom.appendChild(svgEl('feGaussianBlur', { stdDeviation: 3.2 }));
    frag.appendChild(bloom);
    const bloomWide = svgEl('filter', { id: `glowBloomWide-${uid}`, x: '-100%', y: '-300%', width: '300%', height: '700%' });
    bloomWide.appendChild(svgEl('feGaussianBlur', { stdDeviation: 8 }));
    frag.appendChild(bloomWide);
    const clip = svgEl('clipPath', { id: `benchClip-${uid}` });
    clip.appendChild(svgEl('rect', { x: 0, y: 0, width: 900, height: BENCH_Y }));
    frag.appendChild(clip);
    return frag;
  }

  /* the bench along the bottom of the stage, with a slot for each plate */
  function drawBench(svg, uid, W, H) {
    const g = svgEl('g', { class: 'bench-group', 'aria-hidden': 'true' });
    g.appendChild(svgEl('rect', { class: 'bench', x: 0, y: BENCH_Y, width: W, height: H - BENCH_Y, fill: `url(#bench-${uid})`, opacity: 0.7 }));
    g.appendChild(svgEl('line', { class: 'bench-edge', x1: 0, y1: BENCH_Y, x2: W, y2: BENCH_Y, stroke: `url(#bench-${uid})`, 'stroke-width': 1.5 }));
    Chemulator.VIEWER_ORDER.forEach((id) => {
      g.appendChild(svgEl('rect', { class: 'bench-slot', 'data-viewer': id, x: SLOT_X[id] - 15, y: BENCH_Y, width: 30, height: 4, rx: 2, fill: Chemulator.VIEWERS[id].glow, opacity: 0.45 }));
    });
    svg.appendChild(g);
    return g;
  }

  /* The fan after the grating when the eye can't see it: thin dashed rays in no colour, fading
   * before they reach the screen. Once a plate is in the beam they carry on to its face. */
  function drawInvisibleFan(svg, defs, ap, ctx) {
    const grad = svgEl('linearGradient', { id: `fanFade-${ap.uid}`, gradientUnits: 'userSpaceOnUse', x1: ctx.specX1, y1: 0, x2: PLATE_FRONT_X, y2: 0 });
    [0, 0.5, 0.86, 1].forEach((offset) => {
      const stop = svgEl('stop', { offset, style: 'stop-color:var(--stage-ink)' });
      grad.appendChild(stop);
      ap.rayStops.push(stop);
    });
    defs.appendChild(grad);
    setRayExtent(ap, 0);

    const rays = svgEl('g', { class: 'invisible-fan', opacity: state.powered ? 1 : 0.1 });
    ctx.lines.forEach((ln, i) => {
      rays.appendChild(
        svgEl('line', {
          x1: ctx.specX1,
          y1: ctx.sourceCY,
          x2: PLATE_FRONT_X,
          y2: ap.lineYs[i],
          style: `stroke:url(#fanFade-${ap.uid})`,
          'stroke-width': 1.6,
          'stroke-dasharray': '5 6',
          'stroke-linecap': 'round',
        })
      );
    });
    svg.appendChild(rays);
    /* they spread out from the grating, like the coloured rays do */
    if (ctx.animate) {
      Motion.animate(rays, [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }],
        { delay: ctx.fanDelay, duration: SEQ_FAN_MS, easing: Motion.easeMove() });
    }

    /* a small tag by the fan: which kind of light this is */
    const band = currentSeries().band;
    const tag = svgEl('g', { class: 'invisible-tag', opacity: state.powered ? 1 : 0.35 });
    tag.appendChild(svgEl('rect', { x: ctx.specX1 + 54, y: ctx.sourceCY - 98, width: 32, height: 17, rx: 8.5, fill: 'none', style: 'stroke:var(--stage-line)', 'stroke-dasharray': '3 3' }));
    const tagText = svgEl('text', {
      x: ctx.specX1 + 70,
      y: ctx.sourceCY - 86,
      'text-anchor': 'middle',
      style: 'fill:var(--stage-muted)',
      'font-size': 11,
      'font-family': 'var(--font-mono, monospace)',
      'letter-spacing': '0.08em',
    });
    tagText.textContent = Chemulator.VIEWERS[band].tag;
    tag.appendChild(tagText);
    svg.appendChild(tag);
  }

  /* 0 = the rays fade out before the plate; 1 = they reach it */
  function setRayExtent(ap, k) {
    if (!ap) return;
    const opacity = [0.62, 0.3 + 0.24 * k, 0.5 * k, 0.5 * k];
    ap.rayStops.forEach((stop, i) => stop.setAttribute('stop-opacity', opacity[i].toFixed(3)));
  }

  /* the layer the plates live in: a shadow on the bench, and the plate itself, cut off at the
   * bench so it comes up out of its slot */
  function mountPlateLayer(ap) {
    ap.plateLayer = svgEl('g', { class: 'plate-layer', 'aria-hidden': 'true' });
    ap.plateClip = svgEl('g', { 'clip-path': `url(#benchClip-${ap.uid})` });
    ap.svg.appendChild(ap.plateLayer);
  }

  function mountPlate(ap, viewerId) {
    unmountPlate(ap);
    const viewer = Chemulator.VIEWERS[viewerId];
    const hw = PLATE.w / 2;
    const top = -PLATE.h;
    const slabH = PLATE.h - PLATE.foot;

    /* the soft shadow it casts on the bench (drawn at the origin, moved by transform) */
    const shadow = svgEl('ellipse', { class: 'plate-shadow', cx: 0, cy: BENCH_Y + 5, rx: 17, ry: 3.2, fill: '#000', filter: `url(#plateShadow-${ap.uid})` });
    shadow.style.cssText = 'transform-box:fill-box;transform-origin:center;opacity:0;';
    const g = svgEl('g', { class: 'plate', 'data-viewer': viewer.id });
    g.style.transform = 'translate(0px, 0px)';
    /* the translucent slab, its coating, and the light catching its edge */
    g.appendChild(svgEl('rect', { class: 'plate-slab', x: -hw, y: top, width: PLATE.w, height: slabH, rx: 3.5, style: 'fill:rgba(255,255,255,.1);stroke:var(--stage-line)', 'stroke-width': 1.5 }));
    g.appendChild(svgEl('rect', { class: 'plate-coat', x: -hw + 4.5, y: top + 6, width: PLATE.w - 9, height: slabH - 12, rx: 1.5, fill: viewer.glow, opacity: 0.16 }));
    g.appendChild(svgEl('line', { x1: -hw + 1.8, y1: top + 5, x2: -hw + 1.8, y2: top + slabH - 5, stroke: '#fff', 'stroke-opacity': 0.55, 'stroke-width': 1.2, 'stroke-linecap': 'round' }));
    /* the holder it stands in, and the tab you would lift it by */
    g.appendChild(svgEl('rect', { class: 'plate-foot', x: -16, y: -PLATE.foot, width: 32, height: PLATE.foot, rx: 2, style: 'fill:var(--stage-hardware)' }));
    g.appendChild(svgEl('rect', { class: 'plate-tab', x: -6, y: top - 7, width: 12, height: 9, rx: 2, style: 'fill:var(--stage-hardware)' }));
    const spotLayer = svgEl('g', { class: 'plate-spots' });
    g.appendChild(spotLayer);

    /* its name, in the stage's label style: it appears once the plate is in place */
    const label = svgEl('text', {
      class: 'plate-label',
      x: PLATE.x,
      y: BENCH_Y - PLATE.h - 14,
      'text-anchor': 'middle',
      style: 'fill:var(--stage-ink)',
      'font-size': 12,
      'font-family': 'var(--font-mono, monospace)',
      'letter-spacing': '0.08em',
    });
    label.textContent = viewer.name.toUpperCase();

    ap.plateLayer.appendChild(shadow);
    ap.plateClip.appendChild(g);
    ap.plateLayer.appendChild(ap.plateClip);
    ap.plateLayer.appendChild(label);
    ap.plate = { viewerId, g, shadow, label, spotLayer, spots: [], pose: null, anim: null };
    return ap.plate;
  }

  function unmountPlate(ap) {
    if (!ap || !ap.plate) return;
    [ap.plate.g, ap.plate.shadow, ap.plate.label].forEach((el) => { if (el.parentNode) el.parentNode.removeChild(el); });
    ap.plate = null;
  }

  /* CSS for a pose: the plate, and the shadow it casts (smaller and darker the lower it is) */
  function poseCss(pose) {
    const lift = clamp01(pose.rise / PLATE_CARRY);
    const emerged = clamp01((pose.rise + 3) / 6); // the shadow forms as the foot clears the bench
    return {
      plate: `translate(${pose.x.toFixed(2)}px, ${(BENCH_Y - pose.rise).toFixed(2)}px) rotate(${pose.lean.toFixed(2)}deg)`,
      shadow: `translate(${pose.x.toFixed(2)}px, 0px) scale(${((17 + 6 * lift) / 17).toFixed(3)}, ${((3.2 + 2.2 * lift) / 3.2).toFixed(3)})`,
      shadowOpacity: ((0.7 - 0.38 * lift) * emerged).toFixed(3),
    };
  }

  function setPlatePose(plate, pose) {
    const css = poseCss(pose);
    plate.g.style.transform = css.plate;
    plate.shadow.style.transform = css.shadow;
    plate.shadow.style.opacity = css.shadowOpacity;
    plate.pose = pose;
  }

  /* A plate's travel as one Web Animation per moving part, sampled evenly in time (the pose
   * functions carry their own easing, so these run on a linear clock). The plate is left in its
   * final pose, which is where the animation lands; reduced motion simply stops there. */
  function animatePlate(plate, poseAt, ms) {
    const steps = Math.max(12, Math.round(ms / 28));
    const plateFrames = [];
    const shadowFrames = [];
    for (let i = 0; i <= steps; i += 1) {
      const css = poseCss(poseAt(i / steps));
      plateFrames.push({ transform: css.plate, offset: i / steps });
      shadowFrames.push({ transform: css.shadow, opacity: css.shadowOpacity, offset: i / steps });
    }
    setPlatePose(plate, poseAt(1));
    plate.anim = { start: performance.now(), ms, poseAt };
    return Promise.all([
      Motion.animate(plate.g, plateFrames, { duration: ms, easing: 'linear' }),
      Motion.animate(plate.shadow, shadowFrames, { duration: ms, easing: 'linear' }),
    ]);
  }

  /* where a plate in flight is right now (for taking it back from mid-air) */
  function currentPose(plate) {
    const a = plate.anim;
    if (!a || !plate.pose) return plate.pose;
    return a.poseAt(clamp01((performance.now() - a.start) / a.ms));
  }

  /* freeze every Web Animation on a plate where it is, so a new move can take over from there */
  function freezePlate(plate) {
    if (!plate) return;
    const pose = currentPose(plate);
    [plate.g, plate.shadow].forEach((el) => {
      if (typeof el.getAnimations === 'function') el.getAnimations().forEach((a) => a.cancel());
    });
    if (pose) setPlatePose(plate, pose);
    plate.anim = null;
    /* its name keeps the opacity it had reached */
    if (typeof plate.label.getAnimations === 'function') {
      let reached = '';
      try { reached = window.getComputedStyle(plate.label).opacity; } catch (err) { /* no layout */ }
      plate.label.getAnimations().forEach((a) => a.cancel());
      if (reached !== '') plate.label.style.opacity = reached;
    }
  }

  /* one glowing spot per line, where its ray lands on the plate */
  function addGlowSpots(ap, plate, visible) {
    const viewer = Chemulator.VIEWERS[plate.viewerId];
    const hw = PLATE.w / 2;
    clearChildren(plate.spotLayer);
    /* top to bottom, shortest wavelength first: the order the strip below fills in */
    plate.spots = ap.lineYs.slice().sort((a, b) => a - b).map((lineY) => {
      const y = lineY - BENCH_Y;
      const spot = svgEl('g', { class: 'glow-spot' });
      spot.style.cssText = 'transform-box:fill-box;transform-origin:center;' + (visible ? '' : 'opacity:0;');
      spot.appendChild(svgEl('ellipse', { cx: -2, cy: y, rx: 26, ry: 10, fill: viewer.glow, opacity: 0.3, filter: `url(#glowBloomWide-${ap.uid})` }));
      spot.appendChild(svgEl('ellipse', { cx: 0, cy: y, rx: 15, ry: 5.5, fill: viewer.glow, opacity: 0.85, filter: `url(#glowBloom-${ap.uid})` }));
      spot.appendChild(svgEl('rect', { x: -hw + 2, y: y - 1.6, width: PLATE.w - 4, height: 3.2, rx: 1.6, fill: viewer.glow }));
      plate.spotLayer.appendChild(spot);
      return spot;
    });
  }

  /* the lines bloom into glow, one after another */
  function bloomLines(ap, delay) {
    const plate = ap && ap.plate;
    if (!plate || !plate.spots.length) return Promise.resolve();
    plate.spots.forEach((spot) => { spot.style.opacity = ''; });
    return Motion.stagger(plate.spots, { y: 0, scale: 0.5, gap: GLOW_STAGGER_MS, delay: delay || 0, duration: GLOW_BLOOM_MS });
  }

  /* the plate goes down into its slot... */
  function runUndock(ap, viewerId) {
    const plate = ap && ap.plate;
    if (!plate) return Promise.resolve();
    freezePlate(plate);
    const to = SLOT_X[viewerId];
    const from = plate.pose;
    /* the glow dies and the rays fade back as it is picked up; its name goes first */
    const glowOut = plate.spots.length
      ? Motion.exit(plate.spotLayer, { hide: false, duration: GLOW_FADE_MS }).then(() => { plate.spotLayer.style.opacity = '0'; })
      : Promise.resolve();
    const nameOut = Motion.exit(plate.label, { hide: false, duration: 'fast' }).then(() => { plate.label.style.opacity = '0'; });
    const raysOut = runTween({ duration: GLOW_FADE_MS + 80, update: (p) => setRayExtent(ap, 1 - p) });
    return Promise.all([glowOut, nameOut, raysOut])
      .then(() => animatePlate(plate, (p) => undockPose(p, to, from), PLATE_UNDOCK_MS))
      .then(() => {
        if (ap.plate === plate) unmountPlate(ap);
        /* a series the eye can see has no tray: the bench goes with the plate (an SVG group has no
         * `hidden`, so it is taken out of the drawing once it has faded) */
        if (ap.bench && !seriesNeedsViewer()) {
          Motion.exit(ap.bench, { hide: false, duration: 'base' }).then(() => {
            if (ap.bench && ap.bench.parentNode) ap.bench.parentNode.removeChild(ap.bench);
          });
        }
      });
  }

  /* ...and a plate comes up out of its slot, is carried across and set down in the beam */
  function runDock(ap, viewerId) {
    const plate = mountPlate(ap, viewerId);
    const from = SLOT_X[viewerId];
    setPlatePose(plate, dockPose(0, from));
    plate.label.style.opacity = '1';
    Motion.animate(plate.label, [{ opacity: 0 }, { opacity: 1 }], { delay: PLATE_DOCK_MS * 0.82, duration: 'base' });
    return animatePlate(plate, (p) => dockPose(p, from), PLATE_DOCK_MS);
  }

  /* ---------------- apparatus diagram (setup view) ---------------- */
  function renderApparatus(playSequence, ropts) {
    const ropt = ropts || {};
    const svg = document.getElementById('apparatus-svg');
    clearChildren(svg);
    apparatus = null;

    const animate = Boolean(playSequence) && state.powered;
    /* a new hydrogen series replays only the fan: the rest of the apparatus is already lit */
    const fanOnly = animate && Boolean(ropt.fanOnly);
    const animBase = animate && !fanOnly;
    const fanDelay = fanOnly ? FAN_REPLAY_DELAY_MS : SEQ_FAN_START;
    const uid = state.source;
    const defs = svgEl('defs');
    svg.appendChild(defs);

    const blurWide = svgEl('filter', { id: `blurWide-${uid}`, x: '-100%', y: '-100%', width: '300%', height: '300%' });
    blurWide.appendChild(svgEl('feGaussianBlur', { stdDeviation: 22 }));
    defs.appendChild(blurWide);

    const blurSoft = svgEl('filter', { id: `blurSoft-${uid}`, x: '-60%', y: '-60%', width: '220%', height: '220%' });
    blurSoft.appendChild(svgEl('feGaussianBlur', { stdDeviation: 8 }));
    defs.appendChild(blurSoft);

    const W = 900;
    const H = SETUP_VIEWBOX_H;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

    const sourceCX = 70;
    const sourceCY = H / 2;
    const lensX = 260;
    const specX0 = 320;
    const specX1 = 560;
    const screenX = 830;

    svg.appendChild(svgEl('rect', { x: 0, y: 0, width: W, height: H, rx: 14, style: 'fill:var(--stage)' }));

    const halo = isWhite() ? 'var(--glow-white-halo)' : currentSourceData().tubeGlow;
    const core = isWhite() ? 'var(--glow-white-core)' : currentSourceData().tubeColor;
    const glowOpacity = state.powered ? 0.85 : 0.08;

    const bloomTarget = glowOpacity * 0.9;
    const bloom = svgEl('ellipse', {
      cx: sourceCX,
      cy: sourceCY,
      rx: 90,
      ry: 90,
      style: 'fill:' + halo,
      opacity: animBase ? 0 : bloomTarget,
      filter: `url(#blurWide-${uid})`,
    });
    svg.appendChild(bloom);
    if (animBase) animateOpacityIn(bloom, bloomTarget, 0, SEQ_GLOW_MS);

    if (isWhite()) {
      const bulbGlowTarget = state.powered ? 0.95 : 0.15;
      const bulbGlow = svgEl('circle', {
        cx: sourceCX,
        cy: sourceCY,
        r: 46,
        style: 'fill:' + core,
        opacity: animBase ? 0 : bulbGlowTarget,
        filter: `url(#blurSoft-${uid})`,
      });
      svg.appendChild(bulbGlow);
      if (animBase) animateOpacityIn(bulbGlow, bulbGlowTarget, 0, SEQ_GLOW_MS);

      svg.appendChild(
        svgEl('circle', {
          cx: sourceCX,
          cy: sourceCY,
          r: 32,
          style: state.powered ? 'fill:var(--bulb-on);stroke:var(--stage-line)' : 'fill:var(--bulb-off);stroke:var(--stage-line)',
          'stroke-width': 2,
        })
      );
      const fil = svgEl('polyline', {
        points: `${sourceCX - 14},${sourceCY + 8} ${sourceCX - 6},${sourceCY - 8} ${sourceCX + 2},${sourceCY + 8} ${sourceCX + 10},${sourceCY - 8}`,
        fill: 'none',
        style: state.powered ? 'stroke:var(--filament-on)' : 'stroke:var(--filament-off)',
        'stroke-width': 2,
      });
      svg.appendChild(fil);
      svg.appendChild(
        svgEl('rect', { x: sourceCX - 14, y: sourceCY + 32, width: 28, height: 14, style: 'fill:var(--stage-hardware)', rx: 2 })
      );
    } else {
      const tubeTop = sourceCY - 90;
      const tubeH = 180;
      svg.appendChild(
        svgEl('rect', {
          x: sourceCX - 26,
          y: tubeTop,
          width: 52,
          height: tubeH,
          rx: 26,
          style: 'fill:var(--stage-fill);stroke:var(--stage-line)',
          'stroke-width': 2,
        })
      );
      const clipId = `tubeClip-${uid}`;
      const clip = svgEl('clipPath', { id: clipId });
      clip.appendChild(svgEl('rect', { x: sourceCX - 26, y: tubeTop, width: 52, height: tubeH, rx: 26 }));
      defs.appendChild(clip);

      const g = svgEl('g', { 'clip-path': `url(#${clipId})` });
      const tubeFill = svgEl('rect', {
        x: sourceCX - 26,
        y: tubeTop,
        width: 52,
        height: tubeH,
        style: 'fill:' + halo,
        opacity: animBase ? 0 : glowOpacity,
        filter: `url(#blurSoft-${uid})`,
      });
      g.appendChild(tubeFill);
      if (animBase) animateOpacityIn(tubeFill, glowOpacity, 0, SEQ_GLOW_MS);
      svg.appendChild(g);

      svg.appendChild(svgEl('circle', { cx: sourceCX, cy: tubeTop - 6, r: 5, style: 'fill:var(--stage-hardware)' }));
      svg.appendChild(svgEl('circle', { cx: sourceCX, cy: tubeTop + tubeH + 6, r: 5, style: 'fill:var(--stage-hardware)' }));
    }

    /* Phase 2 — rays extend from the source to the lens (starts after glow). */
    const rayOpacity = state.powered ? 0.55 : 0.05;
    [-34, -14, 0, 14, 34].forEach((offset) => {
      const ray = svgEl('line', {
        x1: sourceCX + 30,
        y1: sourceCY + offset,
        x2: lensX,
        y2: sourceCY,
        style: 'stroke:' + (isWhite() ? 'var(--glow-white-ray)' : core),
        'stroke-width': 1.4,
        opacity: rayOpacity,
      });
      svg.appendChild(ray);
      if (animBase) animateDrawIn(ray, SEQ_RAYS_START, SEQ_RAYS_MS);
    });

    svg.appendChild(
      svgEl('ellipse', {
        cx: lensX,
        cy: sourceCY,
        rx: 8,
        ry: 46,
        style: 'fill:var(--stage-lens-fill);stroke:var(--stage-lens-line)',
        'stroke-width': 1.5,
      })
    );

    /* Phase 3 — the focused beam extends from the lens into the spectrometer. */
    const convergedBeam = svgEl('line', {
      x1: lensX,
      y1: sourceCY,
      x2: specX0 + 40,
      y2: sourceCY,
      style: 'stroke:' + (isWhite() ? 'var(--glow-white-ray)' : core),
      'stroke-width': 3,
      opacity: state.powered ? 0.9 : 0.08,
    });
    svg.appendChild(convergedBeam);
    if (animBase) animateDrawIn(convergedBeam, SEQ_BEAM_START, SEQ_BEAM_MS);

    svg.appendChild(
      svgEl('rect', {
        x: specX0,
        y: sourceCY - 60,
        width: specX1 - specX0,
        height: 120,
        rx: 8,
        style: 'fill:var(--stage-fill);stroke:var(--stage-line)',
        'stroke-width': 1.5,
      })
    );
    const specLabel = svgEl('text', {
      x: (specX0 + specX1) / 2,
      y: sourceCY - 70,
      'text-anchor': 'middle',
      style: 'fill:var(--stage-ink)',
      'font-size': 12,
      'font-family': 'var(--font-mono, monospace)',
      'letter-spacing': '0.08em',
    });
    specLabel.textContent = 'SPECTROMETER';
    svg.appendChild(specLabel);

    const gratingX = (specX0 + specX1) / 2;
    for (let i = -5; i <= 5; i += 1) {
      svg.appendChild(
        svgEl('line', {
          x1: gratingX + i * 4,
          y1: sourceCY - 40,
          x2: gratingX + i * 4 - 10,
          y2: sourceCY + 40,
          style: 'stroke:var(--stage-lens-line)',
          'stroke-width': 1,
        })
      );
    }

    /* Phase 4 — the diffracted fan spreads from the grating to the screen. */
    const lines = currentLinesWithColor();
    const fanTopY = sourceCY - 70;
    const fanBottomY = sourceCY + 70;
    /* hydrogen's UV / IR series: the fan is there, but the eye can't see it */
    const unseen = seriesNeedsViewer();
    const targetYs = lines.map((ln) => fanTopY + ((fanBottomY - fanTopY) * ln.pct) / 100);

    if (isWhite()) {
      const sampleCount = 48;
      for (let i = 0; i <= sampleCount; i += 1) {
        const wl = Chemulator.VISIBLE_MIN_NM + ((Chemulator.VISIBLE_MAX_NM - Chemulator.VISIBLE_MIN_NM) * i) / sampleCount;
        const color = Chemulator.wavelengthToRGB(wl);
        const targetY = fanTopY + ((fanBottomY - fanTopY) * i) / sampleCount;
        const ray = svgEl('line', {
          x1: specX1,
          y1: sourceCY,
          x2: screenX,
          y2: targetY,
          stroke: color,
          'stroke-width': 2,
          opacity: state.powered ? 0.85 : 0.05,
        });
        svg.appendChild(ray);
        if (animate) animateDrawIn(ray, fanDelay, SEQ_FAN_MS);
      }
    } else if (unseen) {
      /* drawn below, with the bench and the plate */
    } else {
      lines.forEach((ln, i) => {
        const targetY = targetYs[i];
        const ray = svgEl('line', {
          x1: specX1,
          y1: sourceCY,
          x2: screenX,
          y2: targetY,
          stroke: ln.color,
          'stroke-width': 3,
          opacity: state.powered ? 0.95 : 0.05,
        });
        svg.appendChild(ray);
        if (animate) animateDrawIn(ray, fanDelay, SEQ_FAN_MS);
      });
    }

    /* the bench the plates stand on (also drawn while a plate leaves for a series it can't show) */
    const withBench = unseen || Boolean(ropt.departing);
    let ap = null;
    if (withBench) {
      ap = { svg, uid, W, H, lineYs: targetYs, rayStops: [], plate: null, plateLayer: null, plateClip: null, bench: null };
      defs.appendChild(buildBenchDefs(uid));
      ap.bench = drawBench(svg, uid, W, H);
    }
    if (unseen) drawInvisibleFan(svg, defs, ap, { lines, specX1, sourceCY, animate, fanDelay });

    /* This is the element the card2 -> card3 transition keeps visible while
     * everything else fades, then moves/rotates/scales toward the centre. */
    svg.appendChild(
      svgEl('rect', {
        id: 'apparatus-screen',
        x: screenX,
        y: fanTopY - 10,
        width: 14,
        height: fanBottomY - fanTopY + 20,
        style: 'fill:var(--stage-screen)',
        opacity: unseen ? 0.2 : 0.9,
        rx: 3,
      })
    );

    if (withBench) {
      /* the plate (if one is in the beam), above the screen it stands in front of */
      mountPlateLayer(ap, defs);
      apparatus = ap;
      const docked = ropt.departing || state.viewer;
      if (docked) {
        const plate = mountPlate(ap, docked);
        setPlatePose(plate, { x: PLATE.x, rise: 0, lean: 0 });
        const lit = !ropt.departing && viewerFits();
        setRayExtent(ap, 1);
        if (lit && state.powered) {
          addGlowSpots(ap, plate, !animate);
          if (animate) bloomLines(ap, fanDelay + SEQ_FAN_MS);
        }
      }
      if (ropt.departing) runUndock(ap, ropt.departing);
    }

    if (!state.powered) {
      const offLabel = svgEl('text', {
        x: W / 2,
        y: unseen ? BENCH_Y - 12 : H - 14, /* above the bench, clear of its slots */
        'text-anchor': 'middle',
        style: 'fill:var(--stage-muted)',
        'font-size': 12,
        'letter-spacing': '0.12em',
      });
      offLabel.textContent = 'SOURCE OFF \u00B7 FLIP THE SWITCH TO BEGIN';
      svg.appendChild(offLabel);
    }
  }

  /* ---------------- zoomed result view ---------------- */
  const CTA_TEXT = { uv: 'Add a UV screen', ir: 'Add an IR viewer' };
  let resultLit = false; // whether the strip last drawn shows glowing lines

  /* the small scale under a hydrogen UV / IR strip: ticks in nm, the series limit, and what the glow is */
  function drawSeriesAxis(svg, W, axisY, series, viewer) {
    const x0 = 40;
    const span = W - 80;
    const axis = Chemulator.seriesAxis(series);
    const at = (pct) => x0 + (pct / 100) * span;
    const ink = 'fill:var(--stage-muted)';

    svg.appendChild(svgEl('line', { class: 'axis-line', x1: x0, y1: axisY, x2: x0 + span, y2: axisY, style: 'stroke:var(--stage-line)', 'stroke-width': 1 }));
    /* every tick is marked; a label is dropped where it would touch its neighbour (the last keeps the unit) */
    const ticks = axis.ticks.map((nm, i) => {
      const text = String(nm) + (i === axis.ticks.length - 1 ? ' nm' : '');
      return { x: at(Chemulator.axisPercent(series, nm)), text, half: (text.length * 6.6 + 8) / 2 };
    });
    let leftEdge = Infinity;
    for (let i = ticks.length - 1; i >= 0; i -= 1) {
      ticks[i].label = ticks[i].x + ticks[i].half + 6 <= leftEdge;
      if (ticks[i].label) leftEdge = ticks[i].x - ticks[i].half;
    }
    ticks.forEach((tick) => {
      svg.appendChild(svgEl('line', { class: 'axis-tick', x1: tick.x, y1: axisY, x2: tick.x, y2: axisY + 5, style: 'stroke:var(--stage-line)', 'stroke-width': 1 }));
      if (!tick.label) return;
      const t = svgEl('text', { class: 'axis-label', x: tick.x, y: axisY + 19, 'text-anchor': 'middle', style: ink, 'font-size': 11, 'font-family': 'var(--font-mono, monospace)' });
      t.textContent = tick.text;
      svg.appendChild(t);
    });

    /* where the lines crowd together: the series limit */
    if (axis.limitPercent !== null) {
      const x = at(axis.limitPercent);
      svg.appendChild(svgEl('line', { class: 'limit-marker', x1: x, y1: axisY - 66, x2: x, y2: axisY + 5, style: 'stroke:var(--stage-muted)', 'stroke-width': 1.2, 'stroke-dasharray': '3 3', opacity: 0.8 }));
      svg.appendChild(svgEl('line', { x1: 12, y1: axisY + 31, x2: 12, y2: axisY + 41, style: 'stroke:var(--stage-muted)', 'stroke-width': 1.2, 'stroke-dasharray': '3 3' }));
      const lim = svgEl('text', { class: 'limit-label', x: 20, y: axisY + 40, style: ink, 'font-size': 12, 'font-family': 'var(--font-mono, monospace)' });
      lim.textContent = 'limit ' + series.limitNm.toFixed(1) + ' nm';
      svg.appendChild(lim);
    }

    /* the glow is a false colour: it says where a line falls, not what colour it is */
    if (viewer) {
      svg.appendChild(svgEl('circle', { class: 'false-colour-dot', cx: W - 112, cy: axisY + 36, r: 4, fill: viewer.glow }));
      const tag = svgEl('text', { class: 'false-colour-tag', x: W - 102, y: axisY + 40, style: ink, 'font-size': 12, 'font-family': 'var(--font-mono, monospace)' });
      tag.textContent = 'false colour';
      svg.appendChild(tag);
    }
  }

  /* hydrogen UV / IR with nothing to see yet: one short message and the way to fix it */
  function drawInvisibleMessage(svg, W, H2, series) {
    const viewer = Chemulator.viewerForSeries(series);
    const midY = H2 / 2;
    const msg = svgEl('text', { class: 'invisible-msg', x: W / 2, y: midY - 6, 'text-anchor': 'middle', style: 'fill:var(--stage-ink)', 'font-size': 16 });
    msg.textContent = 'Invisible to the eye.';
    svg.appendChild(msg);

    const fo = svgEl('foreignObject', { x: W / 2 - 90, y: midY + 6, width: 180, height: 44 });
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'add-viewer-btn';
    btn.dataset.viewer = viewer.id;
    btn.style.setProperty('--glow', viewer.glow);
    btn.textContent = CTA_TEXT[viewer.id];
    btn.addEventListener('click', () => setViewer(viewer.id));
    fo.appendChild(btn);
    svg.appendChild(fo);
  }

  function renderResultScreen(opts) {
    const o = opts || {};
    const svg = document.getElementById('result-svg');
    clearChildren(svg);
    resultLit = false;

    /* 1 viewBox unit = 1 css px, so labels stay a readable size on phones */
    const wrapW = svg.parentElement ? Math.round(svg.parentElement.clientWidth) : 0;
    const W = wrapW >= 280 ? wrapW : 900;
    const H = RESULT_VIEWBOX_H;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

    svg.appendChild(svgEl('rect', { x: 0, y: 0, width: W, height: H, rx: 10, style: 'fill:var(--stage-deep)' }));

    if (!state.powered) {
      const t = svgEl('text', {
        x: W / 2,
        y: H / 2 + 4,
        'text-anchor': 'middle',
        style: 'fill:var(--stage-muted)',
        'font-size': 12,
        'letter-spacing': '0.1em',
      });
      t.textContent = 'SOURCE OFF';
      svg.appendChild(t);
      return;
    }

    const defs = svgEl('defs');
    svg.appendChild(defs);

    if (isWhite()) {
      const grad = svgEl('linearGradient', { id: 'resultRainbow', x1: '0%', y1: '0%', x2: '100%', y2: '0%' });
      for (let i = 0; i <= 12; i += 1) {
        const wl = Chemulator.VISIBLE_MIN_NM + ((Chemulator.VISIBLE_MAX_NM - Chemulator.VISIBLE_MIN_NM) * i) / 12;
        grad.appendChild(svgEl('stop', { offset: (i / 12) * 100 + '%', 'stop-color': Chemulator.wavelengthToRGB(wl) }));
      }
      defs.appendChild(grad);
      svg.appendChild(svgEl('rect', { x: 20, y: 26, width: W - 40, height: H - 40, rx: 6, fill: 'url(#resultRainbow)' }));
      return;
    }

    const blur = svgEl('filter', { id: 'resultBlur', x: '-60%', y: '-60%', width: '220%', height: '220%' });
    blur.appendChild(svgEl('feGaussianBlur', { stdDeviation: 6 }));
    defs.appendChild(blur);

    /* hydrogen's UV / IR series: dark until the right plate is in the beam, with a scale underneath */
    const unseen = seriesNeedsViewer();
    const lit = unseen && viewerLit();
    const series = isHydrogen() ? currentSeries() : null;

    /* greedy row assignment: labels that would overlap horizontally drop to the next row */
    const LABEL_W = 84;
    const LABEL_H = 28;
    const ROW_GAP = 4;
    const LABEL_TOP = 4;
    const lines = currentLinesWithColor()
      .map((ln) => ({ ln, x: 40 + (ln.pct / 100) * (W - 80) }))
      .sort((p, q) => p.x - q.x);
    const rowEnds = [];
    lines.forEach((item) => {
      const left = Math.max(2, Math.min(W - LABEL_W - 2, item.x - LABEL_W / 2));
      let row = rowEnds.findIndex((end) => left >= end + 4);
      if (row === -1) { row = rowEnds.length; rowEnds.push(0); }
      rowEnds[row] = left + LABEL_W;
      item.left = left;
      item.row = row;
    });
    const rows = Math.max(1, rowEnds.length);
    const labelArea = LABEL_TOP + rows * LABEL_H + (rows - 1) * ROW_GAP + 6;
    const lineTop = labelArea + 4;
    const LINE_H = 62;
    const axisY = lineTop + LINE_H + 10;
    const H2 = unseen ? axisY + 50 : lineTop + LINE_H + 8;
    svg.setAttribute('viewBox', `0 0 ${W} ${H2}`);
    svg.firstChild.setAttribute('height', H2);

    if (unseen && !lit) {
      drawInvisibleMessage(svg, W, H2, series);
      return;
    }
    resultLit = lit;

    /* leaders + glows first so labels paint on top */
    const marks = [];
    lines.forEach((item) => {
      const x = item.x;
      const ln = item.ln;
      const mark = svgEl('g', { class: 'line-mark' });
      mark.style.cssText = 'transform-box:fill-box;transform-origin:center;';
      mark.appendChild(
        svgEl('rect', { x: x - 14, y: lineTop - 4, width: 28, height: LINE_H + 8, fill: ln.color, opacity: 0.3, filter: 'url(#resultBlur)' })
      );
      mark.appendChild(svgEl('rect', { x: x - 3, y: lineTop, width: 6, height: LINE_H, rx: 3, fill: ln.color }));
      if (item.row > 0) {
        const yLabelBottom = LABEL_TOP + item.row * (LABEL_H + ROW_GAP) + LABEL_H;
        mark.appendChild(
          svgEl('line', { x1: x, x2: x, y1: yLabelBottom, y2: lineTop, stroke: ln.color, 'stroke-width': 1.5, opacity: 0.75, class: 'label-leader' })
        );
      }
      svg.appendChild(mark);
      marks.push(mark);
    });
    const chips = [];
    lines.forEach((item) => {
      const ln = item.ln;
      const fo = svgEl('foreignObject', { x: item.left, y: LABEL_TOP + item.row * (LABEL_H + ROW_GAP), width: LABEL_W, height: LABEL_H });
      const btn = document.createElement('button');
      btn.type = 'button';
      const interactive = isHydrogen();
      btn.className = 'wavelength-btn' + (interactive ? '' : ' wavelength-btn--static');
      if (interactive && state.selectedLine && state.selectedLine === ln.line) btn.classList.add('active');
      btn.textContent = ln.wavelength.toFixed(1) + ' nm';
      if (interactive) {
        btn.addEventListener('click', () => selectSpectralLine(ln.line, btn));
      } else {
        btn.tabIndex = -1;
      }
      fo.appendChild(btn);
      svg.appendChild(fo);
      chips.push(fo);
    });

    if (unseen) drawSeriesAxis(svg, W, axisY, series, Chemulator.viewerForSeries(series));

    /* the glow arrives line by line */
    if (o.animate) {
      Motion.stagger(marks, { y: 0, scale: 0.6, gap: GLOW_STAGGER_MS, duration: GLOW_BLOOM_MS });
      Motion.stagger(chips, { y: 0, gap: GLOW_STAGGER_MS, delay: 120, duration: GLOW_BLOOM_MS });
    }
  }

  /* ---------------- transition panel: open/close, mode toggle ---------------- */
  function selectSpectralLine(line, buttonEl) {
    document.querySelectorAll('.wavelength-btn.active').forEach((el) => el.classList.remove('active'));
    buttonEl.classList.add('active');

    const panel = document.getElementById('transition-panel');
    const firstOpen = panel.hidden;

    state.selectedLine = line;
    panel.hidden = false;
    document.getElementById('transition-empty').hidden = true;

    panelCloseToken += 1;   // a close that is still fading must not hide the panel we just opened
    if (firstOpen) {
      panel.classList.remove('appear');
      void panel.offsetWidth;
      panel.classList.add('appear');
      updateTransitionPanelText();
      playActiveViewAnimation();
      return;
    }
    Motion.crossfade(transitionStage(), () => {
      updateTransitionPanelText();
      playActiveViewAnimation();
    });
  }

  function transitionStage() {
    return document.getElementById('energy-svg').parentNode;
  }

  let panelCloseToken = 0;
  function closeTransitionPanel() {
    clearActiveTransitionVisuals();
    state.selectedLine = null;
    document.querySelectorAll('.wavelength-btn.active').forEach((el) => el.classList.remove('active'));
    const panel = document.getElementById('transition-panel');
    if (!panel || panel.hidden) { updateTransitionEmpty(); return; }
    /* fade the open panel out, then put the empty state in its place */
    const token = ++panelCloseToken;
    Motion.exit(panel, { hide: false }).then(() => {
      if (token !== panelCloseToken) return;
      panel.hidden = true;
      panel.classList.remove('appear');
      updateTransitionEmpty();
    });
  }

  /* The Transition diagram card exists for hydrogen only: for every other source
   * the whole card is removed and the other two cards take its height. */
  function syncTransitionCard() {
    const card = document.getElementById('transition-card');
    if (card) card.hidden = !isHydrogen();
  }

  /* Empty-state of the Transition diagram card (hydrogen only). */
  function updateTransitionEmpty() {
    syncTransitionCard();
    const empty = document.getElementById('transition-empty');
    if (!empty) return;
    /* stays out of the way until a closing panel has finished fading */
    const panel = document.getElementById('transition-panel');
    empty.hidden = Boolean(state.selectedLine) || Boolean(panel && !panel.hidden);
  }

  function updateTransitionPanelText() {
    const t = state.selectedLine;
    if (!t) return;
    const title = document.getElementById('transition-panel-title');
    title.textContent = `n = ${t.nInitial} \u2192 n = ${t.nFinal} \u00B7 ${t.wavelength.toFixed(1)} nm \u00B7 ${t.energyEv.toFixed(2)} eV`;

    const caption = document.getElementById('transition-caption');
    if (state.viewMode === 'levels') {
      caption.textContent =
        'The photon energy exactly equals the gap between the two levels \u2014 only fixed gaps exist, so only fixed line colours appear. This is the evidence that electron energies are quantised.';
    } else {
      caption.textContent =
        'Bohr\u2019s picture of the same event: the electron drops from a larger allowed orbit to a smaller one, releasing the energy difference as one photon of a single, exact colour.';
    }
  }

  function setSvgHidden(svg, hide) {
    /* SVG elements have no `hidden` IDL property (it's HTMLElement-only),
     * so toggle the attribute directly for the CSS [hidden] rule to match. */
    if (hide) {
      svg.setAttribute('hidden', '');
    } else {
      svg.removeAttribute('hidden');
    }
  }

  function setViewMode(mode) {
    if (state.viewMode === mode) return;
    state.viewMode = mode;
    ['levels', 'atom'].forEach((m) => {
      const btn = document.getElementById('mode-' + m);
      btn.classList.toggle('active', mode === m);
      btn.setAttribute('aria-pressed', String(mode === m));
    });
    /* the two views are separate drawings: fade from one to the other */
    Motion.crossfade(transitionStage(), () => {
      setSvgHidden(document.getElementById('energy-svg'), mode !== 'levels');
      setSvgHidden(document.getElementById('atom-svg'), mode !== 'atom');
      updateTransitionPanelText();
      playActiveViewAnimation();
    });
  }

  function playActiveViewAnimation() {
    if (!state.selectedLine) return;
    if (state.viewMode === 'levels') {
      renderEnergyDiagram();
      playLevelTransition(state.selectedLine);
    } else {
      renderAtomDiagram();
      playAtomTransition(state.selectedLine);
    }
  }

  /* ---------------- view A: energy-level diagram ---------------- */
  const ENERGY_CHART = { x0: 90, x1: 470, top: 40, bottom: 312 };

  let transitionToken = 0;
  let activeTransitionTimeouts = [];

  /* phones draw this diagram at about half size, so its ink is scaled up (see styles.css) */
  function isNarrow() {
    return Boolean(window.matchMedia && window.matchMedia('(max-width: 600px)').matches);
  }

  /* Levels bunch up near the ionisation limit, so a true-to-scale axis would stack them on top of
   * each other. Order is kept, spacing is eased: one ladder for every series (n = 1..6 exactly as
   * Balmer has always been drawn, carried on to n = 9), rescaled so a series' top level reaches
   * the top of the chart. */
  const LEVEL_POS = { 1: 0, 2: 0.4, 3: 0.58, 4: 0.72, 5: 0.86, 6: 1, 7: 1.13, 8: 1.25, 9: 1.36 };
  const LIMIT_ROOM = 28; // kept above the top level for the n = infinity line

  function levelLayout() {
    const series = currentSeries();
    const nMax = series.lines[series.lines.length - 1].nInitial;
    /* Balmer's ladder fills the chart right up to its note, so only the other series have room for the limit */
    const hasLimit = series.id !== 'balmer';
    const topY = ENERGY_CHART.top + (hasLimit ? LIMIT_ROOM : 0);
    const ys = {};
    for (let n = 1; n <= nMax; n += 1) {
      ys[n] = ENERGY_CHART.bottom - (LEVEL_POS[n] / LEVEL_POS[nMax]) * (ENERGY_CHART.bottom - topY);
    }
    return { series, nMax, ys, limitY: hasLimit ? ENERGY_CHART.top : null };
  }

  /* Which levels get a label: the two the electron moves between always do, the rest only where
   * they clear a neighbour. */
  function pickLabelled(layout, involved) {
    const minGap = isNarrow() ? 27 : 17;
    const keep = new Set(involved);
    for (let n = 1; n <= layout.nMax; n += 1) {
      if (keep.has(n)) continue;
      const clash = Array.from(keep).some((k) => Math.abs(layout.ys[k] - layout.ys[n]) < minGap);
      if (!clash) keep.add(n);
    }
    return keep;
  }

  function renderEnergyDiagram() {
    const svg = document.getElementById('energy-svg');
    clearChildren(svg);
    transitionStage().style.aspectRatio = '';
    if (!isHydrogen()) return;

    const layout = levelLayout();
    const series = layout.series;
    const t = state.selectedLine;
    const involved = t ? [t.nInitial, t.nFinal] : [series.nFinal];
    const labelled = pickLabelled(layout, involved);

    const note = svgEl('text', {
      x: (ENERGY_CHART.x0 + ENERGY_CHART.x1) / 2,
      y: ENERGY_CHART.top - 18,
      'text-anchor': 'middle',
      'font-size': 13,
      'letter-spacing': '0.05em',
      class: 'svg-note',
    });
    note.textContent = `ALL ${series.name.toUpperCase()} TRANSITIONS LAND ON n = ${series.nFinal} \u00B7 SPACING NOT TO SCALE`;
    svg.appendChild(note);

    Chemulator.HYDROGEN_LEVELS.filter((lvl) => lvl.n <= layout.nMax).forEach((lvl) => {
      const y = layout.ys[lvl.n];
      const isLanding = lvl.n === series.nFinal;
      svg.appendChild(
        svgEl('line', {
          x1: ENERGY_CHART.x0,
          y1: y,
          x2: ENERGY_CHART.x1,
          y2: y,
          'stroke-width': isLanding ? 3 : 1.5,
          class: isLanding ? 'lvl-line lvl-line--landing' : 'lvl-line',
        })
      );
      if (!labelled.has(lvl.n)) return;
      const nLabel = svgEl('text', {
        x: ENERGY_CHART.x0 - 14,
        y: y + 5,
        'text-anchor': 'end',
        'font-size': 15,
        'font-family': 'var(--font-mono, monospace)',
        class: 'svg-n',
      });
      nLabel.textContent = 'n=' + lvl.n;
      svg.appendChild(nLabel);

      const evLabel = svgEl('text', {
        x: ENERGY_CHART.x1 + 12,
        y: y + 5,
        'font-size': 14,
        'font-family': 'var(--font-mono, monospace)',
        class: 'svg-ev',
      });
      evLabel.textContent = lvl.energyEv.toFixed(2) + ' eV';
      svg.appendChild(evLabel);
    });

    /* n = infinity: the electron is free, and every series' lines crowd up towards it */
    if (layout.limitY !== null) {
      svg.appendChild(
        svgEl('line', { x1: ENERGY_CHART.x0, y1: layout.limitY, x2: ENERGY_CHART.x1, y2: layout.limitY, 'stroke-width': 1.5, 'stroke-dasharray': '5 5', class: 'lvl-line lvl-line--limit' })
      );
      const nLabel = svgEl('text', { x: ENERGY_CHART.x0 - 14, y: layout.limitY + 5, 'text-anchor': 'end', 'font-size': 15, 'font-family': 'var(--font-mono, monospace)', class: 'svg-n' });
      nLabel.textContent = 'n=\u221E';
      svg.appendChild(nLabel);
      const evLabel = svgEl('text', { x: ENERGY_CHART.x1 + 12, y: layout.limitY + 5, 'font-size': 14, 'font-family': 'var(--font-mono, monospace)', class: 'svg-ev' });
      evLabel.textContent = Chemulator.HYDROGEN_LIMIT_EV.toFixed(2) + ' eV';
      svg.appendChild(evLabel);
    }
  }

  /* The photon. Balmer's is the colour you would see. A UV / IR photon has no colour to the eye:
   * a dashed grey wave, tighter the more energy it carries. */
  function photonCycles(line) {
    if (line.seriesId === 'balmer') return 4;
    return Math.max(2, Math.round(3.2 * Math.sqrt(550 / line.wavelength)));
  }

  function photonLook(line) {
    const invisible = Chemulator.lightBand(line.wavelength) !== 'visible';
    return {
      invisible,
      color: invisible ? 'var(--muted)' : Chemulator.wavelengthToRGB(line.wavelength),
      cycles: photonCycles(line),
      tag: invisible ? Chemulator.VIEWERS[Chemulator.lightBand(line.wavelength)].tag : null,
    };
  }

  function buildSquigglyPath(x0, y0, look, length) {
    const cycles = look.cycles;
    const amplitude = 7;
    const steps = Math.max(32, cycles * 8);
    const len = length || 140;
    const points = [];
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const x = x0 + t * len;
      const y = y0 + Math.sin(t * cycles * Math.PI * 2) * amplitude;
      points.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    const path = svgEl('path', {
      d: points.join(' '),
      fill: 'none',
      style: 'stroke:' + look.color,
      'stroke-width': 2.5,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      class: look.invisible ? 'photon-squiggle photon-squiggle--invisible' : 'photon-squiggle',
    });
    if (look.invisible) path.setAttribute('stroke-dasharray', '6 5');
    return path;
  }

  /* the photon leaves the atom: the visible one draws itself in, the dashed one is wiped in
   * (a dashed line cannot be drawn with a dash offset without losing its dashes) */
  function sendPhoton(svg, photon, look, tagX, tagY) {
    svg.appendChild(photon);
    if (!look.invisible) {
      animateDrawIn(photon, 0, ANIM_ELECTRON_FALL_MS);
      return;
    }
    Motion.animate(photon, [{ clipPath: 'inset(-8px 100% -8px 0)' }, { clipPath: 'inset(-8px 0 -8px 0)' }],
      { duration: ANIM_ELECTRON_FALL_MS, easing: Motion.easeMove() });
    /* the tag sits just above the middle of the wave */
    const tag = svgEl('text', {
      x: tagX,
      y: tagY,
      'text-anchor': 'middle',
      style: 'paint-order:stroke;stroke:var(--card);stroke-width:4px;stroke-linejoin:round',
      'font-size': 12,
      'font-family': 'var(--font-mono, monospace)',
      'letter-spacing': '0.08em',
      class: 'svg-ev photon-tag',
    });
    tag.textContent = look.tag;
    svg.appendChild(tag);
    Motion.animate(tag, [{ opacity: 0 }, { opacity: 1 }], { delay: ANIM_ELECTRON_FALL_MS * 0.7, duration: 'base' });
  }

  function clearActiveTransitionVisuals() {
    transitionToken += 1;
    activeTransitionTimeouts.forEach((id) => clearTimeout(id));
    activeTransitionTimeouts = [];
    document.querySelectorAll('.js-electron, .photon-squiggle, .photon-tag').forEach((el) => el.remove());
  }

  function playLevelTransition(line) {
    const svg = document.getElementById('energy-svg');
    if (!svg || !isHydrogen()) return;

    clearActiveTransitionVisuals();
    const token = transitionToken;

    const look = photonLook(line);
    const layout = levelLayout();
    const x = (ENERGY_CHART.x0 + ENERGY_CHART.x1) / 2 + 40;
    const yInitial = layout.ys[line.nInitial];
    const yFinal = layout.ys[line.nFinal];

    const electron = svgEl('circle', {
      cx: x,
      cy: yInitial,
      r: 7,
      style: 'fill:var(--electron);stroke:' + look.color,
      'stroke-width': 2.5,
      class: 'js-electron electron-vibrate',
    });
    svg.appendChild(electron);

    const t1 = setTimeout(() => {
      if (token !== transitionToken) return;
      electron.classList.remove('electron-vibrate');

      const midY = (yInitial + yFinal) / 2;
      const photon = buildSquigglyPath(x + 16, midY, look);
      sendPhoton(svg, photon, look, x + 16 + 70, midY - 14);

      electron.style.cy = yInitial + 'px';
      Motion.to(electron, { cy: yFinal + 'px' }, { duration: ANIM_ELECTRON_FALL_MS });
    }, ANIM_VIBRATE_MS);
    activeTransitionTimeouts.push(t1);
  }

  /* ---------------- view B: atomic (Bohr orbit) view ----------------
   * Modelled on the NAAP hydrogen-atom simulator: proton at the centre and every orbit the series
   * uses with correct relative spacing (r proportional to n^2). The outermost orbit is always
   * 140 px, so the landing orbit shrinks as the series' top level grows: Balmer's n = 2 is 16 px,
   * Lyman's n = 1 only 6 px. That one is shown again in a magnifier, at the same scale throughout. */
  const ATOM_VIEW = { cx: 320, cy: 192, rMax: 140 };
  const LENS = { zoom: 3.5, r: 100 }; // the magnifier: its radius, and how much it enlarges
  const MIN_LANDING_R = 12; // below this the landing orbit is too small to read

  function atomLayout() {
    const series = currentSeries();
    const nMax = series.lines[series.lines.length - 1].nInitial;
    const narrow = isNarrow();
    const a0 = ATOM_VIEW.rMax / (nMax * nMax);
    const lensOn = a0 * series.nFinal * series.nFinal < MIN_LANDING_R;
    const layout = { series, nMax, narrow, a0, rMax: ATOM_VIEW.rMax, cy: ATOM_VIEW.cy, cx: ATOM_VIEW.cx, lens: null, viewBox: narrow ? '150 0 340 340' : '0 0 640 340', aspect: '' };
    if (lensOn) {
      if (narrow) {
        /* a phone is narrow and tall: the magnifier goes underneath the atom */
        layout.cx = 170;
        layout.cy = 176;
        layout.lens = { cx: 170, cy: 448, r: LENS.r, zoom: LENS.zoom };
        layout.viewBox = '0 0 340 556';
        layout.aspect = '340 / 556';
      } else {
        layout.cx = 240;
        layout.lens = { cx: 520, cy: 226, r: LENS.r, zoom: LENS.zoom };
      }
    }
    return layout;
  }

  function atomOrbitRadius(layout, n) {
    return Chemulator.bohrOrbitRadius(n, layout.rMax, layout.nMax);
  }

  /* where a point of the atom lands inside the magnifier */
  function lensPoint(layout, x, y) {
    const lens = layout.lens;
    return [lens.cx + lens.zoom * (x - layout.cx), lens.cy + lens.zoom * (y - layout.cy)];
  }

  /* the proton with its + sign */
  function drawProton(svg, cx, cy, r) {
    svg.appendChild(svgEl('circle', { cx, cy, r, style: 'fill:var(--proton)' }));
    if (r < 6) return;
    const plus = svgEl('text', {
      x: cx,
      y: cy + 4.5,
      'text-anchor': 'middle',
      'font-size': 13,
      style: 'fill:var(--proton-ink)',
      'font-weight': '600',
    });
    plus.textContent = '+';
    svg.appendChild(plus);
  }

  function orbitLabel(svg, cx, cy, r, n, anchorEnd) {
    const lbl = svgEl('text', {
      x: anchorEnd ? cx - 3 : cx,
      y: cy - r - 4,
      'text-anchor': anchorEnd ? 'end' : 'middle',
      style: 'paint-order:stroke;stroke:var(--card);stroke-width:4px;stroke-linejoin:round',
      'font-size': 14,
      'font-family': 'var(--font-mono, monospace)',
      class: 'svg-ev',
    });
    lbl.textContent = 'n=' + n;
    svg.appendChild(lbl);
  }

  /* the two lines that join the part of the atom being enlarged to the magnifier */
  function drawLensConnector(svg, layout) {
    const lens = layout.lens;
    const r1 = lens.r / lens.zoom; // the stretch of atom the magnifier shows
    const dx = lens.cx - layout.cx;
    const dy = lens.cy - layout.cy;
    const d = Math.hypot(dx, dy);
    const base = Math.atan2(dy, dx);
    const off = Math.acos((r1 - lens.r) / d);
    [-1, 1].forEach((side) => {
      const a = base + side * off;
      svg.appendChild(
        svgEl('line', {
          x1: layout.cx + r1 * Math.cos(a),
          y1: layout.cy + r1 * Math.sin(a),
          x2: lens.cx + lens.r * Math.cos(a),
          y2: lens.cy + lens.r * Math.sin(a),
          class: 'lens-link',
        })
      );
    });
    svg.appendChild(svgEl('circle', { cx: layout.cx, cy: layout.cy, r: r1, class: 'lens-link lens-link--ring' }));
  }

  function drawLens(svg, layout, landingN) {
    const lens = layout.lens;
    const g = svgEl('g', { class: 'atom-lens' });
    const clipId = 'atomLensClip';
    const clip = svgEl('clipPath', { id: clipId });
    clip.appendChild(svgEl('circle', { cx: lens.cx, cy: lens.cy, r: lens.r }));
    g.appendChild(clip);
    g.appendChild(svgEl('circle', { cx: lens.cx, cy: lens.cy, r: lens.r, class: 'lens-glass' }));

    const inner = svgEl('g', { 'clip-path': `url(#${clipId})` });
    for (let n = 1; n <= layout.nMax; n += 1) {
      const r = atomOrbitRadius(layout, n) * lens.zoom;
      if (r > lens.r + 4) break;
      inner.appendChild(
        svgEl('circle', {
          cx: lens.cx,
          cy: lens.cy,
          r,
          'stroke-width': n === landingN ? 2.5 : 1.2,
          class: n === landingN ? 'atom-orbit atom-orbit--landing' : 'atom-orbit',
        })
      );
      orbitLabel(inner, lens.cx, lens.cy, r, n, true);
    }
    drawProton(inner, lens.cx, lens.cy, 7);
    g.appendChild(inner);
    g.appendChild(svgEl('circle', { cx: lens.cx, cy: lens.cy, r: lens.r, class: 'lens-rim' }));

    const zoomLabel = svgEl('text', {
      x: lens.cx,
      y: lens.cy + lens.r - 10,
      'text-anchor': 'middle',
      'font-size': 13,
      'font-family': 'var(--font-mono, monospace)',
      class: 'svg-ev lens-zoom',
    });
    zoomLabel.textContent = '\u00D7' + lens.zoom;
    g.appendChild(zoomLabel);
    svg.appendChild(g);
  }

  function renderAtomDiagram() {
    const svg = document.getElementById('atom-svg');
    clearChildren(svg);
    if (!isHydrogen()) {
      transitionStage().style.aspectRatio = '';
      return;
    }
    const layout = atomLayout();
    const series = layout.series;
    /* phones: crop the empty side margins so the atom fills the narrow card */
    svg.setAttribute('viewBox', layout.viewBox);
    transitionStage().style.aspectRatio = layout.aspect;

    const note = svgEl('text', {
      x: layout.cx,
      y: 20,
      'text-anchor': 'middle',
      'font-size': 13,
      'letter-spacing': '0.05em',
      class: 'svg-note',
    });
    note.textContent = 'BOHR MODEL \u00B7 ORBIT RADII TO SCALE (r \u221D n\u00B2)' + (layout.lens ? ` \u00B7 INSET \u00D7${layout.lens.zoom}` : '');
    svg.appendChild(note);

    if (layout.lens) drawLensConnector(svg, layout);

    /* label the orbits the electron moves between, and any other that clears its neighbour */
    const t = state.selectedLine;
    const involved = new Set(t ? [t.nInitial, t.nFinal] : [series.nFinal]);
    const labelled = new Set();
    involved.forEach((n) => { if (n >= 2) labelled.add(n); });
    for (let n = 2; n <= layout.nMax; n += 1) {
      if (labelled.has(n)) continue;
      const r = atomOrbitRadius(layout, n);
      const clash = Array.from(labelled).some((k) => Math.abs(atomOrbitRadius(layout, k) - r) < 17);
      if (!clash && r > 15) labelled.add(n);
    }

    for (let n = 1; n <= layout.nMax; n += 1) {
      const r = atomOrbitRadius(layout, n);
      const isLanding = n === series.nFinal;
      svg.appendChild(
        svgEl('circle', {
          cx: layout.cx,
          cy: layout.cy,
          r,
          'stroke-width': isLanding ? 2.5 : 1.2,
          class: isLanding ? 'atom-orbit atom-orbit--landing' : 'atom-orbit',
        })
      );
      if (labelled.has(n) && !(layout.lens && r < layout.lens.r / layout.lens.zoom)) orbitLabel(svg, layout.cx, layout.cy, r, n);
    }

    /* proton: a dot small enough to leave a tiny landing orbit visible when there is a magnifier */
    drawProton(svg, layout.cx, layout.cy, layout.lens ? 2.6 : 7);
    if (layout.lens) drawLens(svg, layout, series.nFinal);
  }

  function playAtomTransition(line) {
    const svg = document.getElementById('atom-svg');
    if (!svg || !isHydrogen()) return;

    clearActiveTransitionVisuals();
    const token = transitionToken;

    const look = photonLook(line);
    const layout = atomLayout();
    /* electron sits on the upper-right diagonal of its orbit */
    const angle = -Math.PI / 4;
    const rInitial = atomOrbitRadius(layout, line.nInitial);
    const rFinal = atomOrbitRadius(layout, line.nFinal);
    const xInitial = layout.cx + rInitial * Math.cos(angle);
    const yInitial = layout.cy + rInitial * Math.sin(angle);
    const xFinal = layout.cx + rFinal * Math.cos(angle);
    const yFinal = layout.cy + rFinal * Math.sin(angle);

    const electronR = layout.lens ? 4 : 6;
    const electron = svgEl('circle', {
      cx: xInitial,
      cy: yInitial,
      r: electronR,
      style: 'fill:var(--electron);stroke:' + look.color,
      'stroke-width': 2.5,
      class: 'js-electron electron-vibrate',
    });
    svg.appendChild(electron);

    /* the same electron, seen through the magnifier */
    let lensElectron = null;
    let lensFrom = null;
    let lensTo = null;
    if (layout.lens) {
      lensFrom = lensPoint(layout, xInitial, yInitial);
      lensTo = lensPoint(layout, xFinal, yFinal);
      lensElectron = svgEl('circle', {
        cx: lensFrom[0],
        cy: lensFrom[1],
        r: 6,
        style: 'fill:var(--electron);stroke:' + look.color,
        'stroke-width': 2.5,
        'clip-path': 'url(#atomLensClip)',
        class: 'js-electron electron-vibrate',
      });
      svg.appendChild(lensElectron);
    }

    const t1 = setTimeout(() => {
      if (token !== transitionToken) return;
      electron.classList.remove('electron-vibrate');
      if (lensElectron) lensElectron.classList.remove('electron-vibrate');

      /* photon squiggle exits outward, away from the nucleus, from the jump midpoint */
      const midX = (xInitial + xFinal) / 2;
      const midY = (yInitial + yFinal) / 2;
      /* Balmer's is drawn as it always was; the others are kept inside the view on a phone */
      const vb = layout.viewBox.split(' ').map(Number);
      const room = layout.narrow && line.seriesId !== 'balmer' ? Math.max(70, Math.min(150, vb[0] + vb[2] - 10 - (midX + 14))) : 150;
      const photon = buildSquigglyPath(midX + 14, midY - 10, look, room);
      sendPhoton(svg, photon, look, midX + 14 + room / 2, midY - 10 - 14);

      electron.style.cx = xInitial + 'px';
      electron.style.cy = yInitial + 'px';
      Motion.to(electron, { cx: xFinal + 'px', cy: yFinal + 'px' }, { duration: ANIM_ELECTRON_FALL_MS });
      if (lensElectron) {
        lensElectron.style.cx = lensFrom[0] + 'px';
        lensElectron.style.cy = lensFrom[1] + 'px';
        Motion.to(lensElectron, { cx: lensTo[0] + 'px', cy: lensTo[1] + 'px' }, { duration: ANIM_ELECTRON_FALL_MS });
      }
    }, ANIM_VIBRATE_MS);
    activeTransitionTimeouts.push(t1);
  }

  /* ---------------- EM spectrum comparison bar (toggleable) ---------------- */
  function emMarker(strip, ln, className, color, hollow) {
    const mark = document.createElement('div');
    mark.className = 'em-marker' + (className ? ' ' + className : '');
    mark.style.left = Chemulator.emSpectrumPercentFromNm(ln.wavelength) + '%';
    if (hollow) {
      mark.classList.add('em-marker--hollow');
    } else {
      mark.style.background = color;
      if (!className) mark.style.boxShadow = `0 0 6px ${color}`;
    }
    mark.title = `${ln.wavelength.toFixed(1)} nm`;
    strip.appendChild(mark);
  }

  /* five labelled dots: which of hydrogen's series the eye can see on its own */
  function renderEmLegend(legend) {
    clearChildren(legend);
    Chemulator.HYDROGEN_SERIES.forEach((series) => {
      const item = document.createElement('span');
      item.className = 'em-legend-item' + (series.id === state.series ? ' is-current' : '');
      const dot = document.createElement('i');
      dot.className = 'em-dot';
      if (series.band === 'visible') {
        dot.classList.add('em-dot--visible');
      } else if (series.id === state.series && viewerLit()) {
        dot.style.background = Chemulator.VIEWERS[state.viewer].glow;
        dot.style.borderColor = Chemulator.VIEWERS[state.viewer].glow;
      }
      item.appendChild(dot);
      item.appendChild(document.createTextNode(series.name));
      legend.appendChild(item);
    });
  }

  function renderEmSpectrum() {
    const bar = document.getElementById('em-bar');
    clearChildren(bar);

    Chemulator.EM_SPECTRUM_BANDS.forEach((band) => {
      const startPct = Chemulator.emSpectrumPercent(band.minM);
      const endPct = Chemulator.emSpectrumPercent(band.maxM);
      const seg = document.createElement('div');
      seg.className = 'em-band';
      seg.style.left = startPct + '%';
      seg.style.width = Math.max(0, endPct - startPct) + '%';
      if (band.name === 'Visible') {
        seg.style.background = 'var(--em-visible-gradient)';
      } else {
        seg.style.background = band.color;
      }
      seg.title = band.name;
      const label = document.createElement('span');
      label.className = 'em-band-label';
      label.textContent = band.name;
      /* a label can't fit a sliver (the visible band is ~1% of the log axis); the axis row names it */
      if (endPct - startPct < 6) label.style.display = 'none';
      seg.appendChild(label);
      bar.appendChild(seg);
    });

    /* The source's line spectrum sits UNDER the continuous EM bar on the same
     * log-wavelength axis, rather than overlaid on top of it. */
    const strip = document.getElementById('em-line-strip');
    const stripLabel = document.getElementById('em-line-strip-label');
    const legend = document.getElementById('em-legend');
    clearChildren(strip);
    legend.hidden = true;

    if (state.powered && isHydrogen()) {
      const series = currentSeries();
      stripLabel.textContent = series.id === 'balmer'
        ? `${currentSourceData().name}\u2019s line spectrum, on the same axis`
        : `${currentSourceData().name}\u2019s ${series.name} lines, on the same axis`;
      /* the other four series, faint: where they fall, and that only Balmer is in the eye's band */
      Chemulator.HYDROGEN_SERIES.forEach((other) => {
        if (other.id === series.id) return;
        other.lines.forEach((ln) => {
          const look = Chemulator.appearance(lineNm(ln), null);
          emMarker(strip, { wavelength: lineNm(ln) }, 'em-marker--faint', look.color || 'var(--stage-muted)', false);
        });
      });
      /* this series: its own colour, the plate's glow, or a hollow marker while nothing shows it */
      currentLinesWithColor().forEach((ln) => emMarker(strip, ln, '', ln.color, !ln.visible));
      renderEmLegend(legend);
      legend.hidden = false;
    } else if (state.powered && !isWhite()) {
      stripLabel.textContent = `${currentSourceData().name}\u2019s line spectrum, on the same axis`;
      currentLinesWithColor().forEach((ln) => emMarker(strip, ln, '', ln.color, false));
    } else if (state.powered && isWhite()) {
      stripLabel.textContent = 'White light\u2019s continuous spectrum, on the same axis';
      const startPct = Chemulator.emSpectrumPercentFromNm(Chemulator.VISIBLE_MAX_NM);
      const endPct = Chemulator.emSpectrumPercentFromNm(Chemulator.VISIBLE_MIN_NM);
      const band = document.createElement('div');
      band.className = 'em-marker-band';
      band.style.left = startPct + '%';
      band.style.width = endPct - startPct + '%';
      band.style.background =
        'linear-gradient(90deg, ' +
        Array.from({ length: 9 }, (_, i) => {
          const wl = Chemulator.VISIBLE_MAX_NM - ((Chemulator.VISIBLE_MAX_NM - Chemulator.VISIBLE_MIN_NM) * i) / 8;
          return Chemulator.wavelengthToRGB(wl);
        }).join(', ') +
        ')';
      strip.appendChild(band);
    }
  }

  /* ---------------- EM comparison loupe ----------------
   * Hovering the full-spectrum bar or the line strip pops up a magnified copy of the
   * stretch under the cursor (3x wide, 2.2x tall), with the wavelength it points at. */
  function initEmLoupe() {
    const wrap = document.getElementById('em-reveal-wrap');
    const bar = document.getElementById('em-bar');
    const strip = document.getElementById('em-line-strip');
    const targets = [document.getElementById('em-bar-wrap'), strip];
    if (!wrap || !bar || !strip || !targets[0]) return;
    const ZX = 3;
    const ZY = 2.2;
    const LW = 260;
    const LH = Math.round((44 + 36) * ZY);
    let loupe = null;
    let inner = null;
    let readout = null;
    let source = null;

    function nmLabel(nm) {
      if (nm >= 1e6) return (nm / 1e6).toPrecision(3) + ' mm';
      if (nm >= 1e4) return (nm / 1e3).toPrecision(3) + ' \u00B5m';
      if (nm >= 1) return nm.toPrecision(3) + ' nm';
      return (nm * 1e3).toPrecision(3) + ' pm';
    }

    function percentToNm(pct) {
      const logMax = Math.log10(Chemulator.EM_AXIS_MAX_M);
      const logMin = Math.log10(Chemulator.EM_AXIS_MIN_M);
      return Math.pow(10, logMax - (pct / 100) * (logMax - logMin)) * 1e9;
    }

    function copyOf(node) {
      const c = node.cloneNode(true);
      c.removeAttribute('id');
      c.querySelectorAll('[title]').forEach((el) => el.removeAttribute('title'));
      return c;
    }

    function build(width) {
      loupe = document.createElement('div');
      loupe.className = 'em-loupe';
      loupe.setAttribute('aria-hidden', 'true');
      inner = document.createElement('div');
      inner.className = 'em-loupe-inner';
      inner.style.width = width + 'px';
      inner.appendChild(copyOf(bar));
      inner.appendChild(copyOf(strip));
      const guide = document.createElement('i');
      guide.className = 'em-loupe-guide';
      readout = document.createElement('span');
      readout.className = 'em-loupe-read';
      loupe.appendChild(inner);
      loupe.appendChild(guide);
      loupe.appendChild(readout);
      wrap.appendChild(loupe);
    }

    function hide() {
      if (loupe) loupe.remove();
      loupe = inner = readout = source = null;
    }

    function move(e) {
      if (!state.emVisible) return;
      const rect = e.currentTarget.getBoundingClientRect();
      if (rect.width < 1) return;
      const x = Math.min(rect.width, Math.max(0, e.clientX - rect.left));
      if (!loupe || source !== e.currentTarget) {
        hide();
        source = e.currentTarget;
        build(rect.width);
      }
      inner.style.transform = `translate(${LW / 2 - ZX * x}px, 0) scale(${ZX}, ${ZY})`;
      readout.textContent = nmLabel(percentToNm((x / rect.width) * 100));
      const wrapRect = wrap.getBoundingClientRect();
      const barRect = targets[0].getBoundingClientRect();
      const left = Math.min(wrapRect.width - LW, Math.max(0, e.clientX - wrapRect.left - LW / 2));
      /* above the bar when there is room in the viewport, otherwise below the strip */
      const above = barRect.top - LH - 10 > 8;
      const top = above ? barRect.top - wrapRect.top - LH - 10 : strip.getBoundingClientRect().bottom - wrapRect.top + 10;
      loupe.style.left = left + 'px';
      loupe.style.top = top + 'px';
    }

    targets.forEach((t) => {
      t.addEventListener('pointermove', move);
      t.addEventListener('pointerleave', hide);
    });
  }

  function initEmToggle() {
    const btn = document.getElementById('em-toggle');
    btn.addEventListener('click', () => {
      state.emVisible = !state.emVisible;
      const wrap = document.getElementById('em-reveal-wrap');
      if (state.emVisible) {
        renderEmSpectrum();
        wrap.classList.add('phase-visible');
        wrap.classList.remove('animate-in');
        void wrap.offsetWidth;
        wrap.classList.add('animate-in');
        btn.textContent = 'Hide full EM spectrum \u2191';
        btn.classList.add('active');
      } else {
        btn.textContent = 'Compare to full EM spectrum \u2193';
        btn.classList.remove('active');
        /* closing mirrors opening: fade out, then take it out of the layout */
        Motion.exit(wrap, { hide: false }).then(() => {
          if (!state.emVisible) wrap.classList.remove('phase-visible', 'animate-in');
        });
      }
      btn.setAttribute('aria-expanded', String(state.emVisible));
    });
  }

  /* ---------------- headline / description text ---------------- */
  function renderHeadline() {
    const data = currentSourceData();
    const headline = document.querySelector('.headline');
    if (headline) headline.dataset.source = state.source;
    document.getElementById('source-symbol').textContent = data.symbol;
    document.getElementById('source-name').textContent = data.name;
    /* hydrogen's description follows the series on show */
    document.getElementById('source-description').textContent = isHydrogen() ? currentSeries().description : data.description;
  }

  /* ---------------- Line spectrum card: empty-state <-> result ---------------- */
  function updateSetupHint() {
    document.getElementById('setup-hint').textContent = state.powered ? '' : 'Flip the power switch on to begin.';
  }

  function hideResult() {
    state.resultShown = false;
    closeTransitionPanel();
    document.getElementById('result-svg').classList.remove('visible');
    document.getElementById('spectrum-body').hidden = true;
    const empty = document.getElementById('spectrum-empty');
    empty.hidden = false;
    empty.textContent = state.powered
      ? 'Watch the light travel to the screen…'
      : 'Switch the power on to see the spectrum.';
  }

  function showResult() {
    state.resultShown = true;
    document.getElementById('spectrum-empty').hidden = true;
    const body = document.getElementById('spectrum-body');
    const arriving = body.hidden;
    body.hidden = false;
    if (arriving) Motion.enter(body, { y: 6 });
    renderResultScreen({ animate: viewerLit() });
    document.getElementById('result-svg').classList.add('visible');
    updateStageNote();
    if (seriesNeedsViewer() && !viewerLit()) announce('Invisible to the eye.');
    if (state.emVisible) renderEmSpectrum();
  }

  function updateStageNote() {
    document.getElementById('stage-note').textContent = isHydrogen()
      ? seriesNeedsViewer()
        ? (viewerLit() ? 'Glow shows where the lines fall. Click one.' : 'Invisible to the eye.')
        : 'Each line is one exact colour. Click a wavelength to see the electron transition responsible for that line.'
      : isWhite()
        ? 'Every visible wavelength arrived, so the rainbow is continuous with no gaps.'
        : 'Each line is one exact colour \u2014 a fingerprint unique to this element.';
  }

  /* ---------------- hydrogen series, and the plate you add to see UV / IR ---------------- */
  function buildSeriesToggle() {
    const wrap = document.getElementById('series-toggle');
    clearChildren(wrap);
    Chemulator.HYDROGEN_SERIES.forEach((series) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.series = series.id;
      btn.setAttribute('aria-pressed', 'false');
      btn.textContent = `${series.name} \u00B7 ${series.bandLabel}`;
      btn.addEventListener('click', () => selectSeries(series.id));
      wrap.appendChild(btn);
    });
  }

  /* a small slab in its holder, in the plate's own colour */
  function plateIcon(glow) {
    return '<svg class="plate-icon" viewBox="0 0 16 26" aria-hidden="true" focusable="false">' +
      '<rect class="plate-icon-slab" x="3.5" y="5" width="9" height="15" rx="2" style="fill:' + glow + '"/>' +
      '<rect x="6" y="1.5" width="4" height="3.5" rx="1"/>' +
      '<rect x="1.5" y="20" width="13" height="3.5" rx="1"/></svg>';
  }

  function buildViewerTray() {
    const slots = document.getElementById('tray-slots');
    clearChildren(slots);
    Chemulator.VIEWER_ORDER.forEach((id) => {
      const viewer = Chemulator.VIEWERS[id];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tray-btn';
      btn.dataset.viewer = id;
      btn.setAttribute('aria-pressed', 'false');
      btn.style.setProperty('--glow', viewer.glow);
      btn.innerHTML = plateIcon(viewer.glow) + '<span class="tray-btn-label"></span>';
      btn.querySelector('.tray-btn-label').textContent = viewer.name;
      btn.addEventListener('click', () => setViewer(state.viewer === id ? null : id));
      slots.appendChild(btn);
    });
  }

  /* what the setup card offers right now: the series control (hydrogen) and the tray (UV / IR) */
  function syncSeriesUI() {
    const toggle = document.getElementById('series-toggle');
    toggle.hidden = !isHydrogen();
    toggle.querySelectorAll('button').forEach((btn) => {
      const on = btn.dataset.series === state.series;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', String(on));
    });

    const needs = seriesNeedsViewer();
    document.getElementById('viewer-tray').hidden = !needs;
    document.getElementById('setup-card').classList.toggle('has-series', isHydrogen());
    document.getElementById('setup-card').classList.toggle('has-tray', needs);
    document.querySelectorAll('.tray-btn').forEach((btn) => {
      const on = needs && btn.dataset.viewer === state.viewer;
      btn.setAttribute('aria-pressed', String(on));
      btn.classList.toggle('is-out', on);
    });
    /* a plate that can't show this series: still in the beam, nothing glows */
    const wrong = needs && state.viewer && !viewerFits() && !state.docking;
    document.getElementById('tray-hint').textContent = wrong ? `No glow. Try the ${Chemulator.viewerForSeries(currentSeries()).name}.` : '';
  }

  /* status changes, for screen readers */
  function announce(text) {
    const el = document.getElementById('viewer-status');
    if (el) el.textContent = text;
  }

  function selectSeries(id) {
    if (!isHydrogen() || id === state.series || !seriesById(id)) return;
    state.series = id;
    /* a plate that can't show the new series slides out; one that can stays where it is */
    let departing = null;
    if (state.viewer && !viewerFits()) {
      departing = state.viewer;
      state.viewer = null;
    }
    closeTransitionPanel();
    /* only the fan is replayed: the tube, lens and spectrometer are already lit */
    render({ playSequence: state.powered, fanOnly: true, departing });
    announce(seriesNeedsViewer() && !viewerFits() ? 'Invisible to the eye.' : '');
  }

  /* Put a plate in the beam (or take it out, with null): it travels, the rays land on it, the lines
   * bloom, and only then does the Line spectrum card change. */
  function setViewer(next) {
    if (!seriesNeedsViewer() || next === state.viewer) return;
    cancelDock();
    const token = dockToken;
    const ap = apparatus;
    const prev = state.viewer;
    state.viewer = next;
    state.docking = true;
    closeTransitionPanel();
    syncSeriesUI();

    let chain = Promise.resolve();
    if (prev && ap) chain = chain.then(() => runUndock(ap, prev));
    if (next && ap) chain = chain.then(() => (token === dockToken ? runDock(ap, next) : null));
    chain
      .then(() => (token === dockToken ? landViewer(ap, token) : null))
      .then(() => {
        if (token !== dockToken) return;
        state.docking = false;
        syncSeriesUI();
        refreshResult(true);
        announce(
          next
            ? Chemulator.VIEWERS[next].name + (viewerFits() ? ' in place.' : ' in place. No glow.')
            : Chemulator.VIEWERS[prev].name + ' removed. Invisible to the eye.'
        );
      });
  }

  /* the plate is down: the rays reach it, then each line blooms */
  function landViewer(ap, token) {
    if (!ap || !ap.plate) return Promise.resolve();
    const plate = ap.plate;
    if (!state.powered) {
      setRayExtent(ap, 1);
      return Promise.resolve();
    }
    return waitMs(state.sequenceEndsAt - performance.now())
      .then(() => (token === dockToken ? runTween({ duration: PLATE_LAND_MS, update: (p) => setRayExtent(ap, p) }) : null))
      .then(() => {
        /* the wrong plate catches the rays too, but nothing glows */
        if (token !== dockToken || !viewerFits()) return null;
        addGlowSpots(ap, plate, false);
        return bloomLines(ap, 0);
      });
  }

  /* the Line spectrum card follows the plate: dark with a way to add one, or glowing with chips */
  function refreshResult(animate) {
    updateStageNote();
    if (state.emVisible) renderEmSpectrum();
    if (!state.powered || !state.resultShown) return;
    if (viewerLit() === resultLit) return;
    const result = document.getElementById('result-svg');
    const hadFocus = result.contains(document.activeElement);
    Motion.crossfade(result, () => renderResultScreen({ animate }));
    /* the button that was pressed is gone: keep the keyboard where the action continues */
    if (hadFocus) {
      const next = result.querySelector('.wavelength-btn:not(.wavelength-btn--static)') || result.querySelector('.add-viewer-btn');
      if (next) next.focus();
    }
  }

  /* ---------------- render everything ---------------- */
  function render(options) {
    const opts = options || {};
    /* with reduced motion there is nothing to watch, so show the result at once */
    const playSequence = Boolean(opts.playSequence) && state.powered && !Motion.reduced();
    /* a new hydrogen series replays only the fan */
    const fanOnly = playSequence && Boolean(opts.fanOnly);

    clearPendingTimeouts();
    cancelDock();
    updatePickerHighlight();
    renderHeadline();
    syncSeriesUI();
    /* the apparatus is redrawn from scratch; after the first paint, fade from the old drawing to the new */
    const svg = document.getElementById('apparatus-svg');
    const apparatusOpts = { fanOnly, departing: opts.departing || null };
    if (svg.firstChild && !fanOnly) Motion.crossfade(svg, () => renderApparatus(playSequence, apparatusOpts));
    else renderApparatus(playSequence, apparatusOpts);
    updateSetupHint();

    if (!state.powered) {
      hideResult();
    } else if (playSequence) {
      hideResult();
      /* a plate that is already in the beam gets its lines to bloom before the card fills in */
      const bloomWait = viewerFits() ? bloomTotalMs(4) : 0;
      const delay = (fanOnly ? FAN_REPLAY_RESULT_DELAY_MS : SEQ_RESULT_DELAY_MS) + bloomWait;
      state.sequenceEndsAt = performance.now() + delay;
      trackTimeout(setTimeout(showResult, delay));
    } else {
      showResult();
    }
    updateTransitionEmpty();
  }

  function initPowerToggle() {
    const toggle = document.getElementById('power-toggle');
    const label = document.getElementById('power-label');
    toggle.checked = state.powered;
    updatePowerLabel(label);
    toggle.addEventListener('change', () => {
      const turningOn = toggle.checked && !state.powered;
      state.powered = toggle.checked;
      updatePowerLabel(label);
      render({ playSequence: turningOn });
    });
  }

  function updatePowerLabel(label) {
    label.textContent = state.powered ? 'Power on' : 'Power off';
  }

  function initModeToggle() {
    document.getElementById('mode-levels').addEventListener('click', () => setViewMode('levels'));
    document.getElementById('mode-atom').addEventListener('click', () => setViewMode('atom'));
  }

  let initialized = false;
  function init() {
    let resizeTimer = null;
    let lastResultW = 0;
    let lastNarrow = isNarrow();
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        /* the diagrams are drawn differently on a phone (cropped atom, magnifier below it): redraw when that changes */
        if (isNarrow() !== lastNarrow) {
          lastNarrow = isNarrow();
          if (state.selectedLine) playActiveViewAnimation();
        }
        const wrap = document.getElementById('result-wrap');
        if (!state.powered || !state.resultShown || !wrap || Math.abs(wrap.clientWidth - lastResultW) < 2) return;
        lastResultW = wrap.clientWidth;
        const hadFocus = document.activeElement && document.activeElement.classList.contains('wavelength-btn');
        renderResultScreen();
        if (hadFocus) { const a = document.querySelector('.wavelength-btn.active'); if (a) a.focus(); }
      }, 120);
    });
    if (initialized) return;
    initialized = true;
    initThemeToggle();
    buildSourcePicker();
    buildSeriesToggle();
    buildViewerTray();
    initPowerToggle();
    initEmToggle();
    initEmLoupe();
    initModeToggle();
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();