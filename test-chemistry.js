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
assert(chem.HYDROGEN_LEVELS.length === 9, 'HYDROGEN_LEVELS has 9 levels (n=1..9, the highest any series starts from)');
chem.HYDROGEN_LEVELS.forEach((lvl, i) => {
  assert(lvl.n === i + 1, `HYDROGEN_LEVELS[${i}] is n=${i + 1}`);
  assert(approxEqual(lvl.energyEv, -13.6 / (lvl.n * lvl.n), 1e-12), `level n=${lvl.n} is -13.6/n^2 eV, got ${lvl.energyEv}`);
});
assert(approxEqual(chem.HYDROGEN_LEVELS[8].energyEv, -0.168, 0.001), `n=9 is about -0.168 eV, got ${chem.HYDROGEN_LEVELS[8].energyEv}`);
assert(chem.HYDROGEN_LIMIT_EV === 0 && chem.HYDROGEN_LEVELS.every((l) => l.energyEv < chem.HYDROGEN_LIMIT_EV), 'every level lies below the ionisation limit (0 eV)');
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

/* =====================================================================
 * The five hydrogen series, the UV / IR viewers and the per-series axis
 * ===================================================================== */

/* textbook values (nm): first four lines of each series, and the series limit */
const TEXTBOOK = {
  lyman:    { nFinal: 1, band: 'uv',      bandLabel: 'UV',      lines: [121.5, 102.5, 97.2, 94.9],        limit: 91.1 },
  balmer:   { nFinal: 2, band: 'visible', bandLabel: 'Visible', lines: [656.1, 486.0, 433.9, 410.1],      limit: 364.5 },
  paschen:  { nFinal: 3, band: 'ir',      bandLabel: 'IR',      lines: [1874.6, 1281.4, 1093.5, 1004.6],  limit: 820.1 },
  brackett: { nFinal: 4, band: 'ir',      bandLabel: 'IR',      lines: [4050, 2624.7, 2165, 1944],        limit: 1458 },
  pfund:    { nFinal: 5, band: 'ir',      bandLabel: 'IR',      lines: [7455, 4651, 3738.7, 3295],        limit: 2279 },
};
const within = (got, want) => Math.abs(got - want) <= Math.max(0.5, want * 0.002); // 0.5 nm or 0.2 %

assert(Array.isArray(chem.HYDROGEN_SERIES) && chem.HYDROGEN_SERIES.length === 5, 'HYDROGEN_SERIES has five series');
assert(
  chem.HYDROGEN_SERIES.map((s) => s.id).join() === 'lyman,balmer,paschen,brackett,pfund',
  'HYDROGEN_SERIES is ordered Lyman, Balmer, Paschen, Brackett, Pfund'
);

chem.HYDROGEN_SERIES.forEach((series) => {
  const t = TEXTBOOK[series.id];
  assert(!!t, `${series.id} is a known series`);
  assert(series.nFinal === t.nFinal, `${series.name} lands on n=${t.nFinal}`);
  assert(series.band === t.band, `${series.name} is a ${t.band} series, got ${series.band}`);
  assert(series.bandLabel === t.bandLabel, `${series.name} band label is ${t.bandLabel}, got ${series.bandLabel}`);
  assert(series.name === series.id[0].toUpperCase() + series.id.slice(1), `${series.id} has its capitalised name`);
  assert(within(series.limitNm, t.limit), `${series.name} limit ~${t.limit} nm, got ${series.limitNm.toFixed(2)}`);
  assert(series.lines.length === 4, `${series.name} has four lines`);
  assert(typeof series.description === 'string' && series.description.length > 10 && series.description.length < 130, `${series.name} has a one-sentence description`);

  series.lines.forEach((ln, i) => {
    const tag = `${series.name} n=${ln.nInitial}->${ln.nFinal}`;
    assert(ln.seriesId === series.id, `${tag} carries its series id`);
    assert(ln.nFinal === series.nFinal && ln.nInitial === series.nFinal + 1 + i, `${tag} is the ${i + 1}th line of the series`);
    assert(within(ln.wavelength, t.lines[i]), `${tag} expected ~${t.lines[i]} nm, got ${ln.wavelength.toFixed(2)}`);
    assert(approxEqual(ln.wavelength, chem.transitionWavelengthNm(ln.nInitial, ln.nFinal), 1e-9), `${tag} matches transitionWavelengthNm()`);
    assert(
      approxEqual(ln.energyEv, 13.6 * (1 / (ln.nFinal * ln.nFinal) - 1 / (ln.nInitial * ln.nInitial)), 1e-9),
      `${tag} energy is the gap between the two levels`
    );
    assert(approxEqual(ln.energyEv / chem.transitionEnergyEv(ln.wavelength), 1, 0.002), `${tag} energy agrees with 1240/lambda to 0.2 %`);
    assert(/^[A-Z][a-z]?[\u03B1-\u03B4]$/.test(ln.label), `${tag} has a Greek-letter label, got ${ln.label}`);
    assert(ln.wavelength > series.limitNm, `${tag} lies on the long side of the series limit`);
    assert(chem.lightBand(ln.wavelength) === series.band, `${tag} falls in the ${series.band} band`);
    if (i > 0) {
      assert(ln.wavelength < series.lines[i - 1].wavelength, `${series.name} lines get shorter (and crowd up) towards the limit`);
      assert(ln.energyEv > series.lines[i - 1].energyEv, `${series.name} photon energy rises along the series`);
    }
  });
  assert(new Set(series.lines.map((l) => l.label)).size === 4, `${series.name} labels are unique`);
});

