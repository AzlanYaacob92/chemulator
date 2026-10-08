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
    selectedLine: null, // Balmer line object while the transition panel is open
    viewMode: 'levels', // 'levels' | 'atom'
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
    btn.textContent = currentIsDark() ? '\u2600\uFE0F' : '\uD83C\uDF19';
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

  function currentLinesWithColor() {
    if (isWhite()) return [];
    return Chemulator.GAS_ELEMENTS[state.source].lines.map((ln) => ({
      ...ln,
      color: Chemulator.wavelengthToRGB(ln.wavelength),
      pct: Chemulator.visiblePercent(ln.wavelength),
    }));
  }

  /* ---------------- apparatus diagram (setup view) ---------------- */
  function renderApparatus(playSequence) {
    const svg = document.getElementById('apparatus-svg');
    clearChildren(svg);

    const animate = Boolean(playSequence) && state.powered;
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
      opacity: animate ? 0 : bloomTarget,
      filter: `url(#blurWide-${uid})`,
    });
    svg.appendChild(bloom);
    if (animate) animateOpacityIn(bloom, bloomTarget, 0, SEQ_GLOW_MS);

    if (isWhite()) {
      const bulbGlowTarget = state.powered ? 0.95 : 0.15;
      const bulbGlow = svgEl('circle', {
        cx: sourceCX,
        cy: sourceCY,
        r: 46,
        style: 'fill:' + core,
        opacity: animate ? 0 : bulbGlowTarget,
        filter: `url(#blurSoft-${uid})`,
      });
      svg.appendChild(bulbGlow);
      if (animate) animateOpacityIn(bulbGlow, bulbGlowTarget, 0, SEQ_GLOW_MS);

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
        opacity: animate ? 0 : glowOpacity,
        filter: `url(#blurSoft-${uid})`,
      });
      g.appendChild(tubeFill);
      if (animate) animateOpacityIn(tubeFill, glowOpacity, 0, SEQ_GLOW_MS);
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
      if (animate) animateDrawIn(ray, SEQ_RAYS_START, SEQ_RAYS_MS);
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
    if (animate) animateDrawIn(convergedBeam, SEQ_BEAM_START, SEQ_BEAM_MS);

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
        if (animate) animateDrawIn(ray, SEQ_FAN_START, SEQ_FAN_MS);
      }
    } else {
      lines.forEach((ln) => {
        const targetY = fanTopY + ((fanBottomY - fanTopY) * ln.pct) / 100;
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
        if (animate) animateDrawIn(ray, SEQ_FAN_START, SEQ_FAN_MS);
      });
    }

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
        opacity: 0.9,
        rx: 3,
      })
    );

    if (!state.powered) {
      const offLabel = svgEl('text', {
        x: W / 2,
        y: H - 14,
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
  function renderResultScreen() {
    const svg = document.getElementById('result-svg');
    clearChildren(svg);

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
    const H2 = lineTop + LINE_H + 8;
    svg.setAttribute('viewBox', `0 0 ${W} ${H2}`);
    svg.firstChild.setAttribute('height', H2);

    /* leaders + glows first so labels paint on top */
    lines.forEach((item) => {
      const x = item.x;
      const ln = item.ln;
      svg.appendChild(
        svgEl('rect', { x: x - 14, y: lineTop - 4, width: 28, height: LINE_H + 8, fill: ln.color, opacity: 0.3, filter: 'url(#resultBlur)' })
      );
      svg.appendChild(svgEl('rect', { x: x - 3, y: lineTop, width: 6, height: LINE_H, rx: 3, fill: ln.color }));
      if (item.row > 0) {
        const yLabelBottom = LABEL_TOP + item.row * (LABEL_H + ROW_GAP) + LABEL_H;
        svg.appendChild(
          svgEl('line', { x1: x, x2: x, y1: yLabelBottom, y2: lineTop, stroke: ln.color, 'stroke-width': 1.5, opacity: 0.75, class: 'label-leader' })
        );
      }
    });
    lines.forEach((item) => {
      const ln = item.ln;
      const fo = svgEl('foreignObject', { x: item.left, y: LABEL_TOP + item.row * (LABEL_H + ROW_GAP), width: LABEL_W, height: LABEL_H });
      const btn = document.createElement('button');
      btn.type = 'button';
      const interactive = isHydrogen();
      btn.className = 'wavelength-btn' + (interactive ? '' : ' wavelength-btn--static');
      if (interactive && state.selectedLine && Math.abs(state.selectedLine.wavelength - ln.wavelength) < 0.5) btn.classList.add('active');
      btn.textContent = ln.wavelength.toFixed(1) + ' nm';
      if (interactive) {
        const balmerLine = Chemulator.BALMER_SERIES.find((t) => Math.abs(t.wavelength - ln.wavelength) < 0.5);
        if (balmerLine) {
          btn.addEventListener('click', () => selectSpectralLine(balmerLine, btn));
        }
      } else {
        btn.tabIndex = -1;
      }
      fo.appendChild(btn);
      svg.appendChild(fo);
    });
  }

  /* ---------------- transition panel: open/close, mode toggle ---------------- */
  function selectSpectralLine(balmerLine, buttonEl) {
    document.querySelectorAll('.wavelength-btn.active').forEach((el) => el.classList.remove('active'));
    buttonEl.classList.add('active');

    const panel = document.getElementById('transition-panel');
    const firstOpen = panel.hidden;

    state.selectedLine = balmerLine;
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

  /* Empty-state of the Transition diagram card (hydrogen only). */
  function updateTransitionEmpty() {
    const empty = document.getElementById('transition-empty');
    if (!empty) return;
    /* stays out of the way until a closing panel has finished fading */
    const panel = document.getElementById('transition-panel');
    empty.hidden = Boolean(state.selectedLine) || Boolean(panel && !panel.hidden);
    empty.textContent = isHydrogen()
      ? 'Select a spectral line to see the electron transition.'
      : 'Transition diagrams are available for hydrogen only. Choose hydrogen as the light source to explore the electron transitions behind its lines.';
  }

  function updateTransitionPanelText() {
    const t = state.selectedLine;
    if (!t) return;
    const title = document.getElementById('transition-panel-title');
    title.textContent = `n = ${t.nInitial} \u2192 n = 2 \u00B7 ${t.wavelength.toFixed(1)} nm \u00B7 ${t.energyEv.toFixed(2)} eV`;

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

  /* Levels bunch up near the ionisation limit, so a true-to-scale axis would
   * stack n = 4, 5, 6 on top of each other. Order is kept, spacing is eased. */
  const LEVEL_POS = { 1: 0, 2: 0.4, 3: 0.58, 4: 0.72, 5: 0.86, 6: 1 };

  function energyLevelY(energyEv) {
    const lvl = Chemulator.HYDROGEN_LEVELS.find((l) => Math.abs(l.energyEv - energyEv) < 1e-9);
    const t = lvl ? LEVEL_POS[lvl.n] : 0;
    return ENERGY_CHART.bottom - t * (ENERGY_CHART.bottom - ENERGY_CHART.top);
  }

  function renderEnergyDiagram() {
    const svg = document.getElementById('energy-svg');
    clearChildren(svg);
    if (!isHydrogen()) return;

    const note = svgEl('text', {
      x: (ENERGY_CHART.x0 + ENERGY_CHART.x1) / 2,
      y: ENERGY_CHART.top - 18,
      'text-anchor': 'middle',
      'font-size': 13,
      'letter-spacing': '0.05em',
      class: 'svg-note',
    });
    note.textContent = 'ALL BALMER TRANSITIONS LAND ON n = 2 · SPACING NOT TO SCALE';
    svg.appendChild(note);

    Chemulator.HYDROGEN_LEVELS.forEach((lvl) => {
      const y = energyLevelY(lvl.energyEv);
      const isLanding = lvl.n === 2;
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
  }

  function buildSquigglyPath(x0, y0, color, length) {
    const cycles = 4;
    const amplitude = 7;
    const steps = 32;
    const len = length || 140;
    const points = [];
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const x = x0 + t * len;
      const y = y0 + Math.sin(t * cycles * Math.PI * 2) * amplitude;
      points.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    return svgEl('path', {
      d: points.join(' '),
      fill: 'none',
      style: 'stroke:' + color,
      'stroke-width': 2.5,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      class: 'photon-squiggle',
    });
  }

  function clearActiveTransitionVisuals() {
    transitionToken += 1;
    activeTransitionTimeouts.forEach((id) => clearTimeout(id));
    activeTransitionTimeouts = [];
    document.querySelectorAll('.js-electron, .photon-squiggle').forEach((el) => el.remove());
  }

  function playLevelTransition(balmerLine) {
    const svg = document.getElementById('energy-svg');
    if (!svg || !isHydrogen()) return;

    clearActiveTransitionVisuals();
    const token = transitionToken;

    const color = Chemulator.wavelengthToRGB(balmerLine.wavelength);
    const initialLevel = Chemulator.HYDROGEN_LEVELS.find((l) => l.n === balmerLine.nInitial);
    const finalLevel = Chemulator.HYDROGEN_LEVELS.find((l) => l.n === balmerLine.nFinal);
    const x = (ENERGY_CHART.x0 + ENERGY_CHART.x1) / 2 + 40;
    const yInitial = energyLevelY(initialLevel.energyEv);
    const yFinal = energyLevelY(finalLevel.energyEv);

    const electron = svgEl('circle', {
      cx: x,
      cy: yInitial,
      r: 7,
      style: 'fill:var(--electron);stroke:' + color,
      'stroke-width': 2.5,
      class: 'js-electron electron-vibrate',
    });
    svg.appendChild(electron);

    const t1 = setTimeout(() => {
      if (token !== transitionToken) return;
      electron.classList.remove('electron-vibrate');

      const photon = buildSquigglyPath(x + 16, (yInitial + yFinal) / 2, color);
      svg.appendChild(photon);
      animateDrawIn(photon, 0, ANIM_ELECTRON_FALL_MS);

      electron.style.cy = yInitial + 'px';
      Motion.to(electron, { cy: yFinal + 'px' }, { duration: ANIM_ELECTRON_FALL_MS });
    }, ANIM_VIBRATE_MS);
    activeTransitionTimeouts.push(t1);
  }

  /* ---------------- view B: atomic (Bohr orbit) view ----------------
   * Modelled on the NAAP hydrogen-atom simulator: proton at the centre and the
   * first six orbits with correct relative spacing (r proportional to n^2). */
  const ATOM_VIEW = { cx: 320, cy: 192, rMax: 140, nMax: 6 };

  function atomOrbitRadius(n) {
    return Chemulator.bohrOrbitRadius(n, ATOM_VIEW.rMax, ATOM_VIEW.nMax);
  }

  function renderAtomDiagram() {
    const svg = document.getElementById('atom-svg');
    clearChildren(svg);
    /* phones: crop the empty side margins so the atom fills the narrow card */
    const narrow = window.matchMedia && window.matchMedia('(max-width: 600px)').matches;
    svg.setAttribute('viewBox', narrow ? '150 0 340 340' : '0 0 640 340');
    if (!isHydrogen()) return;

    const note = svgEl('text', {
      x: ATOM_VIEW.cx,
      y: 20,
      'text-anchor': 'middle',
      'font-size': 13,
      'letter-spacing': '0.05em',
      class: 'svg-note',
    });
    note.textContent = 'BOHR MODEL \u00B7 ORBIT RADII TO SCALE (r \u221D n\u00B2)';
    svg.appendChild(note);

    for (let n = 1; n <= ATOM_VIEW.nMax; n += 1) {
      const r = atomOrbitRadius(n);
      svg.appendChild(
        svgEl('circle', {
          cx: ATOM_VIEW.cx,
          cy: ATOM_VIEW.cy,
          r,
          'stroke-width': n === 2 ? 2.5 : 1.2,
          class: n === 2 ? 'atom-orbit atom-orbit--landing' : 'atom-orbit',
        })
      );
      if (n >= 2) {
        const lbl = svgEl('text', {
          x: ATOM_VIEW.cx,
          y: ATOM_VIEW.cy - r - 4,
          'text-anchor': 'middle',
          style: 'paint-order:stroke;stroke:var(--card);stroke-width:4px;stroke-linejoin:round',
          'font-size': 14,
          'font-family': 'var(--font-mono, monospace)',
          class: 'svg-ev',
        });
        lbl.textContent = 'n=' + n;
        svg.appendChild(lbl);
      }
    }

    /* proton */
    svg.appendChild(svgEl('circle', { cx: ATOM_VIEW.cx, cy: ATOM_VIEW.cy, r: 7, style: 'fill:var(--proton)' }));
    const plus = svgEl('text', {
      x: ATOM_VIEW.cx,
      y: ATOM_VIEW.cy + 4.5,
      'text-anchor': 'middle',
      'font-size': 13,
      style: 'fill:var(--proton-ink)',
      'font-weight': '600',
    });
    plus.textContent = '+';
    svg.appendChild(plus);
  }

  function playAtomTransition(balmerLine) {
    const svg = document.getElementById('atom-svg');
    if (!svg || !isHydrogen()) return;

    clearActiveTransitionVisuals();
    const token = transitionToken;

    const color = Chemulator.wavelengthToRGB(balmerLine.wavelength);
    /* electron sits on the upper-right diagonal of its orbit */
    const angle = -Math.PI / 4;
    const rInitial = atomOrbitRadius(balmerLine.nInitial);
    const rFinal = atomOrbitRadius(balmerLine.nFinal);
    const xInitial = ATOM_VIEW.cx + rInitial * Math.cos(angle);
    const yInitial = ATOM_VIEW.cy + rInitial * Math.sin(angle);
    const xFinal = ATOM_VIEW.cx + rFinal * Math.cos(angle);
    const yFinal = ATOM_VIEW.cy + rFinal * Math.sin(angle);

    const electron = svgEl('circle', {
      cx: xInitial,
      cy: yInitial,
      r: 6,
      style: 'fill:var(--electron);stroke:' + color,
      'stroke-width': 2.5,
      class: 'js-electron electron-vibrate',
    });
    svg.appendChild(electron);

    const t1 = setTimeout(() => {
      if (token !== transitionToken) return;
      electron.classList.remove('electron-vibrate');

      /* photon squiggle exits outward, away from the nucleus, from the jump midpoint */
      const midX = (xInitial + xFinal) / 2;
      const midY = (yInitial + yFinal) / 2;
      const photon = buildSquigglyPath(midX + 14, midY - 10, color, 150);
      svg.appendChild(photon);
      animateDrawIn(photon, 0, ANIM_ELECTRON_FALL_MS);

      electron.style.cx = xInitial + 'px';
      electron.style.cy = yInitial + 'px';
      Motion.to(electron, { cx: xFinal + 'px', cy: yFinal + 'px' }, { duration: ANIM_ELECTRON_FALL_MS });
    }, ANIM_VIBRATE_MS);
    activeTransitionTimeouts.push(t1);
  }

  /* ---------------- EM spectrum comparison bar (toggleable) ---------------- */
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
    clearChildren(strip);

    if (state.powered && !isWhite()) {
      stripLabel.textContent = `${currentSourceData().name}\u2019s line spectrum, on the same axis`;
      currentLinesWithColor().forEach((ln) => {
        const pct = Chemulator.emSpectrumPercentFromNm(ln.wavelength);
        const mark = document.createElement('div');
        mark.className = 'em-marker';
        mark.style.left = pct + '%';
        mark.style.background = ln.color;
        mark.style.boxShadow = `0 0 6px ${ln.color}`;
        mark.title = `${ln.wavelength.toFixed(1)} nm`;
        strip.appendChild(mark);
      });
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
    document.getElementById('source-description').textContent = data.description;
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
    renderResultScreen();
    document.getElementById('result-svg').classList.add('visible');
    document.getElementById('stage-note').textContent = isHydrogen()
      ? 'Each line is one exact colour. Click a wavelength to see the electron transition responsible for that line.'
      : isWhite()
        ? 'Every visible wavelength arrived, so the rainbow is continuous with no gaps.'
        : 'Each line is one exact colour — a fingerprint unique to this element.';
    if (state.emVisible) renderEmSpectrum();
  }

  /* ---------------- render everything ---------------- */
  function render(options) {
    const opts = options || {};
    /* with reduced motion there is nothing to watch, so show the result at once */
    const playSequence = Boolean(opts.playSequence) && state.powered && !Motion.reduced();

    clearPendingTimeouts();
    updatePickerHighlight();
    renderHeadline();
    /* the apparatus is redrawn from scratch; after the first paint, fade from the old drawing to the new */
    const svg = document.getElementById('apparatus-svg');
    if (svg.firstChild) Motion.crossfade(svg, () => renderApparatus(playSequence));
    else renderApparatus(playSequence);
    updateSetupHint();

    if (!state.powered) {
      hideResult();
    } else if (playSequence) {
      hideResult();
      trackTimeout(setTimeout(showResult, SEQ_RESULT_DELAY_MS));
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
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
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
    initPowerToggle();
    initEmToggle();
    initModeToggle();
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();