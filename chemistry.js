/* chemistry.js
 * Chemulator — Atomic Emission Spectra
 * All on-page wording, physics data, and pure calculation functions live here.
 * No DOM access in this file — app.js is the only place that touches the page.
 */

/* ---------- Visible-light window used for the spectrometer screen ---------- */
const VISIBLE_MIN_NM = 380;
const VISIBLE_MAX_NM = 700;

/* ---------- Discharge-tube gases ---------- */
/* "H" is the pedagogical focus of this tool; the rest are the "few other
 * examples of emission spectra" the brief asked for, so students can see
 * that every element has its own fingerprint of lines. */
const GAS_ELEMENTS = {
  H: {
    symbol: 'H',
    name: 'Hydrogen',
    tubeColor: '#ff2f9e',
    tubeGlow: '#ffb8e0',
    description:
      'The Balmer series — visible lines emitted as an excited electron falls from a higher shell down to the n = 2 shell.',
    lines: [
      { wavelength: 656.3, label: 'H\u03B1', transition: '3 \u2192 2' },
      { wavelength: 486.1, label: 'H\u03B2', transition: '4 \u2192 2' },
      { wavelength: 434.0, label: 'H\u03B3', transition: '5 \u2192 2' },
      { wavelength: 410.2, label: 'H\u03B4', transition: '6 \u2192 2' },
    ],
  },
  He: {
    symbol: 'He',
    name: 'Helium',
    tubeColor: '#ff9142',
    tubeGlow: '#ffd9a8',
    description:
      'A strong yellow line at 587.6 nm together with red, green, and blue-violet lines gives helium its warm gold-white glow.',
    lines: [
      { wavelength: 667.8, label: 'red' },
      { wavelength: 587.6, label: 'yellow (D3)' },
      { wavelength: 501.6, label: 'green' },
      { wavelength: 447.1, label: 'blue-violet' },
    ],
  },
  Ne: {
    symbol: 'Ne',
    name: 'Neon',
    tubeColor: '#ff3d16',
    tubeGlow: '#ffb192',
    description:
      'Dense clusters of lines across the orange-red band give neon its familiar sign-tube glow.',
    lines: [
      { wavelength: 703.2, label: 'deep red' },
      { wavelength: 640.2, label: 'orange-red' },
      { wavelength: 621.7, label: 'orange' },
      { wavelength: 585.2, label: 'yellow-orange' },
    ],
  },
  Ar: {
    symbol: 'Ar',
    name: 'Argon',
    tubeColor: '#7b3ce0',
    tubeGlow: '#d9c4ff',
    description:
      'Blue-violet lines dominate the argon spectrum, with a weaker red line completing the mix.',
    lines: [
      { wavelength: 696.5, label: 'red' },
      { wavelength: 460.9, label: 'blue' },
      { wavelength: 427.2, label: 'violet' },
      { wavelength: 419.8, label: 'violet' },
    ],
  },
  Kr: {
    symbol: 'Kr',
    name: 'Krypton',
    tubeColor: '#6fc7e6',
    tubeGlow: '#d4f0fa',
    description:
      'Lines spread across blue, green, and yellow blend into a pale, near-white discharge.',
    lines: [
      { wavelength: 587.1, label: 'yellow' },
      { wavelength: 557.0, label: 'green' },
      { wavelength: 461.9, label: 'blue' },
      { wavelength: 435.5, label: 'blue-violet' },
    ],
  },
  Xe: {
    symbol: 'Xe',
    name: 'Xenon',
    tubeColor: '#6f8fef',
    tubeGlow: '#d0dcff',
    description:
      'Blue-green transitions dominate, giving xenon its intense blue-white discharge.',
    lines: [
      { wavelength: 541.9, label: 'green' },
      { wavelength: 484.3, label: 'blue' },
      { wavelength: 462.4, label: 'blue' },
      { wavelength: 420.0, label: 'violet' },
    ],
  },
};

const GAS_ORDER = ['H', 'He', 'Ne', 'Ar', 'Kr', 'Xe'];

/* ---------- White light source ---------- */
const WHITE_LIGHT = {
  symbol: 'W',
  name: 'White light',
  description:
    'A hot filament (or the Sun) emits every visible wavelength at once. The spectrometer spreads it into a continuous rainbow with no gaps.',
};

/* ---------- Bohr model: the five hydrogen series ---------- */
/* Rydberg constant, m^-1 */
const RYDBERG_CONSTANT = 1.097373e7;

/* 1/lambda = R * (1/nf^2 - 1/ni^2); returns the (vacuum) wavelength in nm */
function transitionWavelengthNm(nInitial, nFinal) {
  const invLambda = RYDBERG_CONSTANT * (1 / (nFinal * nFinal) - 1 / (nInitial * nInitial));
  const lambdaMetres = 1 / invLambda;
  return lambdaMetres * 1e9;
}

