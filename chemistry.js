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

/* ---------- Bohr model: Balmer series detail for hydrogen ---------- */
/* Rydberg constant, m^-1 */
const RYDBERG_CONSTANT = 1.097373e7;

/* 1/lambda = R * (1/nf^2 - 1/ni^2); returns wavelength in nm */
function balmerWavelengthNm(nInitial, nFinal = 2) {
  const invLambda = RYDBERG_CONSTANT * (1 / (nFinal * nFinal) - 1 / (nInitial * nInitial));
  const lambdaMetres = 1 / invLambda;
  return lambdaMetres * 1e9;
}

/* Energy of the transition in eV: E = 1240 / lambda(nm), using hc = 1240 eV*nm */
function transitionEnergyEv(wavelengthNm) {
  return 1240 / wavelengthNm;
}

const BALMER_SERIES = [3, 4, 5, 6].map((nInitial) => {
  const wavelength = balmerWavelengthNm(nInitial);
  return {
    nInitial,
    nFinal: 2,
    wavelength,
    energyEv: transitionEnergyEv(wavelength),
  };
});

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

/* Principal energy levels for hydrogen (n=1..6), E_n = -13.6/n^2 eV.
 * Used to draw the Bohr energy-level diagram to scale (levels compress at high n,
 * matching the real convergence toward the ionization limit at E=0). */
const HYDROGEN_LEVELS = [1, 2, 3, 4, 5, 6].map((n) => ({
  n,
  energyEv: -13.6 / (n * n),
}));

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
  balmerWavelengthNm,
  transitionEnergyEv,
  BALMER_SERIES,
  HYDROGEN_LEVELS,
  bohrOrbitRadius,
  wavelengthToRGB,
  visiblePercent,
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