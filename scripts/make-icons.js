// Renders the brand mark into the source images @capacitor/assets expects (assets/).
// Run: node scripts/make-icons.js && npx capacitor-assets generate
const sharp = require('sharp');
const path = require('path');
const root = path.join(__dirname, '..');
const mark = (f) => path.join(root, 'brand', f);
const out = (f) => path.join(root, 'assets', f);

async function flat(svg, size, bg, scale, file) {
  const m = await sharp(svg, { density: 600 }).resize({ width: Math.round(size * scale) }).png().toBuffer();
  const img = sharp({ create: { width: size, height: size, channels: 4, background: bg } })
    .composite([{ input: m, gravity: 'centre' }]);
  await img.png().toFile(out(file));
}

(async () => {
  const white = { r: 255, g: 255, b: 255, alpha: 1 };
  const paper = { r: 246, g: 249, b: 255, alpha: 1 }; // #F6F9FF
  const ink = { r: 8, g: 34, b: 74, alpha: 1 };       // #08224A
  const clear = { r: 0, g: 0, b: 0, alpha: 0 };
  await flat(mark('mark.svg'), 1024, white, 0.62, 'icon-only.png');
  await flat(mark('mark.svg'), 1024, clear, 0.5, 'icon-foreground.png');
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: white } }).png().toFile(out('icon-background.png'));
  // Splash: the stacked logo (flask over CHEMCULATOR) from the brand kit, centred.
  const stacked = (f) => path.join(root, '..', 'branding', 'svg', f);
  await flat(stacked('logo-stacked.svg'), 2732, paper, 0.55, 'splash.png');
  await flat(stacked('logo-stacked-dark.svg'), 2732, ink, 0.55, 'splash-dark.png');
  console.log('assets/ written');
})();
