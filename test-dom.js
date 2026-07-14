/* test-dom.js — run with: node test-dom.js
 * jsdom smoke test for the sequential-simulation flow:
 * power off on load -> switch on (sequential animation) -> Next morphs to the
 * line spectrum -> clicking a line splits the card (spectrum half / diagram
 * half) -> mode toggle switches between energy-level and atomic (Bohr orbit)
 * views. Async because the card2->card3 swap is timeout-driven.
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
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const chemistrySrc = fs.readFileSync(path.join(__dirname, 'chemistry.js'), 'utf8');
  const appSrc = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

  const dom = new JSDOM(html, { runScripts: 'outside-only', resources: 'usable', url: 'http://localhost/' });
  const { window } = dom;

  window.matchMedia =
    window.matchMedia ||
    function () {
      return { matches: false, addListener() {}, removeListener() {} };
    };

  dom.window.eval(chemistrySrc);
  dom.window.eval(appSrc);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true, cancelable: true }));

  const doc = window.document;
  function click(el) {
    el.dispatchEvent(new window.Event('click', { bubbles: true }));
  }

  const navNext = doc.getElementById('nav-next');
  const navBack = doc.getElementById('nav-back');
  const apparatusSvg = doc.getElementById('apparatus-svg');
  const resultSvg = doc.getElementById('result-svg');
  const transitionPanel = doc.getElementById('transition-panel');
  const resultControls = doc.getElementById('result-controls');
  const powerToggle = doc.getElementById('power-toggle');

  /* ---- initial state: power OFF, user follows the phenomenon from the switch ---- */
  assert(doc.getElementById('source-symbol').textContent === 'H', 'Default source symbol is H');
  assert(!powerToggle.checked, 'Power starts OFF so the user can follow from switching on');
  assert(doc.getElementById('power-label').textContent === 'Power off', 'Power label starts as "Power off"');
  assert(navNext.disabled, 'Next is disabled while the power is off');
  assert(navBack.disabled, 'Back is disabled on the setup view');
  assert(apparatusSvg.textContent.includes('FLIP THE SWITCH'), 'Apparatus shows the flip-the-switch prompt while off');
  assert(transitionPanel.hidden, 'Transition panel is hidden on load');
  assert(resultControls.hidden, 'Result controls are hidden on load');

  /* ---- power on: strictly sequential timeline constants must not overlap ---- */
  const src = appSrc;
  const seq = {};
  ['SEQ_GLOW_MS', 'SEQ_RAYS_MS', 'SEQ_BEAM_MS', 'SEQ_FAN_MS', 'SEQ_RAYS_START', 'SEQ_BEAM_START', 'SEQ_FAN_START'].forEach(
    (name) => {
      const m = src.match(new RegExp(`const ${name} = ([^;]+);`));
      seq[name] = m ? eval(m[1].replace(/SEQ_\w+/g, (t) => seq[t])) : NaN;
    }
  );
  assert(seq.SEQ_RAYS_START === seq.SEQ_GLOW_MS, 'Rays begin only when the glow has fully finished');
  assert(seq.SEQ_BEAM_START === seq.SEQ_RAYS_START + seq.SEQ_RAYS_MS, 'Beam begins only when the rays have finished');
  assert(seq.SEQ_FAN_START === seq.SEQ_BEAM_START + seq.SEQ_BEAM_MS, 'Diffraction fan begins only when the beam has finished');

  powerToggle.checked = true;
  powerToggle.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert(doc.getElementById('power-label').textContent === 'Power on', 'Power label flips to "Power on"');
  assert(!navNext.disabled, 'Next becomes enabled once powered');
  assert(apparatusSvg.querySelectorAll('line').length > 0, 'Apparatus draws rays/beam/fan elements');
  assert(apparatusSvg.querySelectorAll('#apparatus-screen').length === 1, 'Apparatus has exactly one #apparatus-screen element');

  /* ---- Next: play the zoom-into-screen morph transition ---- */
  click(navNext);
  assert(navNext.disabled, 'Next is disabled immediately while the transition plays');
  await wait(120);
  assert(
    apparatusSvg.style.transform.includes('scale'),
    'The apparatus zooms (scale transform) toward the screen during the transition'
  );
  await wait(800);

  assert(doc.getElementById('stage-heading').textContent.startsWith('3.'), 'Heading swaps to "3. The line spectrum"');
  assert(apparatusSvg.style.display === 'none', 'Apparatus SVG is hidden after the transition swap');
  assert(resultSvg.classList.contains('visible'), 'Result SVG becomes visible after the transition swap');
  assert(!resultControls.hidden, 'Result controls (EM toggle) become visible after the swap');
  assert(transitionPanel.hidden, 'Transition panel stays hidden until a line is selected (one card at a time)');
  assert(navNext.style.display === 'none', 'Next is hidden on the result view');
  assert(!navBack.disabled, 'Back is enabled on the result view');

  const wavelengthButtons = doc.querySelectorAll('.wavelength-btn');
  assert(wavelengthButtons.length === 4, 'Result view renders 4 wavelength buttons for hydrogen');

  /* ---- selecting a line opens the side-by-side split view ---- */
  click(wavelengthButtons[0]);
  assert(!transitionPanel.hidden, 'Selecting a line opens the transition panel');
  assert(doc.getElementById('result-layout').classList.contains('split'), 'Selecting a line switches the layout to side-by-side split');
  assert(wavelengthButtons[0].classList.contains('active'), 'The selected wavelength button is marked active');
  assert(doc.getElementById('transition-panel-title').textContent.includes('n = 3'), 'Panel title names the n=3 -> n=2 transition for 656 nm');

  const energySvg = doc.getElementById('energy-svg');
  const atomSvg = doc.getElementById('atom-svg');
  assert(!energySvg.hasAttribute("hidden"), "Energy-level view is the default mode");
  assert(atomSvg.hasAttribute("hidden"), "Atomic view starts hidden");
  assert(energySvg.querySelectorAll('line').length === 6, 'Energy diagram draws 6 hydrogen levels (n=1..6)');
  assert(!!energySvg.querySelector('.js-electron'), 'An electron appears on the energy diagram');

  /* ---- switching line replays cleanly ---- */
  click(wavelengthButtons[1]);
  assert(energySvg.querySelectorAll('.js-electron').length === 1, 'Only one electron marker exists after switching lines');
  assert(!wavelengthButtons[0].classList.contains('active'), 'Previous wavelength button deactivates');
  assert(wavelengthButtons[1].classList.contains('active'), 'New wavelength button activates');
  assert(doc.getElementById('transition-panel-title').textContent.includes('n = 4'), 'Panel title updates to the n=4 transition');

  await wait(600);
  assert(!!energySvg.querySelector('.photon-squiggle'), 'A photon squiggle appears partway through the transition');

  /* ---- atomic view mode (NAAP-style Bohr orbits) ---- */
  click(doc.getElementById('mode-atom'));
  assert(energySvg.hasAttribute("hidden"), "Energy-level view hides in atom mode");
  assert(!atomSvg.hasAttribute("hidden"), "Atomic view shows in atom mode");
  assert(atomSvg.querySelectorAll('.atom-orbit').length === 6, 'Atomic view draws 6 Bohr orbits');
  assert(!!atomSvg.querySelector('.js-electron'), 'An electron appears in the atomic view');
  assert(energySvg.querySelectorAll('.js-electron').length === 0, 'Switching modes clears the electron from the other view');

  /* orbit radii follow r ~ n^2 (outermost 4x the n=3 orbit) */
  const radii = Array.from(atomSvg.querySelectorAll('.atom-orbit')).map((c) => Number(c.getAttribute('r')));
  radii.sort((a, b) => a - b);
  assert(Math.abs(radii[5] / radii[2] - 4) < 0.01, 'Orbit radii scale as n^2 (r6 = 4 x r3)');

  /* ---- mode toggle back ---- */
  click(doc.getElementById('mode-levels'));
  assert(!energySvg.hasAttribute("hidden") && atomSvg.hasAttribute("hidden"), "Toggling back restores the energy-level view");
  assert(!!energySvg.querySelector('.js-electron'), 'The transition replays in the energy-level view');

  /* ---- EM spectrum toggle: line spectrum sits UNDER the continuous bar ---- */
  const emToggle = doc.getElementById('em-toggle');
  const emRevealWrap = doc.getElementById('em-reveal-wrap');
  click(emToggle);
  assert(emRevealWrap.classList.contains('phase-visible'), 'EM toggle reveals the EM spectrum comparison');
  assert(doc.querySelectorAll('.em-band').length === 7, 'EM spectrum bar renders 7 bands');
  assert(doc.querySelectorAll('#em-bar .em-marker').length === 0, 'No line markers are overlaid on top of the continuous EM bar');
  assert(doc.querySelectorAll('#em-line-strip .em-marker').length === 4, 'The 4 hydrogen lines render in the strip below the EM bar');
  assert(
    doc.getElementById('em-line-strip-label').textContent.includes('Hydrogen'),
    'The line-strip label names the current source'
  );
  {
    const barWrap = doc.getElementById('em-bar-wrap');
    const strip = doc.getElementById('em-line-strip');
    const relation = barWrap.compareDocumentPosition(strip);
    assert(
      (relation & window.Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
      'The line-spectrum strip comes after (under) the continuous EM bar in the document'
    );
  }
  click(emToggle);
  assert(!emRevealWrap.classList.contains('phase-visible'), 'EM toggle hides it again');

  /* ---- Back: result -> setup clears the panel and split layout ---- */
  click(navBack);
  assert(apparatusSvg.style.display !== 'none', 'Back restores the apparatus SVG');
  assert(apparatusSvg.style.transform === '', 'Back clears the zoom transform from the apparatus');
  assert(transitionPanel.hidden, 'Back closes the transition panel');
  assert(!doc.getElementById('result-layout').classList.contains('split'), 'Back removes the side-by-side split layout');
  assert(doc.querySelectorAll('.js-electron').length === 0, 'Back clears any electron markers');
  assert(navBack.disabled, 'Back is disabled again on the setup view');

  /* ---- non-hydrogen gas: static labels, no panel ---- */
  const sourceChips = doc.querySelectorAll('.source-chip');
  const heChip = Array.from(sourceChips).find((el) => el.dataset.source === 'He');
  click(heChip);
  assert(doc.getElementById('source-symbol').textContent === 'He', 'Switching source updates symbol to He');
  click(navNext);
  await wait(900);
  const heButtons = doc.querySelectorAll('.wavelength-btn');
  assert(heButtons.length === 4, 'Helium result view shows 4 wavelength labels');
  assert(doc.querySelectorAll('.wavelength-btn--static').length === 4, 'Helium wavelength labels are static');
  click(heButtons[0]);
  assert(transitionPanel.hidden, 'Clicking a static label does not open the transition panel');

  /* ---- white light: rainbow, no buttons ---- */
  const whiteChip = Array.from(sourceChips).find((el) => el.dataset.source === 'WHITE');
  click(whiteChip);
  await wait(50);
  click(navNext);
  await wait(900);
  assert(doc.querySelectorAll('.wavelength-btn').length === 0, 'White light has no wavelength buttons');
  assert(!!doc.querySelector('#result-svg linearGradient'), 'White light renders a continuous rainbow gradient');

  /* ---- power off from the result view ---- */
  powerToggle.checked = false;
  powerToggle.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert(doc.getElementById('result-svg').textContent.includes('SOURCE OFF'), 'Result view shows SOURCE OFF when powered off');

  console.log(`\n${pass}/${pass + fail} passing`);
  if (fail > 0) {
    process.exitCode = 1;
  }
})();