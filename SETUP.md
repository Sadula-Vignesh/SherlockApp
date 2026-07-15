# Sherlock Mobile App — Setup & Build Guide

The phone is the **voice + navigation controller** for the Sherlock assistive cane. It
listens for a spoken destination, gets a walking route from Google, and streams the
navigation data to the Raspberry Pi over Wi-Fi. The Pi (not the phone) fuses obstacle data
and speaks guidance through its own speaker.

Three things live **outside the code** and must be set on the app's **Settings** screen
before it works. This guide walks through each. None of them are committed to git.

---

## 1. Google Routes API key (required for routing)

Without this, no route can be computed.

1. Go to <https://console.cloud.google.com> and sign in.
2. Create a project (top bar → project dropdown → **New Project**).
3. **Billing → link a credit card** to the project. Required even though a single user
   stays inside the free tier (~10,000 route requests/month = $0 in practice).
4. **APIs & Services → Library → search "Routes API" → Enable.** (Only the Routes API is
   needed — the app sends the destination as text, so no Geocoding/Places API required.)
5. **APIs & Services → Credentials → Create credentials → API key.** Copy it.
6. Click the key → **API restrictions → Restrict key → select Routes API only → Save.**
   - ⚠️ Do **NOT** use the "Android apps" application restriction. The app calls the API
     over plain HTTPS (not the Maps SDK), so an Android-package restriction would **reject**
     every request. Restrict by **API**, not by app.
7. (Optional) Set a daily quota cap on the Routes API so a leaked key can't run up a bill.
8. Paste the key into the app: **Settings → Google Routes API key**.

## 2. Picovoice AccessKey (required for the hands-free wake word)

1. Go to <https://console.picovoice.ai>, create a free account.
2. Copy your **AccessKey** from the dashboard.
3. Paste it into the app: **Settings → Picovoice AccessKey**.

The wake word uses a **built-in** keyword (default **"Jarvis"**, changeable in Settings).
Built-in words run fully offline and **never expire**. (Custom words like "Sherlock" were
avoided on purpose: on Picovoice's free tier a custom model silently stops working after
~30 days.) If you leave the Picovoice key blank or turn the wake word off, the app still
works — the user just **taps anywhere on the Home screen** to start listening.

## 3. Raspberry Pi address

Set **Settings → Raspberry Pi IP** and **Port** to where the Pi server listens. The phone
and the Pi must be on the same Wi-Fi. Use **Test Pi connection** to confirm reachability.

---

## Testing the whole flow without a real Pi

A mock Pi server ships in `mock-pi/`. On any computer on the same Wi-Fi:

```sh
python3 mock-pi/server.py          # listens on 0.0.0.0:8000, POST /nav
```

Find that computer's LAN IP (`ipconfig getifaddr en0` on macOS, `hostname -I` on Linux),
put it + port `8000` in the app's Settings, tap **Test Pi connection**, then set a
destination. Every payload the app sends prints in the mock server's console.

---

## Building the release APK

Prerequisites: Node ≥ 22.11, **JDK 17** (17–21; **not** 24+ — the RN 0.86 native/CMake build
fails on JDK 24/25 with "A restricted method in java.lang.System has been called"), Android
SDK (licenses accepted), and `npm install` already run.

Point Gradle at JDK 17 without hardcoding a path in the repo — either set `JAVA_HOME`, or add
this line to your **user-global** `~/.gradle/gradle.properties` (not committed):

```
org.gradle.java.home=/path/to/jdk-17   # e.g. macOS Homebrew: /opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
```

Then build:

```sh
npm install
cd android
./gradlew assembleRelease
# APK at: android/app/build/outputs/apk/release/app-release.apk
```

Install on a phone: `adb install -r android/app/build/outputs/apk/release/app-release.apk`

> The debug build signs with the default debug key. For a real distributable release APK you
> should generate an upload/signing key and set `android/gradle.properties` +
> `android/app/build.gradle` signing config (standard React Native release signing). Until
> then `assembleRelease` produces an APK signed with the debug key — fine for side-loading
> onto a test device.

---

## What needs a real device / real hardware (can't be checked on a laptop)

- **Live routing** needs your Google key (the route parser is unit-tested; the live call is
  a first-run check on your device).
- **Speech recognition** needs a device with Google's speech services (most real Android
  phones; many emulators lack it). Grant the **microphone** permission on first use.
- **Spoken app confirmations** ("Listening", "Route found") are announced through the
  Android screen reader (**TalkBack**), so turn TalkBack on for the blind user — it also
  reads the large status text automatically. (Actual navigation guidance comes from the
  Pi's speaker regardless.)
- **GPS** needs a real location fix outdoors; grant the **location** permission.
- **The real Pi** must implement the contract below.

---

## Raspberry Pi contract (for whoever builds the Pi side)

The app sends `POST http://<pi-ip>:<port>/nav`, `Content-Type: application/json`. Reply
`200` with any body (e.g. `{"ok": true}`). Payload:

```json
{
  "type": "route | progress | status",
  "timestamp": 1721000000,
  "status": "idle | listening | routing | navigating | arrived | error",
  "destination": "Central Park, New York",
  "origin":  { "lat": 40.767, "lng": -73.981 },
  "current": { "lat": 40.767, "lng": -73.981, "heading": 90, "speed": 1.2 },
  "route": {
    "distanceMeters": 1234,
    "durationSeconds": 900,
    "polyline": "<encoded polyline>",
    "steps": [
      {
        "index": 0,
        "instruction": "Turn left toward Frontage Rd",
        "maneuver": "TURN_LEFT",
        "distanceMeters": 50,
        "start": { "lat": 40.767, "lng": -73.981 },
        "end":   { "lat": 40.768, "lng": -73.981 }
      }
    ]
  },
  "currentStepIndex": 2,
  "nextInstruction": "Turn right onto 5th Ave"
}
```

- `type: "route"` is sent once when a route is found (full `route`).
- `type: "progress"` is sent on each GPS update while navigating (`current`,
  `currentStepIndex`, `nextInstruction` advance).
- `type: "status"` is sent on state changes (arrived, stopped, connection test — a test ping
  also includes `"ping": true`).