/* the original, Balmer-flavoured name: n_final still defaults to 2 */
function balmerWavelengthNm(nInitial, nFinal = 2) {
  return transitionWavelengthNm(nInitial, nFinal);
}

/* Energy of the transition in eV: E = 1240 / lambda(nm), using hc = 1240 eV*nm */
function transitionEnergyEv(wavelengthNm) {
  return 1240 / wavelengthNm;
}

/* Bohr level energy, E_n = -13.6 / n^2 eV */
const LEVEL_ENERGY_SCALE_EV = 13.6;
function levelEnergyEv(n) {
  return -LEVEL_ENERGY_SCALE_EV / (n * n);
}

/* Which part of the spectrum a wavelength falls in, for the eye: 'uv' | 'visible' | 'ir' */
function lightBand(wavelengthNm) {
  if (wavelengthNm < VISIBLE_MIN_NM) return 'uv';
  if (wavelengthNm > VISIBLE_MAX_NM) return 'ir';
  return 'visible';
}

/* Lyman, Balmer, Paschen, Brackett, Pfund: four lines each (n_i = n_f + 1 ... n_f + 4),
 * plus the series limit (n_i -> infinity), where the lines crowd together. */
const SERIES_DEFS = [
  { id: 'lyman', name: 'Lyman', nFinal: 1, band: 'uv', bandLabel: 'UV', prefix: 'Ly' },
  { id: 'balmer', name: 'Balmer', nFinal: 2, band: 'visible', bandLabel: 'Visible', prefix: 'H' },
  { id: 'paschen', name: 'Paschen', nFinal: 3, band: 'ir', bandLabel: 'IR', prefix: 'P' },
  { id: 'brackett', name: 'Brackett', nFinal: 4, band: 'ir', bandLabel: 'IR', prefix: 'Br' },
  { id: 'pfund', name: 'Pfund', nFinal: 5, band: 'ir', bandLabel: 'IR', prefix: 'Pf' },
];
const GREEK_LETTERS = ['\u03B1', '\u03B2', '\u03B3', '\u03B4'];
const BAND_WORDS = { uv: 'ultraviolet', visible: 'visible', ir: 'infrared' };

const HYDROGEN_SERIES = SERIES_DEFS.map((def) => {
  const lines = [0, 1, 2, 3].map((i) => {
    const nInitial = def.nFinal + 1 + i;
    const wavelength = transitionWavelengthNm(nInitial, def.nFinal);
    return {
      seriesId: def.id,
      nInitial,
      nFinal: def.nFinal,
      wavelength,
      /* the photon carries exactly the gap between the two levels (Lyman alpha = 10.20 eV;
       * hc/lambda with hc = 1240 would print 10.21), so the panel agrees with the level diagram */
      energyEv: levelEnergyEv(nInitial) - levelEnergyEv(def.nFinal),
      label: def.prefix + GREEK_LETTERS[i],
    };
  });
  return {
    id: def.id,
    name: def.name,
    nFinal: def.nFinal,
    band: def.band,
    bandLabel: def.bandLabel,
    limitNm: transitionWavelengthNm(Infinity, def.nFinal),
    lines,
    description:
      def.id === 'balmer'
        ? GAS_ELEMENTS.H.description
        : `${def.name} series: ${BAND_WORDS[def.band]} lines, electron falls to n = ${def.nFinal}.`,
  };
});

/* Balmer chips, rays and the strip keep the observed (air) wavelengths this page has always
 * shown (656.3 nm ...); `wavelength` stays the Rydberg value the energies are computed from. */
HYDROGEN_SERIES.find((s) => s.id === 'balmer').lines.forEach((line, i) => {
  line.observedNm = GAS_ELEMENTS.H.lines[i].wavelength;
});

/* kept for compatibility: the original Balmer-only list, now the same line objects */
const BALMER_SERIES = HYDROGEN_SERIES.find((s) => s.id === 'balmer').lines;

/* ---------- Seeing the invisible: a UV screen and an IR viewer ---------- */
/* One FALSE colour per device: a fluorescent screen glows the same green and an IR viewer the
 * same amber whatever the wavelength, so the glow says WHERE a line falls, never what colour it is.
 * Both are chosen apart from the visible rainbow lines, the pink tube and each other. */
const VIEWERS = {
  uv: { id: 'uv', name: 'UV screen', handles: 'uv', glow: '#8dff4f', tag: 'UV' },
  ir: { id: 'ir', name: 'IR viewer', handles: 'ir', glow: '#ffb21f', tag: 'IR' },
};
const VIEWER_ORDER = ['uv', 'ir'];

