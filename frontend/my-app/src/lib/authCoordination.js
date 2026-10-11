// Web Locks order server mutations. Storage is a journal, never a homemade lock;
// BroadcastChannel/storage events are hints to reread that journal, never authority.
const STATE_KEY = 'auth-coordination-v1';
const LOCK_NAME = 'learning-w-llms-auth';
const CANCELLED = 'Authentication request cancelled';
const UNCONFIRMED = 'Signed out locally, but server session revocation could not be confirmed. Please retry logout before signing in.';
const UNSUPPORTED = 'Safe authentication requires Web Locks and persistent browser storage. Please use a supported browser with storage enabled.';

export function createAuthCoordinator(environment = window) {
  const listeners = new Set();
  let cancelled = 0;
  let logoutFlight = null;
  let channel;
  let storage;
  try { storage = environment.localStorage; } catch (_) { /* Denied storage fails closed below. */ }
  const revision = () => environment.crypto.randomUUID
    ? environment.crypto.randomUUID()
    : Array.from(environment.crypto.getRandomValues(new Uint32Array(4))).join('-');
  const read = () => {
    if (!storage) throw new Error(UNSUPPORTED);
    const saved = storage.getItem(STATE_KEY);
    if (saved) return JSON.parse(saved);
    return { revision: 'legacy', accessToken: storage.getItem('accessToken'), user: null, revocation: null };
  };
  const generation = () => {
    try { return `${cancelled}:${read().revision}`; }
    catch (_) { return `${cancelled}:unavailable`; }
  };
  const sync = () => {
    let state;
    try { state = read(); }
    catch (_) { listeners.forEach(listener => listener(null, null)); return; }
    // Never trust an old event payload; events may arrive after a newer login.
    if (state.accessToken) storage.setItem('accessToken', state.accessToken);
    else storage.removeItem('accessToken');
    listeners.forEach(listener => listener(state.accessToken, state.user));
  };
  const write = state => {
    storage.setItem(STATE_KEY, JSON.stringify(state));
    sync();
    try { channel?.postMessage('changed'); } catch (_) { /* Storage events remain available. */ }
  };
  const locked = callback => {
    if (!environment.navigator?.locks?.request) return Promise.reject(new Error(UNSUPPORTED));
    // Fail closed before a network mutation if the durable journal is unavailable.
    try {
      read();
    } catch (_) { return Promise.reject(new Error(UNSUPPORTED)); }
    return environment.navigator.locks.request(LOCK_NAME, { mode: 'exclusive' }, () => {
      try { storage.setItem(STATE_KEY, JSON.stringify(read())); }
      catch (_) { throw new Error(UNSUPPORTED); }
      return callback();
    });
  };
  try {
    if (environment.BroadcastChannel) {
      channel = new environment.BroadcastChannel(LOCK_NAME);
      channel.onmessage = sync;
    }
  } catch (_) { /* Storage events provide the fallback notification path. */ }
  const onStorage = event => {
    if (event.key === STATE_KEY || event.key === 'accessToken' || event.key === null) sync();
  };
  environment.addEventListener('storage', onStorage);
  environment.addEventListener('focus', sync);
  environment.addEventListener('pageshow', sync);

  return {
    generation,
    getAccessToken: () => {
      try { return read().accessToken; } catch (_) { return null; }
    },
    subscribe(listener) {
      listeners.add(listener);
      sync();
      return () => listeners.delete(listener);
    },
    setAccessToken(token) { write({ ...read(), accessToken: token }); },
    removeAccessToken(expectedGeneration) {
      if (expectedGeneration !== undefined) return locked(() => {
        if (expectedGeneration !== generation()) return false;
        this.removeAccessToken();
        return true;
      });
      cancelled += 1;
      write({ ...read(), revision: revision(), accessToken: null, user: null });
    },
    async waitForLogout(revoke) {
      if (logoutFlight) await logoutFlight;
      else if (read().revocation?.status === 'failed') await this.logout(revoke);
      return generation();
    },
    authenticate(request, revoke) {
      return locked(async () => {
        const marker = read().revocation;
        if (marker) {
          // A pending journal entry while we hold the lock belongs to a dead
          // context. Recover it with a confirmed retry, never by timing it out.
          if (marker.status !== 'pending' || !revoke) throw new Error(UNCONFIRMED);
          try {
            await revoke(marker.accessToken, true);
            write({ ...read(), revocation: null });
          } catch (_) {
            write({ ...read(), revocation: { ...marker, status: 'failed' } });
            throw new Error(UNCONFIRMED);
          }
        }
        const observed = generation();
        const data = await request();
        if (observed !== generation()) throw new Error(CANCELLED);
        write({ ...read(), revision: revision(), accessToken: data.accessToken, user: data.user, revocation: null });
        return data;
      });
    },
    logout(revoke) {
      if (logoutFlight) return logoutFlight;
      // Cancel this tab's work immediately. Shared clearing happens under the lock.
      cancelled += 1;
      listeners.forEach(listener => listener(null, null));
      if (!environment.navigator?.locks?.request) {
        const state = read();
        write({ ...state, revision: revision(), accessToken: null, user: null,
          revocation: state.revocation || { status: 'failed', accessToken: state.accessToken } });
        return Promise.reject(new Error(UNSUPPORTED));
      }
      const flight = locked(async () => {
        const state = read();
        const previous = state.revocation;
        const token = previous ? previous.accessToken : state.accessToken;
        const marker = { status: 'pending', accessToken: token };
        write({ ...state, revision: revision(), accessToken: null, user: null, revocation: marker });
        try {
          // Retry the same Bearer version, requiring an authenticated receipt.
          // Anonymous 200s (including expired Bearers) cannot clear this barrier.
          await revoke(token, Boolean(previous));
          write({ ...read(), revocation: null });
        } catch (_) {
          write({ ...read(), revocation: { ...marker, status: 'failed' } });
          throw new Error(UNCONFIRMED);
        }
      });
      logoutFlight = flight.finally(() => { logoutFlight = null; });
      return logoutFlight;
    },
    async refresh(request) {
      if (!environment.navigator?.locks?.request) throw new Error(UNSUPPORTED);
      if (logoutFlight || read().revocation) throw new Error(CANCELLED);
      const observed = generation();
      const data = await request();
      return locked(() => {
        if (observed !== generation() || read().revocation) throw new Error(CANCELLED);
        write({ ...read(), accessToken: data.accessToken });
        return data;
      });
    },
    close() {
      channel?.close();
      environment.removeEventListener('storage', onStorage);
      environment.removeEventListener('focus', sync);
      environment.removeEventListener('pageshow', sync);
    },
  };
}
