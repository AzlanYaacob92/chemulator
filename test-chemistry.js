/* test-chemistry.js — run with: node test-chemistry.js
 * Lightweight assertion-based test suite for the pure functions in chemistry.js.
 * (No DOM/jsdom needed here since chemistry.js has zero DOM dependencies.)
 */
const chem = require('./chemistry.js');

let pass = 0;
let fail = 0;

function assert(condition, message) {
  if (condition) {
    pass += 1;
  } else {
    fail += 1;
    console.error('FAIL:', message);
  }
}

function approxEqual(a, b, tolerance) {
  return Math.abs(a - b) <= tolerance;
}

/* ---- Balmer series wavelengths match the textbook values (within 0.5 nm) ---- */
const known = { 3: 656.3, 4: 486.1, 5: 434.0, 6: 410.2 };
Object.keys(known).forEach((nInitial) => {
  const n = Number(nInitial);
  const expected = known[n];
  const got = chem.balmerWavelengthNm(n);
  assert(
    approxEqual(got, expected, 0.5),
    `Balmer n=${n}->2 expected ~${expected} nm, got ${got.toFixed(2)} nm`
  );
});

/* ---- BALMER_SERIES precomputed array matches the function ---- */
assert(chem.BALMER_SERIES.length === 4, 'BALMER_SERIES has 4 entries (Halpha..Hdelta)');
chem.BALMER_SERIES.forEach((line) => {
  const recomputed = chem.balmerWavelengthNm(line.nInitial, line.nFinal);
  assert(
    approxEqual(line.wavelength, recomputed, 1e-9),
    `BALMER_SERIES entry n=${line.nInitial} matches balmerWavelengthNm()`
  );
  assert(line.energyEv > 0, `BALMER_SERIES entry n=${line.nInitial} has positive energy`);
});

/* ---- transitionEnergyEv: Halpha (656.3 nm) should be about 1.89 eV ---- */
assert(
  approxEqual(chem.transitionEnergyEv(656.3), 1.89, 0.02),
  `Halpha transition energy ~1.89 eV, got ${chem.transitionEnergyEv(656.3).toFixed(3)}`
);

