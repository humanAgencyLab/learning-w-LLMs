import { createAuthCoordinator } from './authCoordination';
jest.mock('../components/ui/toast', () => ({ toastBus: { publish: jest.fn() } }));

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const flush = async () => { for (let i = 0; i < 25; i += 1) await Promise.resolve(); };
const token = version => `header.${btoa(JSON.stringify({ exp: 4102444800, authVersion: version }))}.signature`;
const credentials = version => ({ accessToken: token(version), user: { _id: 'account', name: `version-${version}` } });

// Independent event loops/modules/storage facades share only the browser primitives.
// Notifications can be deliberately withheld; ordering must still be correct.
function browser({ broadcasts = true, locks = true } = {}) {
  const data = new Map(); const tabs = []; const messages = []; const queue = [];
  let held; let nextRevision = 0;
  const pump = () => {
    if (held || !queue.length) return;
    const job = queue.shift(); held = job;
    Promise.resolve().then(job.callback).then(job.resolve, job.reject).finally(() => {
      if (held === job) { held = null; pump(); }
    });
  };
  const open = () => {
    const listeners = new Map(); let closed = false;
    const tab = {
      get closed() { return closed; },
      localStorage: {
        getItem: key => { if (closed) throw new Error('Context destroyed'); return data.get(key) ?? null; },
        setItem: (key, value) => {
          if (closed) throw new Error('Context destroyed');
          if (data.get(key) === value) return;
          data.set(key, value);
          tabs.filter(other => other !== tab).forEach(other => messages.push(() => other.dispatch('storage', { key, newValue: value })));
        },
        removeItem: key => {
          if (closed) throw new Error('Context destroyed');
          if (!data.has(key)) return;
          data.delete(key);
          tabs.filter(other => other !== tab).forEach(other => messages.push(() => other.dispatch('storage', { key, newValue: null })));
        },
      },
      navigator: locks ? { locks: { request: (_name, options, callback) => {
        expect(options).toEqual({ mode: 'exclusive' });
        return new Promise((resolve, reject) => { queue.push({ tab, callback, resolve, reject }); pump(); });
      } } } : {},
      crypto: { randomUUID: () => `revision-${++nextRevision}` }, atob,
      addEventListener: (name, listener) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(listener); },
      removeEventListener: (name, listener) => listeners.get(name)?.delete(listener),
      dispatch: (name, event) => { if (!closed) listeners.get(name)?.forEach(listener => listener(event)); },
      close: () => {
        closed = true;
        if (held?.tab === tab) { held = null; pump(); }
      },
    };
    if (broadcasts) tab.BroadcastChannel = class {
      constructor() { tab.channel = this; }
      postMessage() { tabs.filter(other => other !== tab).forEach(other => messages.push(() => { if (!other.closed) other.channel?.onmessage?.(); })); }
      close() { this.onmessage = null; }
    };
    tabs.push(tab);
    return { tab, auth: createAuthCoordinator(tab) };
  };
  return {
    open, data,
    deliver: () => { while (messages.length) messages.shift()(); },
    discard: () => { messages.length = 0; },
  };
}

test('two tabs serialize logout/login even when every notification is delayed', async () => {
  const browserState = browser(); const a = browserState.open(); const b = browserState.open();
  await a.auth.authenticate(async () => credentials(0));
  const pending = deferred(); const entered = deferred(); let serverVersion = 0;
  const logout = a.auth.logout(async () => { entered.resolve(); await pending.promise; serverVersion += 1; });
  await entered.promise;
  const loginRequest = jest.fn(async () => credentials(serverVersion));
  const login = b.auth.authenticate(loginRequest);
  await flush(); expect(loginRequest).not.toHaveBeenCalled();
  pending.resolve(); await Promise.all([logout, login]);
  expect(serverVersion).toBe(1); expect(b.auth.getAccessToken()).toBe(token(1));
  // Deliver old clear notifications after login: both tabs reread the new state.
  const states = []; a.auth.subscribe((accessToken, user) => states.push({ accessToken, user }));
  browserState.deliver();
  expect(states.at(-1)).toEqual(credentials(1));
  expect(browserState.data.get('accessToken')).toBe(token(1));
});

