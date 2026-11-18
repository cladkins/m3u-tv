# M3U TV for Vega OS

A Fire TV client for [M3U Editor](https://github.com/m3ue/m3u-editor), built for Amazon Vega OS (the Linux-based OS on newer Fire TV Sticks). Vega doesn't run Flutter or Android apps, so this is a separate React Native for Vega app. It talks to the same M3U Editor API as the Flutter client in `flutter_client/`.

## Features

- Sign in by pairing with a code (approve it from your phone) or with username and password
- Live TV by category, with now/next guide info on every row
- A 3-hour guide grid you can page through
- Movies and series grids by category, detail pages, and a season and episode picker
- Continue Watching, synced through your M3U Editor viewer
- Favorites for channels, movies and series, synced to the server (hold Select or press Menu to toggle)
- Search across channels, movies and series
- Viewer switching in Settings
- Player:
  - Streams are requested through M3U Editor's In-App Player profile, and the app follows the editor's redirect to see what comes back
  - HLS plays through Shaka Player; MPEG-TS feeds, movies and episodes play through the platform's native URL mode
  - Resume, ±10 s seek, and ±30 s skip with the remote's skip keys
  - Up/Down or Channel keys change channel during live playback

Features of the Flutter app that this version doesn't have yet: DVR, multiview, sports, requests, AIOStreams, Trakt, catchup, multiple saved playlists, subtitle/audio track selection, and the non-English translations.

## Requirements

- Ubuntu x86_64 or macOS. The Vega SDK doesn't support Windows.
- Node.js 22.14 or later.
- [Vega SDK](https://developer.amazon.com/docs/vega/2.0/install-vega-sdk). Run each command in order:

  ```bash
  curl -fsSL https://sdk-installer.vega.labcollab.net/get_vvm.sh | bash
  ```

  ```bash
  source ~/vega/env
  ```

- To build Shaka Player during `npm install`: git, python3, Java 21+, curl. On macOS, `brew install openjdk@21` is enough; the setup script finds it.
- An M3U Editor server with Enhanced output turned on (Settings → General).

## Setup

```bash
cd vega_client
```

```bash
npm install
```

`npm install` runs `scripts/setup-shaka.sh`. The script:

1. Downloads Amazon's Vega patches for Shaka Player 4.8.5 and checks the checksum.
2. Builds Shaka with those patches.
3. Copies the build and Amazon's W3C media polyfills into `src/vendor/shaka/`.

That folder is gitignored because Amazon licenses the polyfills separately from this GPL project. The first run takes a few minutes. To rebuild, run `npm run setup:shaka`. To skip the step, set `M3UTV_SKIP_SHAKA=1`; you can still type-check and test, but you can't build the app.

## Build and run

Build the package:

```bash
npm run build:release
```

Builds land in `build/<arch>-release/`:

- `x86_64`: the Vega Virtual Device on Linux or Intel Macs
- `aarch64`: the Virtual Device on Apple Silicon
- `armv7`: Fire TV Stick hardware and Appstore uploads

### Virtual Device

```bash
npm run vvd:start
```

On Linux or an Intel Mac:

```bash
npm run vvd:run
```

On Apple Silicon:

```bash
npm run vvd:run:arm
```

### Fire TV Stick

Only sticks that run Vega OS work (Settings → My Fire TV → About shows the OS). Fire OS sticks use the Android build.

1. On the stick, open Settings → My Fire TV → About and press Select on the device name 7 times.
2. Open Developer Options → Developer Mode, choose Continue, and note the code on screen.
3. On your computer, sign in with your Amazon developer account:

   ```bash
   vega devmode login
   ```

4. Enable the device with the code from step 2. The stick reboots:

   ```bash
   vega devmode enable-device --code <code>
   ```

5. On the stick, set Developer Options → Connection Mode to TCP/IP, and look up its address under My Fire TV → About → Network.
6. Connect. The computer and the stick must be able to reach each other, which hotel and guest Wi-Fi usually block; a phone hotspot works:

   ```bash
   vega exec vda connect <ip>:5555
   ```

7. Find the device id. It is the first column, for example `192.168.1.50:5555`:

   ```bash
   vega device list
   ```

8. Install and launch:

   ```bash
   vega device install-app --packagePath build/armv7-release/m3utv-vega_armv7.vpkg -d <device-id>
   ```

   ```bash
   vega device launch-app --appName dev.sparkison.tv.main -d <device-id>
   ```

To stream the system log:

```bash
vega device start-log-stream --device <device-id>
```

### Debugging

Release builds have no JavaScript console, and an uncaught error closes the app. For app logs, use the debug build with Metro:

```bash
npm run build:debug
```

```bash
npm start
```

In a second terminal, forward Metro's port and run the debug package (`aarch64` on Apple Silicon, `x86_64` otherwise):

```bash
vega device start-port-forwarding --device VirtualDevice -p 8081 --forward false
```

```bash
vega run-app build/aarch64-debug/m3utv-vega_aarch64.vpkg dev.sparkison.tv.main -d VirtualDevice
```

Press `j` in the Metro terminal to open DevTools. The app's own messages start with `M3UTV`.

## Checks

```bash
npm run typecheck
```

```bash
npm test
```

## Layout

| Path | What it holds |
| --- | --- |
| `manifest.toml` | Vega package manifest: package id `dev.sparkison.tv`, component `dev.sparkison.tv.main`, media and input services |
| `src/api` | Xtream / M3U Editor client, device pairing, response types |
| `src/services` | Catalog cache, EPG store, AsyncStorage helpers |
| `src/state/AppContext.tsx` | Session, categories, viewers, favorites, progress reporting |
| `src/navigation/Router.tsx` | Tab plus stack router, global Back handling, focus restore |
| `src/player/VideoEngine.ts` | W3C media `VideoPlayer` with Shaka for HLS, URL mode for files |
| `src/screens` | Home, Live TV, Guide, Movies, Series, details, Search, Settings, Login, Player |
| `src/i18n/strings.ts` | Every user-visible string |

## Notes

- The layout uses 1920×1080 design pixels and scales them with `s()` in `src/theme`, because Vega lays out React Native 0.83 on a 960×540 dp canvas.
- The player is released when the app goes to the background, as Amazon's certification requires.
- Credentials are stored in AsyncStorage (the app's private storage, not encrypted).
- Keep the `@amazon-devices/*` version ranges in `package.json` as Amazon documents them (`~2.1.0` for AsyncStorage, for example). The SDK matches the written range against its own compatibility table and skips linking a library's native half when the range names a patch it doesn't know. The symptom is `NativeModule: AsyncStorage is null`; the build log shows `Skipping module lineage` and a `needs:` list without the library.
- The Virtual Device decodes fewer formats than Fire TV hardware. Channels with Dolby AC-3 audio don't start there but play on a stick.
- The package id matches the Android app (`dev.sparkison.tv`), so the Vega build can ship as a separate release track on the existing Appstore listing.
