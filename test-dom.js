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
  assert($('transition-panel').hidden && !$('transition-empty').hidden, 'Changing source closes the transition panel');
  assert($('transition-empty').textContent.includes('hydrogen only'), 'The empty state explains that diagrams are for hydrogen only');
  assert(!$('result-svg').classList.contains('visible'), 'The spectrum waits for the new sequence');
  await wait(seq.SEQ_RESULT_DELAY_MS + 150);
  assert($('result-svg').classList.contains('visible'), 'The helium spectrum arrives');
  assert(lines().length === 0, 'Only hydrogen lines are clickable');

  /* ---- power off clears the result ---- */
  setPower(false);
  await wait(20);
  assert(!$('result-svg').classList.contains('visible') && $('spectrum-body').hidden, 'Power off hides the spectrum');
  assert($('spectrum-empty').textContent.includes('Switch the power on'), 'The empty state asks for the power again');

  console.log(`\n${pass}/${pass + fail} passing`);
  if (fail) process.exit(1);
  window.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
