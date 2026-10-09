# Chemculator mobile app (Capacitor)

The app bundles the whole suite, with the hub as its home screen. The web folders stay the source of truth;
`npm run build:www` copies them into `www/` and turns the links to the website into local ones:

| In the app | Source folder |
|---|---|
| Home (suite hub) and `yieldcalculator/` | `../azlanyaacob92.github.io` |
| `chemulator/` (Emission Spectra, Titration) | this folder |
| `concentrationtrainer/` | `../concentrationtrainer` |
| `orbitalvisualiser/` | `../orbitalvisualiser` |
| `stoichiomathics/` | `../Stoichiomathics` |

Edit those folders as usual, never `www/`, `android/app/src/main/assets/public/` or `ios/App/App/public/`.
A new suite needs adding to `SOURCES` in `scripts/build-www.js` as well as to the hub's `apps.json`.

## Everyday workflow

```bash
npm run android     # build www, sync, open Android Studio  (then press Run)
npm run ios         # build www, sync, open Xcode           (Mac only)
npm run cap:sync    # just rebuild www and sync to both platforms
```

## Android setup (Windows)

- Android Studio is installed. The SDK is in `C:\Users\Azlan\AndroidSdk` (`android/local.properties` points to it).
- Gradle must run on **Java 21** (Gradle 8.14 cannot read Java 25, which is what Android Studio bundles).
  In Android Studio: Settings > Build Tools > Gradle > Gradle JDK = `C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot`.
- Plug in the tablet with USB debugging on, pick it in the device list and press Run.

### Make an installable APK (free, no store needed)

Android Studio: **Build > Build Bundle(s) / APK(s) > Build APK(s)**. The debug APK is in
`android/app/build/outputs/apk/debug/`. Send it to anyone; they enable "install unknown apps" and open it.

## Publishing

| Store | Cost | Needs |
|---|---|---|
| Google Play | US$25, one time | Signed **AAB** (Build > Generate Signed Bundle), keep the keystore safe |
| Apple App Store | US$99 / year | A Mac with Xcode, an Apple Developer account |

Before publishing, change `appId` in `capacitor.config.json` (currently `com.azlan.chemculator`) to the
final one. It cannot be changed after release. Bump `versionCode` / `versionName` in
`android/app/build.gradle` for each update.

## Icons and splash screens

Source images are in `assets/`, rendered from `brand/*.svg` (launcher icon) and `../branding/svg/logo-stacked*.svg`
(splash screen, light and dark). On Android 12+ the system splash is a blank background in the same colour
(`res/values/splash_colors.xml`), then the stacked logo appears.

```bash
node scripts/make-icons.js
npx capacitor-assets generate --iconBackgroundColor '#ffffff' --iconBackgroundColorDark '#0f1420' --splashBackgroundColor '#F6F9FF' --splashBackgroundColorDark '#08224A'
rm -rf icons   # unused PWA output
```
