// Central navigation controller (React Context). Orchestrates the whole flow the spec
// describes: wake word / tap -> listen -> speech-to-text -> Google walking route ->
// POST route to the Raspberry Pi -> watch GPS -> advance steps + POST progress -> arrived.
//
// The phone does NOT speak navigation guidance (the Pi does). Phone TTS is only used for
// short app confirmations so a blind user knows what's happening.
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {PermissionsAndroid, Platform} from 'react-native';

import {
  Config,
  DEFAULT_CONFIG,
  configReady,
  loadConfig,
} from './config';
import {
  LatLng,
  Route,
  computeWalkingRoute,
  isArrived,
  nearestStepAhead,
} from './routes';
import {
  NavState,
  NavStatus,
  buildNavPayload,
  sendNav,
  testConnection,
} from './piClient';
import {ensureMicPermission, listenOnce} from './stt';
import {setTtsEnabled, speak} from './tts';
import {
  pauseWakeWord,
  resumeWakeWord,
  startWakeWord,
  stopWakeWord,
  wakeWordSupported,
} from './wakeWord';

let Geolocation: any = null;
try {
  const m = require('@react-native-community/geolocation');
  Geolocation = m?.default ?? m;
} catch {
  Geolocation = null;
}

// How close (metres) to the destination before we announce arrival.
const ARRIVE_M = 20;

type Position = LatLng & {heading?: number; speed?: number};

export interface NavContextValue {
  config: Config;
  status: NavStatus;
  statusText: string;
  destination: string;
  route: Route | null;
  currentStepIndex: number;
  position: Position | null;
  piOk: boolean | null;
  lastError: string;
  wakeInfo: string;
  beginVoiceInput: () => void;
  stopNavigation: () => void;
  reloadConfig: () => Promise<void>;
  testPi: () => Promise<boolean>;
}

const NavContext = createContext<NavContextValue | null>(null);

const nowSec = () => Math.floor(Date.now() / 1000);

