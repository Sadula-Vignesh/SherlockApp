// Spoken app confirmations ("Listening", "Route found", errors) for accessibility.
//
// Uses the BUILT-IN AccessibilityInfo.announceForAccessibility — no native TTS dependency.
// It routes the message to the active screen reader (TalkBack on Android), which a blind
// user runs, and which also reads the accessibilityLiveRegion status text. Actual
// navigation guidance is spoken by the Raspberry Pi's own speaker, per the spec.
import {AccessibilityInfo} from 'react-native';

let enabled = true;

export function setTtsEnabled(v: boolean): void {
  enabled = v;
}

export function speak(message: string): void {
  if (!enabled || !message) {
    return;
  }
  try {
    AccessibilityInfo.announceForAccessibility(message);
  } catch {}
}