/* How a line of this wavelength shows up, given the viewer in the beam (or null):
 *   the eye sees 380-700 nm as its own colour; a matching viewer shows the line in its glow
 *   colour; anything else stays dark. */
function appearance(wavelengthNm, viewerId) {
  const band = lightBand(wavelengthNm);
  if (band === 'visible') {
    return { visible: true, via: 'eye', color: wavelengthToRGB(wavelengthNm) };
  }
  const viewer = viewerId ? VIEWERS[viewerId] : null;
  if (viewer && viewer.handles === band) {
    return { visible: true, via: 'viewer', color: viewer.glow };
  }
  return { visible: false, via: null, color: null };
}

/* true when this viewer can make that series' lines visible */
function viewerHandlesSeries(viewerId, series) {
  const viewer = viewerId ? VIEWERS[viewerId] : null;
  return Boolean(viewer && series && viewer.handles === series.band);
}

/* the viewer a series needs, or null when the eye is enough */
function viewerForSeries(series) {
  return series && VIEWERS[series.band] ? VIEWERS[series.band] : null;
}

/* ---------- Wavelength (nm, visible range) -> approximate sRGB colour ---------- */
/* Standard piecewise approximation used across optics teaching tools. */
function wavelengthToRGB(wavelengthNm) {
  let r = 0;
  let g = 0;
  let b = 0;

  if (wavelengthNm >= 380 && wavelengthNm < 440) {
    r = -(wavelengthNm - 440) / (440 - 380);
    g = 0;
    b = 1;
  } else if (wavelengthNm >= 440 && wavelengthNm < 490) {
    r = 0;
    g = (wavelengthNm - 440) / (490 - 440);
    b = 1;
  } else if (wavelengthNm >= 490 && wavelengthNm < 510) {
    r = 0;
    g = 1;
    b = -(wavelengthNm - 510) / (510 - 490);
  } else if (wavelengthNm >= 510 && wavelengthNm < 580) {
    r = (wavelengthNm - 510) / (580 - 510);
    g = 1;
    b = 0;
  } else if (wavelengthNm >= 580 && wavelengthNm < 645) {
    r = 1;
    g = -(wavelengthNm - 645) / (645 - 580);
    b = 0;
  } else if (wavelengthNm >= 645 && wavelengthNm <= 780) {
    r = 1;
    g = 0;
    b = 0;
  }

  let factor = 1;
  if (wavelengthNm >= 380 && wavelengthNm < 420) {
    factor = 0.3 + (0.7 * (wavelengthNm - 380)) / (420 - 380);
  } else if (wavelengthNm >= 700 && wavelengthNm <= 780) {
    factor = 0.3 + (0.7 * (780 - wavelengthNm)) / (780 - 700);
  }

  const gamma = 0.8;
  const adjust = (c) => (c <= 0 ? 0 : Math.round(255 * Math.pow(c * factor, gamma)));
  return `rgb(${adjust(r)},${adjust(g)},${adjust(b)})`;
}

/* Percent position of a visible wavelength along the 380-700 nm screen/scale */
function visiblePercent(wavelengthNm) {
  const pct = ((wavelengthNm - VISIBLE_MIN_NM) / (VISIBLE_MAX_NM - VISIBLE_MIN_NM)) * 100;
  return Math.min(100, Math.max(0, pct));
}

/* ---------- A wavelength axis for each hydrogen series ---------- */
/* Linear in wavelength. Balmer keeps the page's original 380-700 nm screen. Every other series
 * runs from just below its limit to just above its longest line, so the four lines and the
 * limit where they crowd together share one strip. */

/* the biggest 1 / 2 / 5 x 10^k step that still leaves at least four intervals */
function niceTickStep(range, minIntervals = 4) {
  const target = range / minIntervals;
  const pow = Math.pow(10, Math.floor(Math.log10(target)));
  const m = target / pow;
  return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * pow;
}

function seriesAxis(series) {
  let minNm;
  let maxNm;
  if (series.band === 'visible') {
    minNm = VISIBLE_MIN_NM;
    maxNm = VISIBLE_MAX_NM;
  } else {
    const nms = series.lines.map((ln) => ln.wavelength);
    const lo = Math.min.apply(null, nms.concat(series.limitNm));
    const hi = Math.max.apply(null, nms);
    const pad = 0.03 * (hi - lo);
    minNm = lo - pad;
    maxNm = hi + pad;
  }
  const step = niceTickStep(maxNm - minNm);
  const ticks = [];
  for (let v = Math.ceil(minNm / step) * step; v <= maxNm + 1e-9; v += step) {
    ticks.push(Math.round(v * 1e6) / 1e6);
  }
  const limitPct = ((series.limitNm - minNm) / (maxNm - minNm)) * 100;
  return {
    minNm,
    maxNm,
    ticks,
    limitNm: series.limitNm,
    /* null when the limit lies off this axis (Balmer's sits in the UV, left of the screen) */
    limitPercent: limitPct >= 0 && limitPct <= 100 ? limitPct : null,
  };
}