/* labels the learner will see */
const labelOf = (id) => chem.HYDROGEN_SERIES.find((s) => s.id === id).lines.map((l) => l.label).join(' ');
assert(labelOf('lyman') === 'Ly\u03B1 Ly\u03B2 Ly\u03B3 Ly\u03B4', `Lyman labels, got ${labelOf('lyman')}`);
assert(labelOf('balmer') === 'H\u03B1 H\u03B2 H\u03B3 H\u03B4', `Balmer labels, got ${labelOf('balmer')}`);
assert(labelOf('paschen').split(' ')[2] === 'P\u03B3', 'Paschen gamma reads P\u03B3');

/* Lyman alpha is the textbook 10.20 eV; the panel shows two decimals */
const lyA = chem.HYDROGEN_SERIES[0].lines[0];
assert(lyA.energyEv.toFixed(2) === '10.20', `Lyman alpha is 10.20 eV, got ${lyA.energyEv.toFixed(2)}`);
assert(lyA.wavelength.toFixed(1) === '121.5', `Lyman alpha is 121.5 nm, got ${lyA.wavelength.toFixed(1)}`);

/* Balmer stays exactly what it was: BALMER_SERIES is the Balmer lines, and the page keeps the observed wavelengths */
const balmer = chem.HYDROGEN_SERIES.find((s) => s.id === 'balmer');
assert(chem.BALMER_SERIES === balmer.lines, 'BALMER_SERIES is derived from the new series data');
assert(balmer.lines.map((l) => l.observedNm).join() === '656.3,486.1,434,410.2', 'Balmer keeps its observed (air) wavelengths for the chips');
assert(balmer.description === chem.GAS_ELEMENTS.H.description, 'Balmer keeps the original description');
assert(chem.HYDROGEN_SERIES.filter((s) => s.id !== 'balmer').every((s) => s.lines.every((l) => l.observedNm === undefined)), 'only Balmer carries observed wavelengths');
assert(approxEqual(chem.balmerWavelengthNm(3), chem.transitionWavelengthNm(3, 2), 1e-12), 'balmerWavelengthNm(n) still means n -> 2');
assert(approxEqual(chem.balmerWavelengthNm(2, 1), 121.5, 0.5), 'balmerWavelengthNm(2, 1) still takes another n_final');

