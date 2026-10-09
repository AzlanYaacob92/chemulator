/* test-dom.js — run with: node test-dom.js
 * jsdom smoke test for the emission-spectra page as it is laid out now:
 * a light-source sidebar and three stacked cards (setup, line spectrum,
 * transition diagram).
 *   power off on load -> switch on (sequential animation) -> the line
 *   spectrum appears -> clicking a line opens the transition panel ->
 *   the view toggle switches between energy levels and the Bohr atom ->
 *   another source closes the panel -> power off clears the result.
 * jsdom has no Web Animations API, so motion.js lands every animation on its
 * final state at once; only the power-on sequence still runs on real timers.
 *
 * Then hydrogen's five series and the plate that makes UV / IR visible: the series
 * control, the invisible fan, docking a plate (right one, wrong one, swapping, sliding
 * out when the series changes), the Line spectrum card in each state, the transition
 * diagram for every series, the EM comparison. A second jsdom with prefers-reduced-motion
 * lets those checks run without waiting on any timer.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

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

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

(async () => {
  const read = (name) => fs.readFileSync(path.join(__dirname, name), 'utf8');
  const appSrc = read('app.js');

  const dom = new JSDOM(read('index.html'), { runScripts: 'outside-only', url: 'http://localhost/' });
  const { window } = dom;

  window.matchMedia =
    window.matchMedia ||
    function () {
      return { matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} };
    };

  ['icons.js', 'motion.js', 'chemistry.js'].forEach((name) => dom.window.eval(read(name)));
  dom.window.eval(appSrc);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true, cancelable: true }));

  const doc = window.document;
  const $ = (id) => doc.getElementById(id);
  function click(el) {
    el.dispatchEvent(new window.Event('click', { bubbles: true }));
  }
  function setPower(on) {
    $('power-toggle').checked = on;
    $('power-toggle').dispatchEvent(new window.Event('change', { bubbles: true }));
  }

  /* ---- the power-on timeline is strictly sequential: no phase overlaps the next ---- */
  const seq = {};
  ['SEQ_GLOW_MS', 'SEQ_RAYS_MS', 'SEQ_BEAM_MS', 'SEQ_FAN_MS', 'SEQ_RAYS_START', 'SEQ_BEAM_START', 'SEQ_FAN_START', 'SEQ_TOTAL_MS', 'SEQ_RESULT_DELAY_MS'].forEach((name) => {
    const m = appSrc.match(new RegExp(`const ${name} = ([^;]+);`));
    seq[name] = m ? eval(m[1].replace(/SEQ_\w+/g, (t) => seq[t])) : NaN;
  });
  assert(seq.SEQ_RAYS_START >= seq.SEQ_GLOW_MS, 'Rays start only after the glow has finished');
  assert(seq.SEQ_BEAM_START >= seq.SEQ_RAYS_START + seq.SEQ_RAYS_MS, 'The beam starts only after the rays have finished');
  assert(seq.SEQ_FAN_START >= seq.SEQ_BEAM_START + seq.SEQ_BEAM_MS, 'The fan starts only after the beam has finished');
  assert(seq.SEQ_RESULT_DELAY_MS >= seq.SEQ_TOTAL_MS, 'The result appears only after the whole sequence');

  /* ---- initial state: power OFF, so the student follows the phenomenon from the switch ---- */
  assert($('source-symbol').textContent === 'H', 'Default source symbol is H');
  assert(!$('power-toggle').checked, 'Power starts OFF');
  assert($('power-label').textContent === 'Power off', 'Power label starts as "Power off"');
  assert($('apparatus-svg').textContent.includes('FLIP THE SWITCH'), 'Apparatus shows the flip-the-switch prompt while off');
  assert(!$('spectrum-empty').hidden && $('spectrum-body').hidden, 'Line spectrum card shows its empty state while off');
  assert($('transition-panel').hidden && !$('transition-empty').hidden, 'Transition card shows its empty state on load');
  assert(doc.querySelectorAll('.source-picker .sig-card').length === 7, 'Seven light sources are offered');
  assert(!!$('theme-toggle').querySelector('svg'), 'Theme toggle shows an icon, not an emoji');

  /* ---- power on: the sequence plays, then the spectrum arrives ---- */
  setPower(true);
  assert($('power-label').textContent === 'Power on', 'Power label follows the switch');
  assert(!$('result-svg').classList.contains('visible'), 'The spectrum is not shown while light is still travelling');
  assert($('spectrum-empty').textContent.includes('Watch the light'), 'The empty state says the light is on its way');
  await wait(seq.SEQ_RESULT_DELAY_MS + 150);
  assert($('result-svg').classList.contains('visible'), 'The spectrum is shown after the sequence');
  assert(!$('spectrum-body').hidden && $('spectrum-empty').hidden, 'The spectrum replaces the empty state');

  const lines = () => Array.from(doc.querySelectorAll('.wavelength-btn:not(.wavelength-btn--static)'));
  assert(lines().length === 4, 'Hydrogen shows its four visible Balmer lines as buttons');

  /* ---- a spectral line opens the transition panel ---- */
  const red = lines().find((b) => b.textContent.startsWith('656'));
  assert(!!red, 'The 656 nm line is offered');
  click(red);
  assert(!$('transition-panel').hidden, 'Selecting a line opens the transition panel');
  assert($('transition-empty').hidden, 'The empty state gives way to the panel');
  assert($('transition-panel-title').textContent.includes('n = 3'), 'Panel title names the n = 3 to n = 2 transition for 656 nm');
  assert(red.classList.contains('active'), 'The chosen line is marked');
  assert(!!$('energy-svg').querySelector('.js-electron'), 'An electron is drawn in the energy-level view');

  const violet = lines().find((b) => b.textContent.startsWith('434') || b.textContent.startsWith('433'));
  click(violet);
  assert($('transition-panel-title').textContent.includes('n = 5'), 'Panel title updates to the n = 5 transition');
  await wait(600);
  assert(!!$('energy-svg').querySelector('.photon-squiggle'), 'A photon squiggle appears partway through the transition');

  /* ---- view toggle: energy levels <-> Bohr atom ---- */
  click($('mode-atom'));
  assert($('energy-svg').hasAttribute('hidden') && !$('atom-svg').hasAttribute('hidden'), 'Atomic view replaces the energy-level view');
  assert($('mode-atom').getAttribute('aria-pressed') === 'true' && $('mode-levels').getAttribute('aria-pressed') === 'false', 'The view toggle reports which view is pressed');
  assert(!!$('atom-svg').querySelector('.js-electron'), 'The transition replays in the atomic view');
  click($('mode-levels'));
  assert(!$('energy-svg').hasAttribute('hidden') && $('atom-svg').hasAttribute('hidden'), 'Energy-level view comes back');

  /* ---- EM comparison opens and closes ---- */
  click($('em-toggle'));
  assert($('em-reveal-wrap').classList.contains('phase-visible') && $('em-toggle').getAttribute('aria-expanded') === 'true', 'EM comparison opens');
  click($('em-toggle'));
  await wait(20);
  assert(!$('em-reveal-wrap').classList.contains('phase-visible') && $('em-toggle').getAttribute('aria-expanded') === 'false', 'EM comparison closes');

  /* ---- another source closes the panel and replays the sequence ---- */
  click(doc.querySelectorAll('.source-picker .sig-card')[1]);
  await wait(20);
  assert($('source-symbol').textContent === 'He', 'Choosing helium updates the headline');
  assert($('transition-panel').hidden, 'Changing source closes the transition panel');
  assert($('transition-card').hidden, 'The Transition diagram card is removed for non-hydrogen sources');
  assert(!$('result-svg').classList.contains('visible'), 'The spectrum waits for the new sequence');
  await wait(seq.SEQ_RESULT_DELAY_MS + 150);
  assert($('result-svg').classList.contains('visible'), 'The helium spectrum arrives');
  assert(lines().length === 0, 'Only hydrogen lines are clickable');

  /* ---- power off clears the result ---- */
  setPower(false);
  await wait(20);
  assert(!$('result-svg').classList.contains('visible') && $('spectrum-body').hidden, 'Power off hides the spectrum');
  assert($('spectrum-empty').textContent.includes('Switch the power on'), 'The empty state asks for the power again');

  /* =====================================================================
   * Hydrogen's five series, and the plate that makes UV / IR visible.
   * ===================================================================== */
  const Chem = require('./chemistry.js');

  /* timings the page declares, read from the source the same way the sequence is above */
  const consts = {};
  ['SEQ_FAN_MS', 'SEQ_RESULT_DELAY_MS', 'FAN_REPLAY_DELAY_MS', 'FAN_REPLAY_RESULT_DELAY_MS', 'GLOW_BLOOM_MS', 'GLOW_STAGGER_MS', 'ANIM_VIBRATE_MS'].forEach((name) => {
    const m = appSrc.match(new RegExp(`const ${name} = ([^;]+);`));
    consts[name] = m ? new Function('c', `with (c) { return (${m[1]}); }`)(Object.assign({}, seq, consts)) : NaN;
  });
  const bloomWait = consts.GLOW_BLOOM_MS + 3 * consts.GLOW_STAGGER_MS; // four lines, one after another
  assert(consts.FAN_REPLAY_RESULT_DELAY_MS < consts.SEQ_RESULT_DELAY_MS, 'A new series replays only the fan: sooner than the whole power-on');
  assert(consts.FAN_REPLAY_RESULT_DELAY_MS >= consts.FAN_REPLAY_DELAY_MS + consts.SEQ_FAN_MS, 'The result waits for the replayed fan to reach the screen');

  /* ---- real timers: a series change replays the fan only, a docked plate adds the bloom ---- */
  click(doc.querySelectorAll('.source-picker .sig-card')[0]); // back to hydrogen, power still off
  await wait(20);
  assert($('source-symbol').textContent === 'H' && !$('series-toggle').hidden, 'Hydrogen again: its series control is back');
  setPower(true);
  await wait(seq.SEQ_RESULT_DELAY_MS + 150);
  assert($('result-svg').classList.contains('visible') && lines().length === 4, 'Hydrogen powered: the four Balmer chips');
  click(doc.querySelector('#series-toggle button[data-series="paschen"]'));
  assert($('power-toggle').checked && $('power-label').textContent === 'Power on', 'Changing series keeps the power state');
  assert(!$('result-svg').classList.contains('visible') && $('spectrum-empty').textContent.includes('Watch the light'), 'A new series hides the old spectrum while the fan replays');
  await wait(Math.min(400, consts.FAN_REPLAY_RESULT_DELAY_MS - 300));
  assert(!$('result-svg').classList.contains('visible'), 'The fan is still on its way');
  await wait(consts.FAN_REPLAY_RESULT_DELAY_MS + 150);
  assert($('result-svg').classList.contains('visible'), 'The result is back after the fan replay alone, not the whole power-on');
  assert(consts.FAN_REPLAY_RESULT_DELAY_MS + 150 < seq.SEQ_RESULT_DELAY_MS, 'which is sooner than the full sequence');
  assert($('result-svg').textContent.includes('Invisible to the eye.'), 'Paschen is infrared: invisible without a viewer');

  /* a plate docked before power-on: the lines bloom before the card fills in */
  setPower(false);
  await wait(20);
  click(doc.querySelector('.tray-btn[data-viewer="ir"]'));
  await wait(40);
  assert(!!$('apparatus-svg').querySelector('.plate[data-viewer="ir"]'), 'The IR viewer docks while the power is off');
  assert($('apparatus-svg').querySelectorAll('.glow-spot').length === 0, 'Nothing glows without power');
  setPower(true);
  await wait(seq.SEQ_RESULT_DELAY_MS + 100);
  assert(!$('result-svg').classList.contains('visible'), 'With a plate in the beam the card waits for the lines to bloom');
  await wait(bloomWait + 500);
  assert($('result-svg').classList.contains('visible') && lines().length === 4, 'then the four glowing lines arrive');
  assert($('apparatus-svg').querySelectorAll('.glow-spot').length === 4, 'one glow spot per line on the plate');

  /* ---- hydrogen's series, plates and diagrams: reduced motion lands every animation at once ---- */
  async function makeDom(reduced) {
    const d = new JSDOM(read('index.html'), { runScripts: 'outside-only', url: 'http://localhost/' });
    const w = d.window;
    w.matchMedia = (q) => ({ matches: reduced && /prefers-reduced-motion/.test(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
    ['icons.js', 'motion.js', 'chemistry.js'].forEach((name) => w.eval(read(name)));
    w.eval(appSrc);
    w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true, cancelable: true }));
    return w;
  }
  const rw = await makeDom(true);
  const rd = rw.document;
  const r$ = (id) => rd.getElementById(id);
  const rclick = (el) => el.dispatchEvent(new rw.Event('click', { bubbles: true }));
  const rpower = (on) => { r$('power-toggle').checked = on; r$('power-toggle').dispatchEvent(new rw.Event('change', { bubbles: true })); };
  const rchips = () => Array.from(rd.querySelectorAll('.wavelength-btn:not(.wavelength-btn--static)'));
  const rseries = (id) => rclick(rd.querySelector(`#series-toggle button[data-series="${id}"]`));
  const rtray = (id) => rclick(rd.querySelector(`.tray-btn[data-viewer="${id}"]`));
  const pressed = (el) => el.getAttribute('aria-pressed') === 'true';
  const plateOf = () => r$('apparatus-svg').querySelector('.plate');
  const spots = () => r$('apparatus-svg').querySelectorAll('.glow-spot').length;
  const chipTexts = (series) => series.lines.map((l) => ((l.observedNm !== undefined ? l.observedNm : l.wavelength).toFixed(1) + ' nm'));
  const toBand = (series) => (series.band === 'uv' ? 'uv' : 'ir');

  /* the control: five buttons, Balmer on, only for hydrogen */
  const toggleButtons = Array.from(rd.querySelectorAll('#series-toggle button'));
  assert(!r$('series-toggle').hidden && r$('series-toggle').getAttribute('role') === 'group', 'The series control is a group of buttons');
  assert(toggleButtons.map((b) => b.textContent).join('|') === 'Lyman \u00B7 UV|Balmer \u00B7 Visible|Paschen \u00B7 IR|Brackett \u00B7 IR|Pfund \u00B7 IR', 'Series buttons read Lyman \u00B7 UV ... Pfund \u00B7 IR');
  assert(toggleButtons.every((b) => b.tagName === 'BUTTON' && b.type === 'button'), 'The series options are real buttons');
  assert(toggleButtons.map(pressed).join() === 'false,true,false,false,false', 'Balmer is pressed on load');
  assert(r$('viewer-tray').hidden, 'No tray for Balmer');
  assert(r$('source-description').textContent === Chem.GAS_ELEMENTS.H.description, 'Balmer keeps its original description');
  rpower(true);
  await wait(20);
  assert(rchips().length === 4 && rchips()[0].textContent === '410.2 nm', 'Balmer chips are as ever (410.2 ... 656.3 nm)');
  assert(r$('stage-note').textContent.startsWith('Each line is one exact colour. Click a wavelength'), 'Balmer keeps its original note');
  assert(!r$('apparatus-svg').querySelector('.invisible-fan, .bench-group, .plate'), 'Balmer draws no invisible fan, bench or plate');

  /* nothing of this for any other source */
  rclick(rd.querySelectorAll('.source-picker .sig-card')[1]);
  await wait(20);
  assert(r$('series-toggle').hidden && r$('viewer-tray').hidden, 'The series control and the tray are hidden for helium');
  rclick(rd.querySelectorAll('.source-picker .sig-card')[0]);
  await wait(20);
  assert(!r$('series-toggle').hidden && r$('viewer-tray').hidden, 'and back for hydrogen (Balmer: still no tray)');

  const OTHER = Chem.HYDROGEN_SERIES.filter((s) => s.id !== 'balmer');
  for (const series of OTHER) {
    const band = toBand(series);
    const viewer = Chem.VIEWERS[band];
    const wrongViewer = Chem.VIEWERS[band === 'uv' ? 'ir' : 'uv'];
    const idx = Chem.HYDROGEN_SERIES.indexOf(series);
    if (rd.querySelector('.tray-btn[aria-pressed="true"]')) { rclick(rd.querySelector('.tray-btn[aria-pressed="true"]')); await wait(20); }

    /* the series on show, with nothing in the beam */
    rseries(series.id);
    await wait(20);
    assert(Array.from(rd.querySelectorAll('#series-toggle button')).map(pressed).indexOf(true) === idx, `${series.name}: its button is the pressed one`);
    assert(r$('source-description').textContent === `${series.name} series: ${series.band === 'uv' ? 'ultraviolet' : 'infrared'} lines, electron falls to n = ${series.nFinal}.`, `${series.name}: the description follows the series`);
    assert(!r$('viewer-tray').hidden && rd.querySelectorAll('.tray-btn').length === 2, `${series.name}: the tray offers two plates`);
    assert(Array.from(rd.querySelectorAll('.tray-btn')).map((b) => b.textContent).join('|') === 'UV screen|IR viewer', `${series.name}: the plates are the UV screen and the IR viewer`);
    assert(Array.from(rd.querySelectorAll('.tray-btn')).every((b) => !pressed(b) && b.tagName === 'BUTTON'), `${series.name}: both plates start in the tray`);
    assert(!!r$('apparatus-svg').querySelector('.invisible-fan') && r$('apparatus-svg').querySelectorAll('.invisible-fan line').length === 4, `${series.name}: the fan is four invisible rays`);
    assert(r$('apparatus-svg').querySelector('.invisible-tag').textContent === viewer.tag, `${series.name}: the fan is tagged ${viewer.tag}`);
    assert(!r$('apparatus-svg').querySelector('.plate') && !r$('apparatus-svg').querySelector('.glow-spot'), `${series.name}: no plate and no glow yet`);
    assert(r$('result-svg').textContent.includes('Invisible to the eye.') && rchips().length === 0, `${series.name}: dark strip, one message, no chips`);
    assert(r$('stage-note').textContent === 'Invisible to the eye.', `${series.name}: the note says so too`);
    const cta = r$('result-svg').querySelector('.add-viewer-btn');
    assert(!!cta && cta.tagName === 'BUTTON' && cta.textContent === (band === 'uv' ? 'Add a UV screen' : 'Add an IR viewer'), `${series.name}: a button offers the right plate (${cta && cta.textContent})`);
    assert(r$('viewer-status').textContent === 'Invisible to the eye.', `${series.name}: the live region says it is invisible`);
    assert(!r$('transition-card').hidden, `${series.name}: the Transition diagram card stays for hydrogen`);

    /* the call to action puts the right plate in the beam */
    rclick(cta);
    await wait(30);
    assert(pressed(rd.querySelector(`.tray-btn[data-viewer="${band}"]`)) && !pressed(rd.querySelector(`.tray-btn[data-viewer="${wrongViewer.id}"]`)), `${series.name}: the ${viewer.name} button is pressed`);
    assert(!!plateOf() && plateOf().getAttribute('data-viewer') === band, `${series.name}: the ${viewer.name} stands in the beam`);
    assert(plateOf().querySelector('.plate-spots') && spots() === 4, `${series.name}: four spots glow on the plate`);
    assert(r$('apparatus-svg').querySelector('.plate-label').textContent === viewer.name.toUpperCase(), `${series.name}: the plate is named ${viewer.name.toUpperCase()}`);
    assert(rchips().map((b) => b.textContent).join('|') === chipTexts(series).slice().reverse().join('|'), `${series.name}: chips read ${rchips().map((b) => b.textContent).join(', ')} (shortest wavelength first, as they sit on the strip)`);
    assert(rchips().length === 4 && rchips().every((b) => /^\d+\.\d nm$/.test(b.textContent)), `${series.name}: four chips in nm with one decimal`);
    assert(!r$('result-svg').querySelector('.add-viewer-btn'), `${series.name}: the call to action is gone`);
    assert(r$('stage-note').textContent === 'Glow shows where the lines fall. Click one.', `${series.name}: the note reads Glow shows where the lines fall.`);
    assert(r$('viewer-status').textContent === `${viewer.name} in place.`, `${series.name}: the live region says the ${viewer.name} is in place`);
    assert(r$('viewer-tray').querySelector('.tray-hint').textContent === '', `${series.name}: no hint with the right plate`);
    assert(Array.from(r$('result-svg').querySelectorAll('.line-mark rect')).filter((el) => el.getAttribute('fill') === viewer.glow).length >= 8, `${series.name}: the bars glow in the ${viewer.name}'s colour`);
    assert(r$('result-svg').querySelector('.false-colour-tag').textContent === 'false colour', `${series.name}: the strip says false colour`);
    assert(r$('result-svg').querySelector('.limit-label').textContent === `limit ${series.limitNm.toFixed(1)} nm`, `${series.name}: the series limit is marked (${series.limitNm.toFixed(1)} nm)`);
    assert(r$('result-svg').querySelectorAll('.axis-tick').length === Chem.seriesAxis(series).ticks.length, `${series.name}: a tick for every axis value`);
    assert(/ nm$/.test(Array.from(r$('result-svg').querySelectorAll('.axis-label')).pop().textContent), `${series.name}: the scale is in nm`);

    /* the first line (shortest wavelength = the highest n) opens its transition */
    const first = series.lines[series.lines.length - 1];
    const chip = rchips()[0];
    rclick(chip);
    await wait(20);
    const title = `n = ${first.nInitial} \u2192 n = ${first.nFinal} \u00B7 ${first.wavelength.toFixed(1)} nm \u00B7 ${first.energyEv.toFixed(2)} eV`;
    assert(r$('transition-panel-title').textContent === title, `${series.name}: panel title reads ${title} (got ${r$('transition-panel-title').textContent})`);
    assert(!r$('transition-panel').hidden && chip.classList.contains('active'), `${series.name}: the chosen line opens the panel`);
    const e = r$('energy-svg');
    assert(e.querySelectorAll('.lvl-line--landing').length === 1, `${series.name}: exactly one landing level`);
    assert(e.querySelector('.svg-note').textContent === `ALL ${series.name.toUpperCase()} TRANSITIONS LAND ON n = ${series.nFinal} \u00B7 SPACING NOT TO SCALE`, `${series.name}: the note names the landing level`);
    assert(e.querySelectorAll('.lvl-line:not(.lvl-line--limit)').length === first.nInitial, `${series.name}: levels n = 1 ... ${first.nInitial}`);
    assert(e.querySelectorAll('.lvl-line--limit').length === 1, `${series.name}: the n = infinity limit line is drawn`);
    const labelled = Array.from(e.querySelectorAll('.svg-n')).map((t) => t.textContent);
    assert(labelled.includes('n=' + first.nInitial) && labelled.includes('n=' + first.nFinal), `${series.name}: both levels of the jump are labelled`);
    assert(!!e.querySelector('.js-electron'), `${series.name}: the electron is on its starting level`);
    await wait(consts.ANIM_VIBRATE_MS + 100);
    assert(e.querySelectorAll('.photon-squiggle--invisible').length === 1 && e.querySelectorAll('.photon-squiggle:not(.photon-squiggle--invisible)').length === 0, `${series.name}: the photon is a dashed, colourless wave`);
    assert(e.querySelector('.photon-squiggle').getAttribute('stroke-dasharray') && e.querySelector('.photon-tag').textContent === viewer.tag, `${series.name}: dashed and tagged ${viewer.tag}`);

    /* Bohr's atom: every orbit the series uses, the landing one marked */
    rclick(r$('mode-atom'));
    await wait(consts.ANIM_VIBRATE_MS + 150);
    const a = r$('atom-svg');
    const lens = series.id === 'lyman';
    assert(a.querySelectorAll('.atom-orbit--landing').length === (lens ? 2 : 1), `${series.name}: the landing orbit is marked${lens ? ' (and again in the magnifier)' : ''}`);
    assert(a.querySelectorAll(':scope > .atom-orbit').length === first.nInitial, `${series.name}: orbits n = 1 ... ${first.nInitial}`);
    assert(!!a.querySelector('.atom-lens') === lens, `${series.name}: ${lens ? 'a magnifier shows the tiny n = 1 orbit' : 'no magnifier needed'}`);
    assert(a.querySelector('.svg-note').textContent === 'BOHR MODEL \u00B7 ORBIT RADII TO SCALE (r \u221D n\u00B2)' + (lens ? ' \u00B7 INSET \u00D73.5' : ''), `${series.name}: the note says what scale is used`);
    assert(a.querySelectorAll('.js-electron').length === (lens ? 2 : 1) && a.querySelectorAll('.photon-squiggle--invisible').length === 1, `${series.name}: the electron falls and the photon leaves`);
    rclick(r$('mode-levels'));
    await wait(20);

    /* the wrong plate: in the beam, nothing glows, a short hint */
    rclick(rd.querySelector(`.tray-btn[data-viewer="${band}"]`)); // out again
    await wait(30);
    assert(!plateOf() && r$('transition-panel').hidden, `${series.name}: taking the plate out clears the beam and the diagram`);
    assert(rchips().length === 0 && !!r$('result-svg').querySelector('.add-viewer-btn'), `${series.name}: dark strip and the call to action are back`);
    assert(r$('viewer-status').textContent === `${viewer.name} removed. Invisible to the eye.`, `${series.name}: the live region reports the removal`);
    rtray(wrongViewer.id);
    await wait(30);
    assert(!!plateOf() && plateOf().getAttribute('data-viewer') === wrongViewer.id, `${series.name}: the ${wrongViewer.name} can still be put in the beam`);
    const hint = r$('viewer-tray').querySelector('.tray-hint').textContent;
    assert(hint === `No glow. Try the ${viewer.name}.` && hint.split(/\s+/).length <= 6, `${series.name}: hint reads "${hint}"`);
    assert(spots() === 0 && rchips().length === 0, `${series.name}: the wrong plate shows no glow and no chips`);
    assert(r$('result-svg').textContent.includes('Invisible to the eye.') && r$('result-svg').querySelector('.add-viewer-btn').textContent === cta.textContent, `${series.name}: the strip is still dark, still offering the right plate`);
    assert(r$('viewer-status').textContent.includes('No glow'), `${series.name}: the live region says there is no glow`);
    /* swap to the right one from the strip */
    rclick(r$('result-svg').querySelector('.add-viewer-btn'));
    await wait(30);
    assert(plateOf().getAttribute('data-viewer') === band && rd.querySelectorAll('.plate').length === 1 && spots() === 4 && rchips().length === 4, `${series.name}: the right plate swaps the wrong one out`);
    assert(r$('viewer-tray').querySelector('.tray-hint').textContent === '', `${series.name}: and the hint goes`);

    /* the EM strip: five labelled dots, this series' own marker colour */
    if (!r$('em-reveal-wrap').classList.contains('phase-visible')) rclick(r$('em-toggle'));
    assert(rd.querySelectorAll('#em-legend .em-legend-item').length === 5 && rd.querySelectorAll('#em-legend .is-current').length === 1, `${series.name}: EM legend has five dots, one current`);
    assert(rd.querySelector('#em-legend .is-current').textContent === series.name, `${series.name}: the current dot is ${series.name}`);
    const solid = Array.from(rd.querySelectorAll('#em-line-strip .em-marker:not(.em-marker--faint)'));
    assert(solid.length === 4 && solid.every((m) => !m.classList.contains('em-marker--hollow') && m.style.background), `${series.name}: its four EM markers are filled in the plate's colour`);
    assert(rd.querySelectorAll('#em-line-strip .em-marker--faint').length === 16, `${series.name}: the other four series are faint behind`);
  }

  /* what the EM strip shows without a plate: hollow outlines */
  rtray('ir');
  await wait(30);
  assert(rd.querySelectorAll('#em-line-strip .em-marker--hollow').length === 4 && rd.querySelectorAll('#em-line-strip .em-marker:not(.em-marker--faint):not(.em-marker--hollow)').length === 0, 'Without a plate the series\' EM markers are hollow');
  assert(rd.querySelector('#em-legend .em-dot--visible') && rd.querySelectorAll('#em-legend .em-dot--visible').length === 1, 'Only Balmer\'s legend dot is the visible rainbow');
  rclick(r$('em-toggle'));

  /* a plate that suits the next series stays; one that doesn't slides out */
  rseries('paschen');
  await wait(20);
  rtray('ir');
  await wait(30);
  assert(!!plateOf() && spots() === 4, 'Paschen with the IR viewer');
  rseries('brackett');
  await wait(30);
  assert(!!plateOf() && plateOf().getAttribute('data-viewer') === 'ir' && pressed(rd.querySelector('.tray-btn[data-viewer="ir"]')), 'The IR viewer stays in the beam for Brackett');
  assert(rchips().length === 4 && rchips().every((b) => /^\d{4}\.\d nm$/.test(b.textContent)) && rchips()[3].textContent === '4050.1 nm', 'and its lines glow at once (wavelengths from 1000 nm read like 4050.1 nm)');
  rclick(rchips()[0]);
  await wait(20);
  assert(!r$('transition-panel').hidden, 'a line of Brackett is open');
  rseries('lyman');
  await wait(30);
  assert(r$('transition-panel').hidden && !r$('transition-empty').hidden, 'Changing series closes the transition panel');
  assert(!plateOf() && !spots(), 'The IR viewer cannot show Lyman: it slides out of the beam');
  assert(Array.from(rd.querySelectorAll('.tray-btn')).every((b) => !pressed(b)), 'and both plates are back in the tray');
  assert(rchips().length === 0 && !!r$('result-svg').querySelector('.add-viewer-btn') && r$('result-svg').querySelector('.add-viewer-btn').textContent === 'Add a UV screen', 'Lyman waits for the UV screen');
  assert(r$('power-toggle').checked, 'and the power stayed on throughout');

  /* a visible series takes the tray away, and any plate with it */
  rtray('uv');
  await wait(30);
  assert(!!plateOf() && spots() === 4, 'Lyman with the UV screen');
  rseries('balmer');
  await wait(30);
  assert(r$('viewer-tray').hidden && !plateOf() && !r$('apparatus-svg').querySelector('.plate, .bench-group, .invisible-fan'), 'Balmer: no tray, plate, bench or invisible fan');
  assert(rchips().length === 4 && rchips().every((b) => !b.classList.contains('active')) && r$('stage-note').textContent.startsWith('Each line is one exact colour'), 'Balmer: its four chips and note, exactly as before');
  assert(r$('source-description').textContent === Chem.GAS_ELEMENTS.H.description, 'Balmer: the original description is back');
  rseries('pfund');
  await wait(20);
  assert(Array.from(rd.querySelectorAll('.tray-btn')).every((b) => !pressed(b)) && !plateOf(), 'The plate does not come back by itself');

  /* another source takes the plate with it; the series is remembered for the way back */
  rtray('ir');
  await wait(30);
  assert(!!plateOf() && rchips().length === 4, 'Pfund with the IR viewer');
  rclick(rd.querySelectorAll('.source-picker .sig-card')[2]);
  await wait(30);
  assert(r$('series-toggle').hidden && r$('viewer-tray').hidden && !r$('apparatus-svg').querySelector('.plate, .bench-group'), 'Neon: no series control, tray or plate');
  assert(rchips().length === 0 && r$('result-svg').querySelectorAll('.wavelength-btn--static').length === 4, 'Neon: four static (not clickable) wavelengths');
  rclick(rd.querySelectorAll('.source-picker .sig-card')[0]);
  await wait(30);
  assert(pressed(rd.querySelector('#series-toggle button[data-series="pfund"]')) && !plateOf() && Array.from(rd.querySelectorAll('.tray-btn')).every((b) => !pressed(b)), 'Back to hydrogen: still Pfund, plate in the tray');
  assert(rchips().length === 0 && r$('stage-note').textContent === 'Invisible to the eye.', 'and the lines are invisible again');

  /* power off: nothing glows, nothing is shown; the plate stays where it is */
  rtray('ir');
  await wait(30);
  assert(spots() === 4 && rchips().length === 4, 'Pfund glows again');
  rpower(false);
  await wait(30);
  assert(!r$('result-svg').classList.contains('visible') && r$('spectrum-body').hidden, 'Power off hides the spectrum');
  assert(spots() === 0 && !!plateOf(), 'and the glow, but the plate stays in the beam');
  assert(!r$('viewer-tray').hidden && pressed(rd.querySelector('.tray-btn[data-viewer="ir"]')), 'the tray is still there');
  rpower(true);
  await wait(30);
  assert(spots() === 4 && rchips().length === 4, 'Power back on: the lines glow on the plate again');
  rtray('ir'); // remove
  await wait(30);
  assert(!plateOf(), 'Plate removed with a press of its own button');
  rw.close();

  console.log(`\n${pass}/${pass + fail} passing`);
  if (fail) process.exit(1);
  window.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
