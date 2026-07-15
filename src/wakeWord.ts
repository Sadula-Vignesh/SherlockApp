// Hands-free wake word via Picovoice Porcupine, using a BUILT-IN keyword (offline, never
// expires — unlike free custom words, which silently expire ~30 days).
//
// Mic contention: Porcupine owns the mic while listening, and Android STT needs exclusive
// mic access, so the caller MUST pause() the wake word before running STT and resume()
// after. The navController does exactly that.
//
// Loaded defensively so a missing native module degrades to "wake word unavailable"
// rather than crashing.
let PV: any = null;
try {
  PV = require('@picovoice/porcupine-react-native');
} catch {
  PV = null;
}

let manager: any = null;
let running = false;

export function wakeWordSupported(): boolean {
  return !!PV;
}

export interface StartResult {
  ok: boolean;
  error?: string;
}

export async function startWakeWord(
  accessKey: string,
  keyword: string,
  onDetected: () => void,
): Promise<StartResult> {
  if (!PV) {
    return {ok: false, error: 'Wake word module unavailable'};
  }
  if (!accessKey) {
    return {ok: false, error: 'Missing Picovoice key'};
  }
  await stopWakeWord();
  try {
    const kw =
      PV.BuiltInKeywords[keyword.toUpperCase()] ?? PV.BuiltInKeywords.JARVIS;
    manager = await PV.PorcupineManager.fromBuiltInKeywords(
      accessKey,
      [kw],
      () => onDetected(),
      (err: any) => console.warn('Porcupine error', err?.message ?? err),
    );
    await manager.start();
    running = true;
    return {ok: true};
  } catch (e: any) {
    manager = null;
    running = false;
    return {ok: false, error: e?.message || String(e)};
  }
}

export async function stopWakeWord(): Promise<void> {
  running = false;
  if (manager) {
    try {
      await manager.stop();
      manager.delete();
    } catch {}
    manager = null;
  }
}

// Free the mic for STT without tearing down the engine.
export async function pauseWakeWord(): Promise<void> {
  if (manager && running) {
    try {
      await manager.stop();
    } catch {}
  }
}

export async function resumeWakeWord(): Promise<void> {
  if (manager && running) {
    try {
      await manager.start();
    } catch {}
  }
}