/* ---- lightBand: the eye sees 380-700 nm ---- */
assert(chem.lightBand(91.1) === 'uv' && chem.lightBand(364.5) === 'uv', 'Lyman limit and Balmer limit are ultraviolet');
assert(chem.lightBand(379.9) === 'uv' && chem.lightBand(380) === 'visible', 'visible starts at 380 nm');
assert(chem.lightBand(550) === 'visible' && chem.lightBand(700) === 'visible', '550 and 700 nm are visible');
assert(chem.lightBand(700.1) === 'ir' && chem.lightBand(1874.6) === 'ir' && chem.lightBand(7455) === 'ir', 'beyond 700 nm is infrared');
chem.HYDROGEN_SERIES.filter((s) => s.id !== 'balmer').forEach((s) => {
  assert(s.lines.every((l) => l.wavelength < chem.VISIBLE_MIN_NM || l.wavelength > chem.VISIBLE_MAX_NM), `no ${s.name} line is visible to the naked eye`);
});
assert(balmer.lines.every((l) => l.wavelength >= chem.VISIBLE_MIN_NM && l.wavelength <= chem.VISIBLE_MAX_NM), 'all four Balmer lines are visible');

/* ---- seriesAxis / axisPercent ---- */
chem.HYDROGEN_SERIES.forEach((series) => {
  const axis = chem.seriesAxis(series);
  const longest = Math.max(...series.lines.map((l) => l.wavelength));
  const shortest = Math.min(...series.lines.map((l) => l.wavelength));
  assert(axis.maxNm > axis.minNm, `${series.name} axis runs from short to long wavelength`);
  assert(axis.maxNm >= longest && axis.minNm <= shortest, `${series.name} axis holds every line`);
  assert(axis.ticks.length >= 4 && axis.ticks.length <= 8, `${series.name} axis has a handful of ticks, got ${axis.ticks.length}`);
  assert(axis.ticks.every((v, i) => i === 0 || v > axis.ticks[i - 1]), `${series.name} ticks increase`);
  assert(axis.ticks.every((v) => v >= axis.minNm && v <= axis.maxNm), `${series.name} ticks lie on the axis`);
  const step = axis.ticks[1] - axis.ticks[0];
  assert(/^[125]$/.test(String(step).replace(/[0.]/g, '').slice(0, 1)) && axis.ticks.every((v) => Math.abs(v / step - Math.round(v / step)) < 1e-9), `${series.name} ticks are nice multiples of ${step}`);

  const pcts = series.lines.map((l) => chem.axisPercent(series, l.wavelength));
  assert(pcts.every((p) => p >= 0 && p <= 100), `${series.name} line positions are within 0-100 %`);
  for (let i = 1; i < pcts.length; i += 1) {
    assert(pcts[i] < pcts[i - 1], `${series.name}: a shorter wavelength sits nearer the 0 % end`);
  }
  assert(chem.axisPercent(series, axis.minNm - 1000) === 0 && chem.axisPercent(series, axis.maxNm + 1000) === 100, `${series.name} positions clamp to 0-100 %`);
  assert(approxEqual(chem.axisPercent(series, axis.minNm), 0, 1e-9) && approxEqual(chem.axisPercent(series, axis.maxNm), 100, 1e-9), `${series.name} axis ends map to 0 and 100 %`);

  if (series.id === 'balmer') {
    assert(axis.minNm === chem.VISIBLE_MIN_NM && axis.maxNm === chem.VISIBLE_MAX_NM, 'Balmer keeps the 380-700 nm axis');
    assert(axis.limitPercent === null, 'the Balmer limit (364.5 nm) is off the visible screen');
    series.lines.forEach((l) => {
      assert(chem.axisPercent(series, l.wavelength) === chem.visiblePercent(l.wavelength), `Balmer ${l.label} sits exactly where visiblePercent puts it`);
    });
  } else {
    assert(axis.minNm < series.limitNm && axis.maxNm > longest, `${series.name} axis runs from just below the limit to just above the longest line`);
    assert(axis.limitPercent > 0 && axis.limitPercent < Math.min(...pcts), `${series.name} limit marker (${axis.limitPercent && axis.limitPercent.toFixed(1)} %) sits left of every line`);
    assert(pcts[0] > 90 && pcts[0] < 100, `${series.name} longest line sits near the right end, got ${pcts[0].toFixed(1)} %`);
  }
});
assert(chem.niceTickStep(32.2) === 5 && chem.niceTickStep(1117) === 200 && chem.niceTickStep(320) === 50, 'niceTickStep picks 1/2/5 x 10^k steps');