/* Percent position of a wavelength along a series' axis (0 = short end), clamped to 0-100 */
function axisPercent(series, wavelengthNm) {
  const axis = seriesAxis(series);
  const pct = ((wavelengthNm - axis.minNm) / (axis.maxNm - axis.minNm)) * 100;
  return Math.min(100, Math.max(0, pct));
}

/* ---------- Full electromagnetic spectrum, for the comparison bar ---------- */
/* Wavelength band edges in metres, radio (long) -> gamma (short). Log-scale axis. */
const EM_SPECTRUM_BANDS = [
  { name: 'Radio', minM: 1e5, maxM: 1e-1, color: '#8a6a3a' },
  { name: 'Microwave', minM: 1e-1, maxM: 1e-3, color: '#b23b56' },
  { name: 'Infrared', minM: 1e-3, maxM: 7e-7, color: '#d99a2b' },
  { name: 'Visible', minM: 7e-7, maxM: 4e-7, color: null }, // rendered as a rainbow gradient
  { name: 'Ultraviolet', minM: 4e-7, maxM: 1e-8, color: '#5e44a0' },
  { name: 'X-ray', minM: 1e-8, maxM: 1e-11, color: '#2f7fd1' },
  { name: 'Gamma ray', minM: 1e-11, maxM: 1e-13, color: '#0a8f73' },
];

const EM_AXIS_MAX_M = 1e5; // longest wavelength shown (radio)
const EM_AXIS_MIN_M = 1e-13; // shortest wavelength shown (gamma)

/* Log-scale percent position (0 = long-wavelength/radio end, 100 = short/gamma end) */
function emSpectrumPercent(wavelengthM) {
  const logMax = Math.log10(EM_AXIS_MAX_M);
  const logMin = Math.log10(EM_AXIS_MIN_M);
  const logW = Math.log10(wavelengthM);
  const pct = ((logMax - logW) / (logMax - logMin)) * 100;
  return Math.min(100, Math.max(0, pct));
}

/* Convert a visible-light wavelength given in nm to the EM-spectrum percent position */
function emSpectrumPercentFromNm(wavelengthNm) {
  return emSpectrumPercent(wavelengthNm * 1e-9);
}

/* Principal energy levels for hydrogen (n=1..9, the highest level any of the five series
 * starts from), E_n = -13.6/n^2 eV. The levels compress at high n, matching the real
 * convergence toward the ionization limit (n = infinity) at E = 0. */
const HYDROGEN_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({
  n,
  energyEv: levelEnergyEv(n),
}));
const HYDROGEN_LIMIT_EV = 0;

/* Bohr orbit radius, r_n proportional to n^2, scaled so n=nMax lands on rMax.
 * Matches the "correct relative spacing" convention used by the NAAP
 * hydrogen-atom simulator's Bohr-model panel. */
function bohrOrbitRadius(n, rMax, nMax) {
  return rMax * ((n * n) / (nMax * nMax));
}

const ChemulatorChemistry = {
  VISIBLE_MIN_NM,
  VISIBLE_MAX_NM,
  GAS_ELEMENTS,
  GAS_ORDER,
  WHITE_LIGHT,
  RYDBERG_CONSTANT,
  transitionWavelengthNm,
  balmerWavelengthNm,
  transitionEnergyEv,
  levelEnergyEv,
  lightBand,
  HYDROGEN_SERIES,
  BALMER_SERIES,
  VIEWERS,
  VIEWER_ORDER,
  appearance,
  viewerHandlesSeries,
  viewerForSeries,
  HYDROGEN_LEVELS,
  HYDROGEN_LIMIT_EV,
  bohrOrbitRadius,
  wavelengthToRGB,
  visiblePercent,
  niceTickStep,
  seriesAxis,
  axisPercent,
  EM_SPECTRUM_BANDS,
  EM_AXIS_MAX_M,
  EM_AXIS_MIN_M,
  emSpectrumPercent,
  emSpectrumPercentFromNm,
};

if (typeof module !== 'undefined' && module.exports) {
  /* Node / test environment */
  module.exports = ChemulatorChemistry;
}
if (typeof window !== 'undefined') {
  /* Browser environment: app.js reads from window.Chemulator */
  window.Chemulator = ChemulatorChemistry;
}