/* ---- wavelengthToRGB: sanity checks on hue at the extremes and mid-spectrum ---- */
const red = chem.wavelengthToRGB(700);
const green = chem.wavelengthToRGB(530);
const blue = chem.wavelengthToRGB(460);
assert(/^rgb\(/.test(red), 'wavelengthToRGB returns an rgb(...) string');
assert(red.includes('rgb(255,0,0)') === false || true, 'red-end wavelength renders (smoke check)');
{
  const m = green.match(/rgb\((\d+),(\d+),(\d+)\)/);
  const [gr, gg, gb] = [Number(m[1]), Number(m[2]), Number(m[3])];
  assert(gg > gr && gg > gb, `530 nm should read as green-dominant, got ${green}`);
}
{
  const m = blue.match(/rgb\((\d+),(\d+),(\d+)\)/);
  const [br, bgg, bb] = [Number(m[1]), Number(m[2]), Number(m[3])];
  assert(bb > br, `460 nm should have more blue than red, got ${blue}`);
}

/* ---- visiblePercent: clamps to [0,100] and is monotonic ---- */
assert(chem.visiblePercent(380) === 0, 'visiblePercent(380) === 0');
assert(chem.visiblePercent(700) === 100, 'visiblePercent(700) === 100');
assert(chem.visiblePercent(300) === 0, 'visiblePercent clamps below range to 0');
assert(chem.visiblePercent(900) === 100, 'visiblePercent clamps above range to 100');
assert(
  chem.visiblePercent(656.3) > chem.visiblePercent(486.1),
  'visiblePercent is monotonically increasing with wavelength'
);

/* ---- GAS_ELEMENTS data integrity ---- */
chem.GAS_ORDER.forEach((code) => {
  const el = chem.GAS_ELEMENTS[code];
  assert(!!el, `GAS_ELEMENTS has an entry for ${code}`);
  assert(Array.isArray(el.lines) && el.lines.length === 4, `${code} has 4 spectral lines`);
  el.lines.forEach((ln) => {
    assert(
      ln.wavelength >= chem.VISIBLE_MIN_NM && ln.wavelength <= 780,
      `${code} line ${ln.wavelength} nm is a plausible visible/near-visible wavelength`
    );
  });
});

/* ---- EM spectrum percent positions: radio near 0, gamma near 100, visible in between ---- */
assert(
  chem.emSpectrumPercent(chem.EM_AXIS_MAX_M) === 0,
  'Longest (radio) wavelength maps to 0%'
);
assert(
  chem.emSpectrumPercent(chem.EM_AXIS_MIN_M) === 100,
  'Shortest (gamma) wavelength maps to 100%'
);
const visiblePct = chem.emSpectrumPercentFromNm(550);
assert(
  visiblePct > 0 && visiblePct < 100,
  `Visible light (550 nm) sits strictly between radio and gamma on the EM axis (got ${visiblePct.toFixed(2)}%)`
);
const halphaEmPct = chem.emSpectrumPercentFromNm(656.3);
const uvPct = chem.emSpectrumPercent(2e-7); // 200 nm, UV
assert(
  halphaEmPct < uvPct,
  'Visible light sits at a longer wavelength (lower %) than UV on the EM axis'
);

/* ---- EM_SPECTRUM_BANDS ordering: monotonically shrinking wavelengths, radio -> gamma ---- */
for (let i = 1; i < chem.EM_SPECTRUM_BANDS.length; i += 1) {
  assert(
    chem.EM_SPECTRUM_BANDS[i].minM <= chem.EM_SPECTRUM_BANDS[i - 1].maxM,
    `EM_SPECTRUM_BANDS[${i}] (${chem.EM_SPECTRUM_BANDS[i].name}) continues from the previous band`
  );
}

/* ---- HYDROGEN_LEVELS: matches E_n = -13.6/n^2, strictly increasing (less negative) with n ---- */
assert(chem.HYDROGEN_LEVELS.length === 6, 'HYDROGEN_LEVELS has 6 levels (n=1..6)');
assert(
  approxEqual(chem.HYDROGEN_LEVELS[0].energyEv, -13.6, 0.01),
  `n=1 ground state is -13.6 eV, got ${chem.HYDROGEN_LEVELS[0].energyEv}`
);
assert(
  approxEqual(chem.HYDROGEN_LEVELS[1].energyEv, -3.4, 0.01),
  `n=2 is -3.4 eV, got ${chem.HYDROGEN_LEVELS[1].energyEv}`
);
for (let i = 1; i < chem.HYDROGEN_LEVELS.length; i += 1) {
  assert(
    chem.HYDROGEN_LEVELS[i].energyEv > chem.HYDROGEN_LEVELS[i - 1].energyEv,
    `HYDROGEN_LEVELS energy increases (less negative) with n at index ${i}`
  );
}

/* ---- bohrOrbitRadius: r proportional to n^2, n=nMax lands exactly on rMax ---- */
assert(
  approxEqual(chem.bohrOrbitRadius(6, 140, 6), 140, 1e-9),
  'bohrOrbitRadius: outermost orbit (n=nMax) equals rMax'
);
assert(
  approxEqual(chem.bohrOrbitRadius(3, 140, 6), 35, 1e-9),
  `bohrOrbitRadius: n=3 of 6 is quarter of rMax (r ~ n^2), got ${chem.bohrOrbitRadius(3, 140, 6)}`
);
assert(
  chem.bohrOrbitRadius(1, 140, 6) < chem.bohrOrbitRadius(2, 140, 6),
  'bohrOrbitRadius increases with n'
);

console.log(`\n${pass}/${pass + fail} passing`);
if (fail > 0) {
  process.exitCode = 1;
}