export const NavProvider: React.FC<{children: React.ReactNode}> = ({children}) => {
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
  const [status, setStatus] = useState<NavStatus>('idle');
  const [statusText, setStatusText] = useState('Starting…');
  const [destination, setDestination] = useState('');
  const [route, setRoute] = useState<Route | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [position, setPosition] = useState<Position | null>(null);
  const [piOk, setPiOk] = useState<boolean | null>(null);
  const [lastError, setLastError] = useState('');
  const [wakeInfo, setWakeInfo] = useState('');

  // Refs mirror state for the async callbacks (wake word, watchPosition) that need the
  // latest values without re-subscribing.
  const cfgRef = useRef<Config>(DEFAULT_CONFIG);
  const statusRef = useRef<NavStatus>('idle');
  const destRef = useRef('');
  const originRef = useRef<LatLng | null>(null);
  const posRef = useRef<Position | null>(null);
  const routeRef = useRef<Route | null>(null);
  const stepRef = useRef(0);
  const watchIdRef = useRef<number | null>(null);
  const busyRef = useRef(false);

  const setStat = useCallback((s: NavStatus, text: string) => {
    statusRef.current = s;
    setStatus(s);
    setStatusText(text);
    if (s !== 'error') {
      setLastError('');
    }
  }, []);

  const setError = useCallback((msg: string) => {
    statusRef.current = 'error';
    setStatus('error');
    setStatusText(msg);
    setLastError(msg);
  }, []);

  const updateDestination = useCallback((d: string) => {
    destRef.current = d;
    setDestination(d);
  }, []);

  const snapshot = useCallback((st: NavStatus): NavState => {
    return {
      status: st,
      destination: destRef.current,
      origin: originRef.current,
      current: posRef.current,
      route: routeRef.current,
      currentStepIndex: stepRef.current,
    };
  }, []);

  const clearWatch = useCallback(() => {
    if (watchIdRef.current != null && Geolocation) {
      try {
        Geolocation.clearWatch(watchIdRef.current);
      } catch {}
      watchIdRef.current = null;
    }
  }, []);

  const ensureLocationPermission = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== 'android') {
      return true;
    }
    try {
      const r = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
      ]);
      return (
        r[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === 'granted'
      );
    } catch {
      return false;
    }
  }, []);

  const getPosition = useCallback((): Promise<Position> => {
    return new Promise((resolve, reject) => {
      if (!Geolocation) {
        reject(new Error('Location unavailable on this device'));
        return;
      }
      Geolocation.getCurrentPosition(
        (p: any) =>
          resolve({
            lat: p.coords.latitude,
            lng: p.coords.longitude,
            heading: p.coords.heading ?? undefined,
            speed: p.coords.speed ?? undefined,
          }),
        (e: any) => reject(new Error(e?.message || 'Could not get location')),
        {enableHighAccuracy: true, timeout: 15000, maximumAge: 10000},
      );
    });
  }, []);

  const onPosition = useCallback(
    async (p: any) => {
      const cur: Position = {
        lat: p.coords.latitude,
        lng: p.coords.longitude,
        heading: p.coords.heading ?? undefined,
        speed: p.coords.speed ?? undefined,
      };
      posRef.current = cur;
      setPosition(cur);

      const r = routeRef.current;
      if (!r || statusRef.current !== 'navigating' || r.steps.length === 0) {
        return;
      }

      // Track the current step as the nearest step-end still ahead of us (never backward).
      const best = nearestStepAhead(cur, r.steps, stepRef.current);
      if (best !== stepRef.current) {
        stepRef.current = best;
        setCurrentStepIndex(best);
      }

      // Arrival is judged by proximity to the destination, independent of step tracking —
      // so a single missed step can never prevent arrival.
      if (isArrived(cur, r.steps, ARRIVE_M)) {
        setStat('arrived', 'You have arrived');
        speak('You have arrived at your destination');
        clearWatch();
        await sendNav(cfgRef.current, buildNavPayload('status', snapshot('arrived'), nowSec()));
        return;
      }

      const ok = await sendNav(
        cfgRef.current,
        buildNavPayload('progress', snapshot('navigating'), nowSec()),
      );
      setPiOk(ok);
    },
    [clearWatch, setStat, snapshot],
  );

  const startWatch = useCallback(() => {
    if (!Geolocation) {
      return;
    }
    clearWatch();
    watchIdRef.current = Geolocation.watchPosition(
      onPosition,
      (e: any) => console.warn('watchPosition error', e?.message ?? e),
      {enableHighAccuracy: true, distanceFilter: 5, interval: 2000, fastestInterval: 1000},
    );
  }, [clearWatch, onPosition]);

  const beginVoiceInput = useCallback(async () => {
    if (busyRef.current) {
      return;
    }
    busyRef.current = true;
    // If a route is already running, a failed voice attempt (e.g. a false wake-word) must
    // NOT cancel it — restore the running state instead of dropping to idle.
    const wasNavigating = statusRef.current === 'navigating';
    let didPause = false;

    const giveUp = (spoken?: string) => {
      if (wasNavigating) {
        setStat('navigating', `Navigating to ${destRef.current}`);
      } else {
        setStat('idle', readyText(cfgRef.current));
      }
      if (spoken) {
        speak(spoken);
      }
    };

    try {
      const cfg = cfgRef.current;
      setTtsEnabled(cfg.ttsFeedback);

      const micOk = await ensureMicPermission();
      if (!micOk) {
        giveUp('Microphone permission is needed to hear your destination');
        return;
      }

      // Free the mic from the wake-word engine before STT (mic contention).
      await pauseWakeWord();
      didPause = true;

      setStat('listening', 'Listening… say your destination');
      speak('Listening');
      const heard = await listenOnce();
      if (!heard.text) {
        giveUp(heard.error ? `Sorry, ${heard.error}` : "I didn't catch that");
        return;
      }
      const spokenDest = heard.text;

      setStat('routing', `Finding walking route to ${spokenDest}`);
      speak(`Finding route to ${spokenDest}`);

      const locOk = await ensureLocationPermission();
      if (!locOk) {
        giveUp('Location permission is needed to find a route');
        return;
      }
      const origin = await getPosition();
      originRef.current = origin;
      posRef.current = origin;
      setPosition(origin);

      const r = await computeWalkingRoute(origin, spokenDest, cfg.googleApiKey);
      // Route succeeded — commit the new destination (kept until now so a failed attempt
      // leaves any prior destination/route intact).
      updateDestination(spokenDest);
      routeRef.current = r;
      setRoute(r);
      stepRef.current = 0;
      setCurrentStepIndex(0);

      if (r.steps.length === 0) {
        // Degenerate route (origin ≈ destination): arrive immediately, don't hang.
        clearWatch();
        setStat('arrived', 'You are already there');
        speak('You are already at your destination');
        await sendNav(cfg, buildNavPayload('status', snapshot('arrived'), nowSec()));
        return;
      }

      setStat(
        'navigating',
        `Route found (${r.steps.length} steps). Guidance plays on your cane.`,
      );
      speak('Route found. Guidance will play through your cane.');

      const ok = await sendNav(cfg, buildNavPayload('route', snapshot('navigating'), nowSec()));
      setPiOk(ok);
      if (!ok) {
        speak('Warning: could not reach the cane. Check the Pi connection in settings.');
      }

      startWatch(); // clears any previous watch and starts tracking the new route
    } catch (e: any) {
      const msg = e?.message || 'Something went wrong';
      if (wasNavigating) {
        // Keep the previously-running route (its watch was never cleared); just report.
        setStat('navigating', `Navigating to ${destRef.current}`);
        speak(`Sorry, ${msg}`);
      } else {
        clearWatch();
        setError(msg);
        speak(`Sorry, ${msg}`);
      }
    } finally {
      // Resume hands-free listening only if we actually paused it, and before releasing
      // the lock, so a new session can't start STT while Porcupine is mid-restart.
      if (didPause) {
        await resumeWakeWord();
      }
      busyRef.current = false;
    }
  }, [
    clearWatch,
    ensureLocationPermission,
    getPosition,
    setError,
    setStat,
    snapshot,
    startWatch,
    updateDestination,
  ]);

  const stopNavigation = useCallback(async () => {
    clearWatch();
    routeRef.current = null;
    setRoute(null);
    stepRef.current = 0;
    setCurrentStepIndex(0);
    setStat('idle', readyText(cfgRef.current));
    speak('Navigation stopped');
    await sendNav(cfgRef.current, buildNavPayload('status', snapshot('idle'), nowSec()));
  }, [clearWatch, setStat, snapshot]);

  const applyWakeWord = useCallback(
    async (cfg: Config) => {
      await stopWakeWord();
      if (!cfg.wakeWordEnabled) {
        setWakeInfo('Wake word off — tap the screen to start');
        return;
      }
      if (!wakeWordSupported()) {
        setWakeInfo('Wake word unavailable on this device — tap to start');
        return;
      }
      if (!cfg.picovoiceKey) {
        setWakeInfo('Add a Picovoice key in Settings to enable the wake word');
        return;
      }
      const micOk = await ensureMicPermission();
      if (!micOk) {
        setWakeInfo('Wake word off: microphone permission denied');
        return;
      }
      const res = await startWakeWord(cfg.picovoiceKey, cfg.wakeWord, () => {
        beginVoiceInput();
      });
      setWakeInfo(
        res.ok
          ? `Listening for "${cfg.wakeWord}" — or tap to start`
          : `Wake word off: ${res.error}`,
      );
    },
    [beginVoiceInput],
  );

  const reloadConfig = useCallback(async () => {
    const cfg = await loadConfig();
    cfgRef.current = cfg;
    setConfig(cfg);
    setTtsEnabled(cfg.ttsFeedback);
    if (statusRef.current === 'idle' || statusRef.current === 'error') {
      setStat('idle', readyText(cfg));
    }
    await applyWakeWord(cfg);
  }, [applyWakeWord, setStat]);

  const testPi = useCallback(() => testConnection(cfgRef.current), []);

  useEffect(() => {
    try {
      Geolocation?.setRNConfiguration?.({
        skipPermissionRequests: true,
        authorizationLevel: 'whenInUse',
        locationProvider: 'auto',
      });
    } catch {}
    reloadConfig();
    return () => {
      clearWatch();
      stopWakeWord();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value: NavContextValue = {
    config,
    status,
    statusText,
    destination,
    route,
    currentStepIndex,
    position,
    piOk,
    lastError,
    wakeInfo,
    beginVoiceInput,
    stopNavigation,
    reloadConfig,
    testPi,
  };

  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
};

function readyText(cfg: Config): string {
  const {ok, missing} = configReady(cfg);
  if (!ok) {
    return `Add in Settings: ${missing.join(', ')}`;
  }
  if (cfg.wakeWordEnabled && cfg.picovoiceKey) {
    return `Say "${cfg.wakeWord}" or tap anywhere to start`;
  }
  return 'Tap anywhere to start';
}

export function useNav(): NavContextValue {
  const c = useContext(NavContext);
  if (!c) {
    throw new Error('useNav must be used within a NavProvider');
  }
  return c;
}
