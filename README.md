# Pocket Pickle

A silly little gimmick app, like the old lightsaber apps but for pickleball. Your phone is the paddle: the screen is the paddle face, and the handle runs off the bottom edge into your hand. Swing it, and the paddle goes *pop*. Swing harder for a louder, crisper pop. Wobble through a swing and you'll catch the edge with a *clack*. The ball smacks the face, the face flashes and kicks, and the phone buzzes. That's it.

Everything runs locally: no cloud builds, tunnels, or uploads. The Expo launcher (`scripts/expo-local.mjs`) disables telemetry and VCS checks and keeps Expo's child processes away from git.

## Play

Start the phone server from this directory:

    npm start -- --port 8088

On your phone, open Expo Go (SDK 57) on the same Wi-Fi as this computer and scan the QR code Expo prints. Grip the bottom of the phone, allow motion access if asked, and swing. The paddle is live whenever the app is open. Hold on tight and give yourself room.

The ••• button has the paddle face, sound, and swing sensitivity (plus "put the paddle down" in the browser). Those settings are remembered on the device.

### Rally with a friend

Off unless someone turns it on: ••• → **Find a friend nearby** on both phones, then tap the other phone's name. Whoever taps serves. Swing to hit the ball to the other phone; it grows on their screen, bounces (listen for it), and they have to swing back in time. Swinging when there's no ball makes no sound, like a real paddle. Catching the edge sends the ball out. The point winner serves next.

The phones talk directly: same Wi-Fi on both platforms, or no Wi-Fi at all between two iPhones (Apple's peer-to-peer Wi-Fi). Nothing goes through a server. Rally mode needs a native build; it's hidden in Expo Go and the browser.

### Pocket Pickle Pro

A one-time in-app purchase (`com.pocketpickle.app.pro`, a non-consumable) unlocks six silly designs (Pickle Pal, Dill With It, Kitty, Purrkle, Toe Beans, and Pickle Party), the Wood, Carbon, and Thock sounds, the Gold, Carbon, Ice, and Sunset colors, and your own photo on the paddle. The designs are vector art in `src/Designs.tsx`. Locked sounds still play a preview. Purchases go through the App Store and are verified by [RevenueCat](https://www.revenuecat.com) (`react-native-purchases`): project "Pocket Pickle", entitlement `pocket_pickle_pro`, and the default offering's Lifetime package. Development builds use RevenueCat's Test Store, which simulates purchases, and also have an "unlock without paying" switch on the Pro page.

Desktop preview (browsers need a tap on **Grab the paddle** first; there's no motion sensor, so the keyboard stands in: Space pops, Shift+Space hits hard, E catches the edge):

    npm run web -- --port 8088

After copying this directory elsewhere, run `npm ci` to restore its locked dependencies.

## How it works

- **Sounds** are synthesized by `scripts/generate_sounds.py`, tuned to measurements of real pickleball contacts: a ~1.1 kHz "pock," a bright click, and a ~15 ms decay. There are soft, medium, and hard pops (three variants each, never the same twice in a row), two edge clacks, three Pro paddle packs, and the court bounce and dead ball used in rallies. See [sound-source/README.md](sound-source/README.md).
- **Rally** rules live in `src/rally.ts` (pure, tested). Each ball is judged only by the phone it's flying toward, so the phones never disagree about a point; they measure network delay and take it off the ball's flight. The connection is a small local Expo module, `modules/pickle-link` (Network.framework on iOS, Network Service Discovery and sockets on Android).
- **Swings** are detected mostly from the gyro (`src/motion.ts`), so a wrist flick counts. The pop fires right at peak swing speed, the moment a real paddle would meet the ball. Handling, slow turns, glitchy frames, and follow-through don't pop.
- **Audio:** one mixer (`src/mixer.ts`) plays everything. In a local development build it uses `react-native-audio-api` for the lowest delay; Expo Go falls back to expo-audio automatically; the browser uses Web Audio.
- With the system Reduce Motion setting on, the face doesn't shake or flash.

No account, microphone, camera, or analytics. The only outside service is RevenueCat, used only for the Pro purchase: it sees an anonymous customer ID and the purchase history. Your settings and paddle photo stay on the phone. The photo is copied into the app's private storage; the app never reads the rest of your library. Solo play works offline.

## Checks

    npm test
    npm run typecheck
    npm run export

To regenerate the sounds: `python3 scripts/generate_sounds.py` (needs numpy and scipy).

## Native builds

For the low-latency audio engine, rally mode, and Pro, build locally instead of using Expo Go. This needs Xcode or Android Studio:

    npm run ios
    npm run android

On iOS, CocoaPods needs a UTF-8 locale: if `pod install` crashes with a Unicode error, run it with `LANG=en_US.UTF-8`.

The `react-native-audio-api` plugin in app.json turns off background audio, the Android foreground service, and FFmpeg. The image picker plugin turns off camera and microphone access. `plugins/with-scene-lifecycle.cjs` switches the iOS app to the scene life cycle, which iOS 27 requires (without it the app stops at launch).

In the iOS Simulator (no motion sensor), development builds swing when you tap the paddle, so you can rally between two simulators.

Before publishing:

- The bundle ID and Android package are `com.pocketpickle.app` (app.json), and the Pro product is `com.pocketpickle.app.pro` in App Store Connect ($2.99). They can't change once published.
- For Android, add a Google Play app and the same product to the RevenueCat project, then add its `goog_` SDK key in `src/usePro.ts`.
- Test purchases with a sandbox account and rallies on real phones.
