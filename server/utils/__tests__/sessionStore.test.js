const path = require('path');

describe('sessionStore', () => {
  const ORIGINAL_ENV = process.env;
  const BASE_TIME = new Date('2024-01-01T00:00:00.000Z');

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    jest.useRealTimers();
    process.env = ORIGINAL_ENV;
  });

  function loadSessionStore(env = {}, initialTime = BASE_TIME) {
    Object.assign(process.env, env);
    jest.setSystemTime(initialTime);
    return require(path.join('..', 'sessionStore'));
  }

  test('creates sessions with consistent timestamps and updates last activity', () => {
    const store = loadSessionStore({
      SESSION_TTL_MINUTES: '15',
      SESSION_MAX_HISTORY: '10',
      SESSION_MAX_SESSIONS: '5',
    });

    const session = store.ensureSession('abc');
    expect(session.id).toBe('abc');
    expect(session.createdAt).toBe(session.updatedAt);

    const initialUpdatedAt = session.updatedAt;
    jest.advanceTimersByTime(60 * 1000);

    const refreshed = store.ensureSession('abc');
    expect(refreshed).toBe(session);
    expect(refreshed.updatedAt).toBeGreaterThan(initialUpdatedAt);
  });

  test('normalizes appended entries and trims history beyond the limit', () => {
    const store = loadSessionStore({
      SESSION_TTL_MINUTES: '10',
      SESSION_MAX_HISTORY: '3',
      SESSION_MAX_SESSIONS: '5',
    });

    store.appendEntry('story', 'host', '  Hello world  ');
    let history = store.getHistory('story');
    expect(history).toHaveLength(1);
    expect(history[0]).toEqual(expect.objectContaining({
      speaker: 'host',
      text: 'Hello world',
    }));

    store.appendEntry('story', 'host', 42);
    store.appendEntry('story', 'guest', 'Third entry');
    store.appendEntry('story', 'guest', 'Fourth entry');

    history = store.getHistory('story');
    expect(history).toHaveLength(3);
    expect(history.map((entry) => entry.text)).toEqual([
      '42',
      'Third entry',
      'Fourth entry',
    ]);
  });

  test('removes stale sessions when TTL is exceeded', () => {
    const store = loadSessionStore({
      SESSION_TTL_MINUTES: '1',
      SESSION_MAX_HISTORY: '5',
      SESSION_MAX_SESSIONS: '5',
    });

    store.ensureSession('stale');
    jest.advanceTimersByTime(61 * 1000);

    store.ensureSession('fresh');
    expect(store.getActiveSessionCount()).toBe(1);
  });

  test('evicts the oldest active sessions when exceeding the configured maximum', () => {
    const store = loadSessionStore({
      SESSION_TTL_MINUTES: '60',
      SESSION_MAX_HISTORY: '5',
      SESSION_MAX_SESSIONS: '2',
    });

    const first = store.ensureSession('first');
    jest.advanceTimersByTime(10);
    const second = store.ensureSession('second');
    jest.advanceTimersByTime(10);
    store.ensureSession('third');

    expect(store.getActiveSessionCount()).toBe(2);

    const secondAfter = store.ensureSession('second');
    expect(secondAfter.createdAt).toBe(second.createdAt);

    jest.advanceTimersByTime(10);
    const resurrectedFirst = store.ensureSession('first');
    expect(resurrectedFirst.createdAt).toBeGreaterThan(first.createdAt);
  });
});
