// App configuration: all external, deployment-specific values live here and are
// persisted with AsyncStorage. Nothing is hardcoded/committed — the user fills these
// in on the Settings screen. See SETUP.md.
import AsyncStorage from '@react-native-async-storage/async-storage';

// Picovoice built-in wake words (never expire, run offline). The user picks one.
export const WAKE_WORDS = [
  'jarvis',
  'computer',
  'bumblebee',
  'porcupine',
  'terminator',
  'alexa',
  'grasshopper',
  'blueberry',
  'americano',
  'grapefruit',
  'picovoice',
] as const;
export type WakeWord = (typeof WAKE_WORDS)[number];

export interface Config {
  googleApiKey: string; // Google Routes API key (billing enabled)
  piHost: string; // Raspberry Pi LAN IP, e.g. "192.168.1.50"
  piPort: string; // Raspberry Pi port, e.g. "8000"
  picovoiceKey: string; // Picovoice AccessKey (console.picovoice.ai)
  wakeWord: WakeWord; // which built-in word triggers listening
  wakeWordEnabled: boolean; // hands-free listening on/off
  ttsFeedback: boolean; // speak app confirmations (accessibility)
}

export const DEFAULT_CONFIG: Config = {
  googleApiKey: '',
  piHost: '',
  piPort: '8000',
  picovoiceKey: '',
  wakeWord: 'jarvis',
  wakeWordEnabled: true,
  ttsFeedback: true,
};

const STORAGE_KEY = 'sherlock.config.v1';

export async function loadConfig(): Promise<Config> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {...DEFAULT_CONFIG};
    }
    // Merge over defaults so a new field added later can't leave config undefined.
    return {...DEFAULT_CONFIG, ...JSON.parse(raw)};
  } catch {
    return {...DEFAULT_CONFIG};
  }
}

export async function saveConfig(cfg: Config): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

export function piUrl(cfg: Config, path = '/nav'): string {
  // Tolerate a host pasted with a scheme or trailing slash (e.g. "http://192.168.1.5/").
  const host = cfg.piHost.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  const port = (cfg.piPort || '8000').trim();
  return `http://${host}:${port}${path}`;
}

export function configReady(cfg: Config): {ok: boolean; missing: string[]} {
  const missing: string[] = [];
  if (!cfg.googleApiKey) {
    missing.push('Google API key');
  }
  if (!cfg.piHost) {
    missing.push('Raspberry Pi IP');
  }
  if (cfg.wakeWordEnabled && !cfg.picovoiceKey) {
    missing.push('Picovoice key (for wake word)');
  }
  return {ok: missing.length === 0, missing};
}