test.each([true, false])('shared authentication state synchronizes with BroadcastChannel=%s', async broadcasts => {
  const shared = browser({ broadcasts }); const a = shared.open(); const b = shared.open();
  const state = { user: null, accessToken: null, isAuthenticated: false };
  b.auth.subscribe((accessToken, user) => Object.assign(state, { accessToken, user, isAuthenticated: Boolean(accessToken && user) }));
  await a.auth.authenticate(async () => credentials(0)); shared.deliver();
  expect(state).toEqual({ ...credentials(0), isAuthenticated: true });
  await a.auth.refresh(async () => ({ accessToken: 'refreshed' })); shared.deliver();
  expect(state.accessToken).toBe(shared.data.get('accessToken'));
  await a.auth.logout(async () => {}); shared.deliver();
  expect(state).toEqual({ user: null, accessToken: null, isAuthenticated: false });
});

test('failed server revocation blocks another tab until an explicit retry succeeds', async () => {
  const shared = browser(); const a = shared.open(); const b = shared.open();
  await a.auth.authenticate(async () => credentials(0));
  const pending = deferred(); const entered = deferred();
  const logout = a.auth.logout(async () => { entered.resolve(); await pending.promise; throw new Error('network'); }).catch(error => error);
  await entered.promise;
  const loginRequest = jest.fn(); const login = b.auth.authenticate(loginRequest).catch(error => error);
  pending.resolve(); expect((await logout).message).toContain('could not be confirmed');
  expect((await login).message).toContain('could not be confirmed'); expect(loginRequest).not.toHaveBeenCalled();
  const revoke = jest.fn(async () => {}); await b.auth.waitForLogout(revoke);
  expect(revoke).toHaveBeenCalledWith(token(0), true);
  await b.auth.authenticate(async () => credentials(1));
  expect(b.auth.getAccessToken()).toBe(token(1));
});

test.each([true, false])('delayed refresh success=%s cannot overwrite a cross-tab logout and newer login without notifications', async success => {
  const shared = browser(); const a = shared.open(); const b = shared.open();
  await a.auth.authenticate(async () => credentials(0));
  const pending = deferred();
  const refresh = a.auth.refresh(async () => {
    await pending.promise;
    if (!success) throw new Error('refresh failed');
    return { accessToken: 'revoked-refresh' };
  }).catch(error => error);
  await b.auth.logout(async () => {});
  await b.auth.authenticate(async () => credentials(1));
  pending.resolve(); expect(await refresh).toBeInstanceOf(Error);
  expect(a.auth.getAccessToken()).toBe(token(1)); expect(b.auth.getAccessToken()).toBe(token(1));
});

test('closing the logout tab releases its lock but leaves a durable barrier for recovery', async () => {
  const shared = browser(); const a = shared.open(); const b = shared.open();
  await a.auth.authenticate(async () => credentials(0));
  const entered = deferred(); const neverReturns = deferred();
  a.auth.logout(async () => { entered.resolve(); await neverReturns.promise; }).catch(() => {});
  await entered.promise; a.auth.close(); a.tab.close();
  const loginRequest = jest.fn();
  await expect(b.auth.authenticate(loginRequest)).rejects.toThrow('could not be confirmed');
  expect(loginRequest).not.toHaveBeenCalled();
  const retry = jest.fn(async () => {}); await b.auth.logout(retry);
  expect(retry).toHaveBeenCalledWith(token(0), true);
  await b.auth.authenticate(async () => credentials(1));
  expect(b.auth.getAccessToken()).toBe(token(1));
});

