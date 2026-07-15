// Speech-to-Text wrapper around react-native-speech-recognition-kit.
//
// The native module resolves startListening() with just a status string — the actual
// transcript arrives on the 'onSpeechResults' event as { value, results.transcriptions[] }.
// listenOnce() bridges that event model into a single Promise<string>.
//
// Loaded defensively (lazy require in try/catch): the kit builds a NativeEventEmitter at
// its module top level, so a missing native module would otherwise throw at import and
// white-screen the whole app.
import {PermissionsAndroid, Platform} from 'react-native';

let kit: any = null;
try {
  kit = require('react-native-speech-recognition-kit');
} catch {
  kit = null;
}

export function sttAvailable(): boolean {
  return !!kit;
}

export async function ensureMicPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }
  try {
    const r = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      {
        title: 'Microphone permission',
        message: 'Sherlock needs the microphone to hear your destination.',
        buttonPositive: 'OK',
      },
    );
    return r === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

function extractText(ev: any): string {
  if (!ev) {
    return '';
  }
  if (typeof ev === 'string') {
    return ev;
  }
  if (typeof ev.value === 'string' && ev.value.trim()) {
    return ev.value.trim();
  }
  const t = ev.results?.transcriptions?.[0]?.text;
  return typeof t === 'string' ? t.trim() : '';
}

export interface ListenResult {
  text: string;
  error?: string;
}

// Listen once and resolve with the best transcript (or an error string). Never rejects.
export function listenOnce(timeoutMs = 8000): Promise<ListenResult> {
  return new Promise(resolve => {
    if (!kit) {
      resolve({text: '', error: 'Speech recognition unavailable on this device'});
      return;
    }
    let done = false;
    const subs: Array<{remove?: () => void}> = [];
    const cleanup = () => subs.forEach(s => s?.remove?.());
    let timer: ReturnType<typeof setTimeout>;
    const finish = (r: ListenResult) => {
      if (done) {
        return;
      }
      done = true;
      clearTimeout(timer);
      cleanup();
      // Always tear down the native recognizer so it releases the mic before the caller
      // resumes the wake-word engine (they can't hold the mic at the same time).
      try {
        kit.stopListening();
      } catch {}
      resolve(r);
    };

    const E = kit.speechRecogntionEvents; // note: kit's own (misspelled) export name
    try {
      subs.push(
        kit.addEventListener(E.RESULTS, (ev: any) =>
          finish({text: extractText(ev)}),
        ),
      );
      subs.push(
        kit.addEventListener(E.ERROR, (ev: any) => {
          const msg =
            typeof ev === 'string' ? ev : ev?.message || 'Recognition error';
          finish({text: '', error: msg});
        }),
      );
    } catch {
      finish({text: '', error: 'Could not attach recognizer'});
      return;
    }

    timer = setTimeout(() => {
      finish({text: '', error: 'Timed out'});
    }, timeoutMs);

    // startListening can throw synchronously if the native module is partial; keep the
    // documented "never rejects" contract.
    try {
      Promise.resolve(kit.startListening()).catch((e: any) =>
        finish({text: '', error: e?.message || 'Could not start listening'}),
      );
    } catch (e: any) {
      finish({text: '', error: e?.message || 'Could not start listening'});
    }
  });
}

export function stopListening(): void {
  try {
    kit?.stopListening?.();
  } catch {}
}
