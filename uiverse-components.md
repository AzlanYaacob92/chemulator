# uiverse-components.md

`uiverse-components.css` adapts Uiverse.io components (MIT, from github.com/uiverse-io/galaxy) to Lavender + Willow. Everything is scoped under `body.emission` and uses tokens only. Load it after `design-system.css` and `styles.css`.

**No markup changes are required.** Every block targets existing classes and ids. The only optional markup is the `data-uv-tip` attribute for tooltips.

## Picks

| Need | Component | Author | URL |
|---|---|---|---|
| Power switch | "simple, small, switcher" | @catraco | https://uiverse.io/catraco/soft-falcon-9 |
| Source tiles | radio/select tray | @Yaya12085 | https://uiverse.io/Yaya12085/rude-mouse-79 |
| Two-way toggle | sliding-highlight tabs | @Admin12121 | https://uiverse.io/Admin12121/cold-bobcat-20 |
| Buttons | slide-fill outline button | @Juanes200122 | https://uiverse.io/Juanes200122/smart-skunk-68 |
| Tooltip (optional) | tooltip | @G4b413l | https://uiverse.io/G4b413l/dry-turtle-84 |
| Scrollbar (optional) | none; standard `scrollbar-width` / `scrollbar-color` | n/a | n/a |

### Why each was chosen

- **Switch (catraco).** It is a plain input, track and knob, which maps onto `.light-switch` as it already stands. The knob is a disc ringed in the track colour (4px border), which looks calm and tactile. It also needs no JS and no extra elements. Off is a neutral muted track and on is willow, so the green stays reserved for "on". Off and on differ by knob side and by the label, so colour is not the only cue.
- **Source tiles (Yaya12085).** Only the idea is taken: options sit in a recessed tray and the chosen one is raised. The tray is `--bg-tint` and the selected tile gets `--card`, a 2px `--primary` ring and a corner check badge. The badge is drawn with borders and has no text, so screen readers ignore it. The existing `.sig-card` flip and hover behaviour is untouched.
- **Segmented toggle (Admin12121).** I kept its sliding thumb but dropped the `mix-blend-mode: difference` and the spring `linear()` easing. They looked gimmicky and break contrast. The thumb is a `::before` that moves via `:has(.view-mode-btn + .view-mode-btn.active)`. Where `:has()` is unsupported it falls back to the filled-active style. Active is also marked by a 1px `--primary` border and semibold text.
- **Buttons (Juanes200122).** It is the calmest of about 30 simple button candidates. I replaced the hover colour inversion with a wipe that never changes the text colour, so contrast holds throughout. The wipe uses `clip-path` rather than `overflow: hidden`, which keeps `::before` free for tooltips.
- **Tooltip (G4b413l).** I replaced the child `<div>` with `attr()` on `::before` and used an inverted token pair, `--ink-2` on `--card`. It also opens on keyboard focus.

### Rejected

- **Switches.** Cksunandh (neumorphic inset shadows) uses hex shadows, has no "on" cue and clashes with the lavender-tinted shadow rule. Galahhad and G4b413l bitter-hound pair a red or green knob with a hard-coded blue or green track, which is colour-only. andrew-demchenk0 tiny-fish is a hard-offset neo-brutalist shadow. anonithrax is a flat material toggle with square corners and a plain blue track.
- **Segmented control.** Admin12121 as published uses `mix-blend-mode: difference` and a red focus outline. andrew-demchenk0 stupid-seahorse has a hard black offset shadow and a fixed pixel width. Pradeepsaranbishnoi big-swan is a dial gimmick. shadowmurphy "worm" is an animated hopping dot and uses the heavy bold weight.
- **Buttons.** Melo034 (Tailwind-only markup with a rotating circle fill), RenouxM (a 3D press button sized for a hero), Dear31 (black border plus a hard shadow) and Rodrypaladin (an offset shadow slide). They either need heavy markup or clash with the soft shape language.
- **Tooltips.** Most use arrows plus translucent greys that fail AA. Several use SVG or keyframes.

## Where it applies

- **Power switch.** The block restyles `.light-switch`, `.light-switch-track` and `.light-switch-knob`. The existing native `<input type="checkbox" id="power-toggle">` and the `Power on/off` label are unchanged.
- **Source tiles.** It targets `.source-picker .sig-card`, with the selected state on `.active` or `[aria-pressed="true"]`, which `app.js` already sets through `buildSourceTile`.
- **Two-way toggle.** It targets `.view-mode-toggle` with `#mode-levels` and `#mode-atom`. JS only needs to keep toggling `.active`.
- **EM compare button.** It targets `.em-toggle-btn`, and `.active` is the open state.
- **Back/Next buttons.** `.stage-nav-btn` and `.stage-nav-btn-primary` are not in the current `index.html`; the layout pass removed them. The block is self-contained (it includes its base styles) in case they return.
- **Scrollbar.** The slim scrollbar applies to `body.emission` and `.workspace`.

## Optional tooltip markup

```html
<button type="button" id="em-toggle" class="em-toggle-btn"
        data-uv-tip="Overlay the visible lines on the full EM spectrum">...</button>
```

Do not put `data-uv-tip` on `.sig-card` tiles, because they clip overflow in flip mode. Use it on a wrapper element instead. The tooltip is supplementary, so keep the same information in an `aria-label` or visible text.

## Contrast

Measured with the real tokens, light / dark:

| Pair | Light | Dark |
|---|---|---|
| Off knob on off track | 7.13 | 6.91 |
| On knob on on track | 6.11 | 10.48 |
| Primary button text on `--primary` / `--primary-hover` | 5.48 / 7.46 | 6.41 / 9.05 |
| Secondary button text on `--card` / `--primary-soft` (wipe) | 7.46 / 5.91 | 11.24 / 9.78 |
| Inactive segment text on tray | 6.47 | 6.91 |
| Active segment text on thumb | 5.91 | 9.78 |
| Tile symbol and name on `--primary-soft` | 5.91 | 9.78 |
| Tooltip text on `--ink-2` | 11.71 | 11.24 |
| Focus ring and selection border (`--primary` on `--card`) | 5.48 | 6.35 |
| Scrollbar thumb on `--bg` | 3.49 | 4.25 |

All text pairs pass 4.5:1. The pairs below 4.5:1 are non-text only:

- Outline borders (`--line-strong` on `--card`) are 1.72 light and 1.47 dark. This is the design system's own choice for button and segmented outlines. The text and the active state carry the meaning, so the border is not the sole cue. If you want 3:1 on boundaries, switch the border to `--faint`, which is 3.49 on white.
- The scrollbar thumb is 3.49 in light mode, which is above 3:1 for a UI component.

The saturation budget is respected. The only saturated fills are the optional Next button and the small selected-tile ring. The switch uses willow, but only while on.

## Verification

I used a throwaway test page that links the three CSS files with realistic markup. I checked it at the keyboard in the in-app browser. Focus on the switch computed to `rgba(122,82,196,.38) 0 0 0 3px`, and I confirmed the dark-mode focus ring visually. I confirmed the light and dark states by screenshot, and the server on port 9137 is stopped.