test('missing Web Locks fails closed for credential issuance and explicitly reports local-only logout', async () => {
  const shared = browser({ locks: false }); const a = shared.open(); const request = jest.fn();
  a.auth.setAccessToken(token(0));
  await expect(a.auth.authenticate(request)).rejects.toThrow('Web Locks');
  await expect(a.auth.refresh(request)).rejects.toThrow('Web Locks');
  await expect(a.auth.logout(request)).rejects.toThrow('Web Locks');
  expect(request).not.toHaveBeenCalled(); expect(a.auth.getAccessToken()).toBeNull();
});

test('unavailable durable storage fails before a server mutation', async () => {
  const shared = browser(); const a = shared.open(); const request = jest.fn();
  a.tab.localStorage.setItem = () => { throw new Error('Quota exceeded'); };
  await expect(a.auth.authenticate(request)).rejects.toThrow('storage'); expect(request).not.toHaveBeenCalled();
});

function application(tab) {
  let api; let store;
  jest.isolateModules(() => {
    jest.doMock('./authCoordination', () => ({ createAuthCoordinator: () => createAuthCoordinator(tab) }));
    jest.doMock('zustand/middleware', () => {
      const actual = jest.requireActual('zustand/middleware');
      return { ...actual, persist: (initializer, options) => actual.persist(initializer, {
        ...options, storage: actual.createJSONStorage(() => tab.localStorage),
      }) };
    });
    api = require('./authApi');
    store = require('../state/authStore').default;
  });
  jest.dontMock('./authCoordination'); jest.dontMock('zustand/middleware');
  return { api, store };
}
const response = (body, status = 200) => ({ ok: status < 400, status, headers: { get: () => 'application/json' }, json: async () => body });

test('independent API/Zustand contexts synchronize and serialize server logout before a newer login', async () => {
  const shared = browser(); const first = shared.open(); const second = shared.open();
  const a = application(first.tab); const b = application(second.tab);
  global.fetch = jest.fn(async () => response({ data: credentials(0) }));
  await a.store.getState().login({ username: 'account', password: 'password' }); shared.deliver();
  expect(b.store.getState().isAuthenticated).toBe(true);
  const pending = deferred(); const entered = deferred(); let serverVersion = 0;
  fetch.mockImplementation(url => {
    if (url.endsWith('/logout')) { entered.resolve(); return pending.promise.then(() => { serverVersion += 1; return response({ success: true, data: { revocationConfirmed: true } }); }); }
    return Promise.resolve(response({ data: credentials(serverVersion) }));
  });
  const logout = a.store.getState().logout(); await entered.promise;
  const login = b.store.getState().login({ username: 'account', password: 'password' });
  await flush(); expect(fetch.mock.calls.filter(([url]) => url.endsWith('/login'))).toHaveLength(1);
  pending.resolve(); await Promise.all([logout, login]); shared.deliver();
  for (const context of [a, b]) {
    expect(context.api.getAccessToken()).toBe(token(1));
    expect(context.store.getState()).toMatchObject({ ...credentials(1), isAuthenticated: true });
  }
  expect(JSON.parse(shared.data.get('auth-storage')).state).toMatchObject({ ...credentials(1), isAuthenticated: true });
  expect(shared.data.get('accessToken')).toBe(token(1));
});

test.each([200, 401])('delayed refresh HTTP %s cannot clear or restore a newer cross-tab login in Zustand', async status => {
  const shared = browser(); const first = shared.open(); const second = shared.open();
  const a = application(first.tab); const b = application(second.tab);
  global.fetch = jest.fn(async () => response({ data: credentials(0) }));
  await a.store.getState().login({ username: 'account', password: 'password' }); shared.deliver();
  const pending = deferred();
  fetch.mockImplementation(url => url.endsWith('/refresh') ? pending.promise : Promise.resolve(
    url.endsWith('/logout') ? response({ success: true, data: { revocationConfirmed: true } }) : response({ data: credentials(1) })
  ));
  const refresh = a.store.getState().refreshToken().catch(error => error);
  await b.store.getState().logout();
  await b.store.getState().login({ username: 'account', password: 'password' });
  pending.resolve(response({ data: { accessToken: 'revoked-refresh' }, error: 'expired' }, status));
  expect((await refresh).message).toBe('Authentication request cancelled'); shared.deliver();
  for (const context of [a, b]) expect(context.store.getState()).toMatchObject({ ...credentials(1), isAuthenticated: true });
  expect(shared.data.get('accessToken')).toBe(token(1));
});


