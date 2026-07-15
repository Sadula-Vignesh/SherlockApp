/**
 * Unit tests for the pure navigation logic — no native modules, no network.
 * These guard the parsing/measurement/payload code that turns a Google Routes API
 * response into what we stream to the Raspberry Pi.
 */

// config.ts imports AsyncStorage; stub it so importing piClient stays native-free.
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

import {
  distanceMeters,
  isArrived,
  nearestStepAhead,
  parseDuration,
  parseRoute,
} from '../src/routes';
import {buildNavPayload} from '../src/piClient';
import type {NavState} from '../src/piClient';

// A trimmed but realistic computeRoutes response (WALK).
const SAMPLE = {
  routes: [
    {
      distanceMeters: 320,
      duration: '240s',
      polyline: {encodedPolyline: 'abc123'},
      legs: [
        {
          steps: [
            {
              navigationInstruction: {maneuver: 'DEPART', instructions: 'Head north'},
              distanceMeters: 100,
              startLocation: {latLng: {latitude: 40.0, longitude: -73.0}},
              endLocation: {latLng: {latitude: 40.001, longitude: -73.0}},
            },
            {
              navigationInstruction: {maneuver: 'TURN_LEFT', instructions: 'Turn left onto 5th Ave'},
              distanceMeters: 220,
              startLocation: {latLng: {latitude: 40.001, longitude: -73.0}},
              endLocation: {latLng: {latitude: 40.001, longitude: -73.002}},
            },
          ],
        },
      ],
    },
  ],
};

describe('parseDuration', () => {
  test('parses "900s" style strings', () => {
    expect(parseDuration('900s')).toBe(900);
  });
  test('passes numbers through and defaults junk to 0', () => {
    expect(parseDuration(42)).toBe(42);
    expect(parseDuration(undefined)).toBe(0);
    expect(parseDuration('nope')).toBe(0);
  });
});

describe('parseRoute', () => {
  test('flattens legs/steps into ordered NavSteps', () => {
    const r = parseRoute(SAMPLE, 'Central Park');
    expect(r.destination).toBe('Central Park');
    expect(r.distanceMeters).toBe(320);
    expect(r.durationSeconds).toBe(240);
    expect(r.polyline).toBe('abc123');
    expect(r.steps).toHaveLength(2);
    expect(r.steps[0]).toMatchObject({
      index: 0,
      instruction: 'Head north',
      maneuver: 'DEPART',
      distanceMeters: 100,
    });
    expect(r.steps[1].index).toBe(1);
    expect(r.steps[1].instruction).toBe('Turn left onto 5th Ave');
    expect(r.steps[1].end).toEqual({lat: 40.001, lng: -73.002});
  });

  test('throws when there is no route', () => {
    expect(() => parseRoute({routes: []}, 'X')).toThrow(/no route/i);
  });
});

describe('distanceMeters', () => {
  test('~111 km per degree of latitude', () => {
    const d = distanceMeters({lat: 40, lng: -73}, {lat: 41, lng: -73});
    expect(d).toBeGreaterThan(110000);
    expect(d).toBeLessThan(112000);
  });
  test('zero for identical points', () => {
    expect(distanceMeters({lat: 1, lng: 2}, {lat: 1, lng: 2})).toBe(0);
  });
});

describe('nearestStepAhead / isArrived (the arrival-wedge fix)', () => {
  const route = parseRoute(SAMPLE, 'Central Park'); // step0 end (40.001,-73.0), step1 end (40.001,-73.002)

  test('tracks the nearest upcoming step end', () => {
    // Standing right at step 0's end -> current step is 0.
    expect(nearestStepAhead({lat: 40.001, lng: -73.0}, route.steps, 0)).toBe(0);
    // Near step 1's end -> advances to 1.
    expect(nearestStepAhead({lat: 40.001, lng: -73.002}, route.steps, 0)).toBe(1);
  });

  test('never moves backward from the given index', () => {
    // Even standing back at step 0's end, if we already reached step 1 we stay at 1.
    expect(nearestStepAhead({lat: 40.001, lng: -73.0}, route.steps, 1)).toBe(1);
  });

  test('overshooting a step end (>15 m past) still advances — no wedge', () => {
    // ~127 m past step 0's end and closer to step 1 (old code needed <15 m of step 0's
    // end to advance and would freeze here forever).
    const past = {lat: 40.001, lng: -73.0015};
    expect(nearestStepAhead(past, route.steps, 0)).toBe(1);
  });

  test('isArrived triggers only near the destination, and always for empty routes', () => {
    expect(isArrived({lat: 40.001, lng: -73.002}, route.steps, 20)).toBe(true); // at dest
    expect(isArrived({lat: 40.0, lng: -73.0}, route.steps, 20)).toBe(false); // far away
    expect(isArrived({lat: 1, lng: 1}, [], 20)).toBe(true); // degenerate route
  });
});

describe('buildNavPayload', () => {
  const route = parseRoute(SAMPLE, 'Central Park');
  const state: NavState = {
    status: 'navigating',
    destination: 'Central Park',
    origin: {lat: 40, lng: -73},
    current: {lat: 40.0005, lng: -73},
    route,
    currentStepIndex: 1,
  };

  test('emits the contract shape with the current step as nextInstruction', () => {
    const p = buildNavPayload('progress', state, 1721000000);
    expect(p.type).toBe('progress');
    expect(p.timestamp).toBe(1721000000);
    expect(p.status).toBe('navigating');
    expect(p.destination).toBe('Central Park');
    expect(p.currentStepIndex).toBe(1);
    expect(p.nextInstruction).toBe('Turn left onto 5th Ave');
    expect(p.route?.steps).toHaveLength(2);
    expect(p.route?.polyline).toBe('abc123');
  });

  test('null route yields null route + nextInstruction', () => {
    const p = buildNavPayload('status', {...state, route: null}, 1);
    expect(p.route).toBeNull();
    expect(p.nextInstruction).toBeNull();
  });
});