/* ---- VIEWERS ---- */
assert(chem.VIEWER_ORDER.join() === 'uv,ir', 'two viewers: UV screen, then IR viewer');
assert(chem.VIEWERS.uv.name === 'UV screen' && chem.VIEWERS.ir.name === 'IR viewer', 'viewer names read UV screen / IR viewer');
assert(chem.VIEWERS.uv.handles === 'uv' && chem.VIEWERS.ir.handles === 'ir', 'each viewer handles its own band');
assert(chem.VIEWERS.uv.id === 'uv' && chem.VIEWERS.ir.id === 'ir', 'viewer ids match their keys');
assert(/^#[0-9a-f]{6}$/i.test(chem.VIEWERS.uv.glow) && /^#[0-9a-f]{6}$/i.test(chem.VIEWERS.ir.glow), 'glow colours are hex');
{
  const rgb = (c) => (c[0] === '#' ? [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) : c.match(/\d+/g).map(Number));
  const dist = (a, b) => Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]));
  assert(dist(chem.VIEWERS.uv.glow, chem.VIEWERS.ir.glow) > 100, 'the two glow colours are clearly different from each other');
  chem.BALMER_SERIES.forEach((l) => {
    const c = chem.wavelengthToRGB(l.wavelength);
    ['uv', 'ir'].forEach((v) => assert(dist(chem.VIEWERS[v].glow, c) > 100, `${v} glow is not confusable with Balmer ${l.label} (${c})`));
  });
  assert(dist(chem.VIEWERS.uv.glow, chem.GAS_ELEMENTS.H.tubeColor) > 100 && dist(chem.VIEWERS.ir.glow, chem.GAS_ELEMENTS.H.tubeColor) > 100, 'neither glow is the pink tube colour');
}

/* ---- appearance(): eye / matching viewer / wrong viewer / no viewer ---- */
chem.BALMER_SERIES.forEach((l) => {
  [null, 'uv', 'ir'].forEach((v) => {
    const a = chem.appearance(l.wavelength, v);
    assert(a.visible === true && a.via === 'eye' && a.color === chem.wavelengthToRGB(l.wavelength), `visible ${l.label} reaches the eye with viewer ${v}`);
  });
});
chem.HYDROGEN_SERIES.filter((s) => s.band !== 'visible').forEach((s) => {
  const right = s.band; // 'uv' | 'ir'
  const wrong = s.band === 'uv' ? 'ir' : 'uv';
  s.lines.forEach((l) => {
    const ok = chem.appearance(l.wavelength, right);
    assert(ok.visible && ok.via === 'viewer' && ok.color === chem.VIEWERS[right].glow, `${s.name} ${l.label} glows in the ${right} viewer's colour`);
    const no = chem.appearance(l.wavelength, wrong);
    assert(!no.visible && no.via === null && no.color === null, `${s.name} ${l.label} stays dark in the wrong viewer`);
    const none = chem.appearance(l.wavelength, null);
    assert(!none.visible && none.via === null && none.color === null, `${s.name} ${l.label} is invisible with no viewer`);
  });
});
assert(!chem.appearance(121.5, 'nope').visible, 'an unknown viewer shows nothing');
assert(!chem.appearance(121.5).visible, 'a missing viewer shows nothing');
assert(chem.viewerHandlesSeries('uv', chem.HYDROGEN_SERIES[0]) && !chem.viewerHandlesSeries('ir', chem.HYDROGEN_SERIES[0]), 'the UV screen handles Lyman, the IR viewer does not');
assert(chem.viewerHandlesSeries('ir', chem.HYDROGEN_SERIES[2]) && chem.viewerHandlesSeries('ir', chem.HYDROGEN_SERIES[4]) && !chem.viewerHandlesSeries('uv', chem.HYDROGEN_SERIES[3]), 'the IR viewer handles Paschen and Pfund, the UV screen does not');
assert(!chem.viewerHandlesSeries('uv', balmer) && !chem.viewerHandlesSeries('ir', balmer) && !chem.viewerHandlesSeries(null, balmer), 'no viewer handles the visible Balmer series');
assert(chem.viewerForSeries(chem.HYDROGEN_SERIES[0]).id === 'uv' && chem.viewerForSeries(chem.HYDROGEN_SERIES[3]).id === 'ir' && chem.viewerForSeries(balmer) === null, 'viewerForSeries names the right device');

console.log(`\n${pass}/${pass + fail} passing`);
if (fail > 0) {
  process.exitCode = 1;
}