// Wi-Fi link to the Raspberry Pi. The Pi is the decision engine; the phone just POSTs
// navigation data to it. One endpoint, POST http://<host>:<port>/nav, JSON body.
//
// ponytail: POST per event, not a WebSocket. Nav data changes over seconds and POST is
// stateless — no reconnect/heartbeat code to get wrong on flaky Wi-Fi. Add WS only if the
// Pi ever needs sub-second push.
import {Config, piUrl} from './config';
import type {LatLng, Route} from './routes';

export type NavStatus =
  | 'idle'
  | 'listening'
  | 'routing'
  | 'navigating'
  | 'arrived'
  | 'error';

export interface NavState {
  status: NavStatus;
  destination: string;
  origin: LatLng | null;
  current: (LatLng & {heading?: number; speed?: number}) | null;
  route: Route | null;
  currentStepIndex: number;
}

export interface NavPayload {
  type: 'route' | 'progress' | 'status';
  timestamp: number; // unix seconds
  status: NavStatus;
  destination: string;
  origin: LatLng | null;
  current: NavState['current'];
  route: {
    distanceMeters: number;
    durationSeconds: number;
    polyline: string;
    steps: Route['steps'];
  } | null;
  currentStepIndex: number;
  nextInstruction: string | null;
}

// Pure builder — unit-tested in __tests__/nav.test.ts.
export function buildNavPayload(
  type: NavPayload['type'],
  s: NavState,
  timestampSeconds: number,
): NavPayload {
  const step = s.route?.steps?.[s.currentStepIndex];
  return {
    type,
    timestamp: timestampSeconds,
    status: s.status,
    destination: s.destination,
    origin: s.origin,
    current: s.current,
    route: s.route
      ? {
          distanceMeters: s.route.distanceMeters,
          durationSeconds: s.route.durationSeconds,
          polyline: s.route.polyline,
          steps: s.route.steps,
        }
      : null,
    currentStepIndex: s.currentStepIndex,
    nextInstruction: step?.instruction ?? null,
  };
}

async function post(cfg: Config, body: unknown, timeoutMs = 4000): Promise<boolean> {
  if (!cfg.piHost) {
    return false;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(piUrl(cfg), {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function sendNav(cfg: Config, payload: NavPayload): Promise<boolean> {
  return post(cfg, payload);
}

// Settings "Test connection" button: POST a ping and report reachability.
export function testConnection(cfg: Config): Promise<boolean> {
  return post(cfg, {type: 'status', status: 'idle', ping: true});
}