test('conditional failure cleanup waits for the lock and cannot erase a newer tab login', async () => {
  const shared = browser(); const a = shared.open(); const b = shared.open();
  await a.auth.authenticate(async () => credentials(0));
  const observed = a.auth.generation();
  const pending = deferred(); const entered = deferred();
  const login = b.auth.authenticate(async () => { entered.resolve(); await pending.promise; return credentials(1); });
  await entered.promise;
  const clear = a.auth.removeAccessToken(observed);
  pending.resolve(); await login;
  expect(await clear).toBe(false); expect(a.auth.getAccessToken()).toBe(token(1));
});


test.each([undefined, false])('anonymous retry HTTP 200 with confirmation=%s keeps every tab blocked', async confirmation => {
  const shared = browser(); const first = shared.open(); const second = shared.open();
  const a = application(first.tab); const b = application(second.tab);
  global.fetch = jest.fn(async () => response({ data: credentials(0) }));
  await a.api.login({ username: 'account', password: 'password' });
  fetch.mockResolvedValue(response({ success: false }, 500));
  await expect(a.api.logout()).rejects.toThrow('could not be confirmed');
  fetch.mockResolvedValue(response({ success: true, data: { revocationConfirmed: confirmation } }));
  await expect(b.api.login({ username: 'account', password: 'password' })).rejects.toThrow('could not be confirmed');
  expect(fetch.mock.calls.filter(([url]) => url.endsWith('/login'))).toHaveLength(1);
  expect(JSON.parse(fetch.mock.calls.at(-1)[1].body)).toEqual({ confirmRevocation: true });
  expect(a.api.getAccessToken()).toBeNull(); expect(b.api.getAccessToken()).toBeNull();
});


test('the surviving API context recovers an orphan logout before sending login', async () => {
  const shared = browser(); const first = shared.open(); const second = shared.open();
  const a = application(first.tab); const b = application(second.tab);
  global.fetch = jest.fn(async () => response({ data: credentials(0) }));
  await a.api.login({ username: 'account', password: 'password' });
  const entered = deferred(); const oldResponse = deferred();
  fetch.mockImplementation(() => { entered.resolve(); return oldResponse.promise; });
  a.api.logout().catch(() => {}); await entered.promise; first.auth.close(); first.tab.close();
  fetch.mockImplementation(url => Promise.resolve(url.endsWith('/logout')
    ? response({ success: true, data: { revocationConfirmed: true } })
    : response({ data: credentials(1) })));
  await b.store.getState().login({ username: 'account', password: 'password' });
  expect(fetch.mock.calls.map(([url]) => url.split('/').pop())).toEqual(['login', 'logout', 'logout', 'login']);
  expect(JSON.parse(fetch.mock.calls[2][1].body)).toEqual({ confirmRevocation: true });
  expect(b.store.getState().accessToken).toBe(token(1));
});


test('a browser denying access to localStorage still loads signed out and fails authentication explicitly', async () => {
  const shared = browser(); const { tab } = shared.open();
  Object.defineProperty(tab, 'localStorage', { get: () => { throw new Error('SecurityError'); } });
  const auth = createAuthCoordinator(tab); const listener = jest.fn(); auth.subscribe(listener);
  expect(listener).toHaveBeenCalledWith(null, null); expect(auth.getAccessToken()).toBeNull();
  const request = jest.fn(); await expect(auth.authenticate(request)).rejects.toThrow('storage');
  expect(request).not.toHaveBeenCalled();
});
