import * as authApi from './authApi';
import useAuthStore from '../state/authStore';
import { interceptedFetch } from './apiInterceptor';
import * as profileApi from './profileApi';
jest.mock('../components/ui/toast', () => ({ toastBus: { publish: jest.fn() } }));
const response = (body, status = 200) => ({ ok: status < 400, status, headers: { get: () => 'application/json' }, text: async () => JSON.stringify(body), json: async () => body });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const oldToken = `header.${btoa(JSON.stringify({ exp: 4102444800 }))}.signature`;
let lockTail = Promise.resolve();
let nextRevision = 0;
const flush = async () => { for (let i = 0; i < 15; i += 1) await Promise.resolve(); };
beforeEach(async () => {
  Object.defineProperty(window, 'crypto', { configurable: true, value: { randomUUID: () => `test-${++nextRevision}` } });
  Object.defineProperty(navigator, 'locks', { configurable: true, value: {
    request: (_name, _options, callback) => {
      const next = lockTail.then(callback);
      lockTail = next.catch(() => {});
      return next;
    },
  } });
  global.fetch = jest.fn().mockResolvedValue(response({ success: true, data: { revocationConfirmed: true } }));
  await authApi.logout();
  global.fetch = jest.fn();
});
afterEach(() => jest.restoreAllMocks());
const authenticate = () => {
  authApi.setAccessToken(oldToken);
  useAuthStore.setState({ user: { _id: 'test' }, accessToken: oldToken, isAuthenticated: true });
};
test('concurrent refresh shares one request and late result cannot restore auth after logout', async () => {
  authenticate(); const pending = deferred();
  fetch.mockImplementation(url => url.endsWith('/refresh') ? pending.promise : Promise.resolve(response({ success: true, data: { revocationConfirmed: true } })));
  const first = useAuthStore.getState().refreshToken().catch(error => error);
  const second = authApi.refreshToken().catch(error => error);
  expect(fetch).toHaveBeenCalledTimes(1);
  await useAuthStore.getState().logout();
  pending.resolve(response({ data: { accessToken: 'late' } }));
  expect((await first).message).toBe('Authentication request cancelled');
  expect((await second).message).toBe('Authentication request cancelled');
  expect(authApi.getAccessToken()).toBeNull();
  expect(useAuthStore.getState().isAuthenticated).toBe(false);
  expect(JSON.parse(localStorage.getItem('auth-storage')).state.accessToken).toBeNull();
});
test('interceptor cannot retry or resurrect credentials after logout', async () => {
  authenticate(); const pending = deferred(); const started = deferred();
  const unauthorized = response({ code: 'INVALID_TOKEN' }, 401); unauthorized.clone = () => unauthorized;
  fetch.mockImplementation(url => {
    if (url.endsWith('/refresh')) { started.resolve(); return pending.promise; }
    if (url.endsWith('/logout')) return Promise.resolve(response({ success: true, data: { revocationConfirmed: true } }));
    return Promise.resolve(unauthorized);
  });
  const request = interceptedFetch('/protected', { headers: authApi.getAuthHeaders() }).catch(error => error);
  await started.promise;
  await useAuthStore.getState().logout();
  pending.resolve(response({ data: { accessToken: 'late' } }));
  expect((await request).message).toBe('Authentication request cancelled');
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(useAuthStore.getState().accessToken).toBeNull();
});
test('late initialization cannot set isAuthenticated after logout', async () => {
  authenticate(); const pending = deferred();
  fetch.mockImplementation(url => url.endsWith('/me') ? pending.promise : Promise.resolve(response({ success: true, data: { revocationConfirmed: true } })));
  const initialize = useAuthStore.getState().initialize();
  await useAuthStore.getState().logout();
  pending.resolve(response({ data: { user: { _id: 'test' } } }));
  await initialize;
  expect(useAuthStore.getState().isAuthenticated).toBe(false);
});
test('logout reports unconfirmed revocation but clears browser state', async () => {
  authenticate(); fetch.mockResolvedValue(response({ success: false }, 500));
  await useAuthStore.getState().logout();
  expect(useAuthStore.getState().error).toContain('could not be confirmed');
  expect(useAuthStore.getState().isAuthenticated).toBe(false);
  expect(authApi.getAccessToken()).toBeNull();
});
test('password change and reset clear browser authentication', async () => {
  authenticate(); fetch.mockResolvedValue(response({ success: true, data: { revocationConfirmed: true } }));
  await profileApi.changePassword('old', 'new');
  expect(useAuthStore.getState().isAuthenticated).toBe(false);
  authenticate(); await authApi.resetPassword({ token: 'token', password: 'new' });
  expect(useAuthStore.getState().isAuthenticated).toBe(false);
});
test('successful refresh synchronizes token stores', async () => {
  authenticate(); fetch.mockResolvedValue(response({ data: { accessToken: 'new' } }));
  await authApi.refreshToken();
  expect(authApi.getAccessToken()).toBe('new');
  expect(useAuthStore.getState().accessToken).toBe('new');
});

test('login waits for server logout before issuing credentials and retains both token stores', async () => {
  authenticate(); const pending = deferred();
  let serverVersion = 0;
  fetch.mockImplementation(url => {
    if (url.endsWith('/logout')) return pending.promise.then(() => {
      serverVersion += 1; return response({ success: true, data: { revocationConfirmed: true } });
    });
    if (url.endsWith('/login')) return Promise.resolve(response({ data: { user: { _id: 'test' }, accessToken: `version-${serverVersion}` } }));
    throw new Error('Unexpected request');
  });
  const logout = useAuthStore.getState().logout();
  await flush();
  const login = useAuthStore.getState().login({ username: 'same-user', password: 'password' });
  await flush();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toMatch(/logout$/);
  pending.resolve();
  await Promise.all([logout, login]);
  expect(serverVersion).toBe(1);
  expect(authApi.getAccessToken()).toBe('version-1');
  expect(useAuthStore.getState().accessToken).toBe('version-1');
  expect(useAuthStore.getState().isAuthenticated).toBe(true);
  expect(JSON.parse(localStorage.getItem('auth-storage')).state.accessToken).toBe('version-1');
});

test('old refresh arriving after serialized logout and new login cannot clear or replace new authentication', async () => {
  authenticate(); const pending = deferred();
  fetch.mockImplementation(url => {
    if (url.endsWith('/refresh')) return pending.promise;
    if (url.endsWith('/logout')) return Promise.resolve(response({ success: true, data: { revocationConfirmed: true } }));
    return Promise.resolve(response({ data: { user: { _id: 'new-user' }, accessToken: 'new-login' } }));
  });
  const refresh = useAuthStore.getState().refreshToken().catch(error => error);
  const logout = useAuthStore.getState().logout();
  await flush();
  const login = useAuthStore.getState().login({ username: 'new-user', password: 'password' });
  await Promise.all([logout, login]);
  pending.resolve(response({ data: { accessToken: 'old-refresh' } }));
  expect((await refresh).message).toBe('Authentication request cancelled');
  expect(authApi.getAccessToken()).toBe('new-login');
  expect(useAuthStore.getState().accessToken).toBe('new-login');
  expect(useAuthStore.getState().user._id).toBe('new-user');
  expect(useAuthStore.getState().isAuthenticated).toBe(true);
});

test('unconfirmed logout blocks queued login; explicit retry confirms revocation before login', async () => {
  authenticate(); const pending = deferred();
  fetch.mockImplementation(url => url.endsWith('/logout') ? pending.promise : Promise.resolve(response({ data: { user: { _id: 'test' }, accessToken: 'retry-login' } })));
  const logout = useAuthStore.getState().logout();
  await flush();
  const login = useAuthStore.getState().login({ username: 'test', password: 'password' }).catch(error => error);
  await flush();
  pending.resolve(response({ success: false }, 500));
  await logout;
  expect((await login).message).toContain('could not be confirmed');
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(authApi.getAccessToken()).toBeNull();
  fetch.mockImplementation(url => Promise.resolve(url.endsWith('/logout') ? response({ success: true, data: { revocationConfirmed: true } }) : response({ data: { user: { _id: 'test' }, accessToken: 'retry-login' } })));
  await useAuthStore.getState().login({ username: 'test', password: 'password' });
  expect(fetch.mock.calls.map(([url]) => url.split('/').pop())).toEqual(['logout', 'logout', 'login']);
  expect(fetch.mock.calls[1][1].headers.Authorization).toBe(`Bearer ${oldToken}`);
  expect(useAuthStore.getState().isAuthenticated).toBe(true);
  expect(authApi.getAccessToken()).toBe('retry-login');
});

test('overlapping logout calls share revocation and refresh cannot start during logout', async () => {
  authenticate(); const pending = deferred();
  fetch.mockReturnValue(pending.promise);
  const first = useAuthStore.getState().logout();
  const second = useAuthStore.getState().logout();
  await expect(authApi.refreshToken()).rejects.toThrow('Authentication request cancelled');
  await flush();
  expect(fetch).toHaveBeenCalledTimes(1);
  pending.resolve(response({ success: true, data: { revocationConfirmed: true } }));
  await Promise.all([first, second]);
  expect(useAuthStore.getState().isAuthenticated).toBe(false);
});

test('direct auth API login also waits for revocation and can retry an unconfirmed logout', async () => {
  authenticate(); const pending = deferred();
  fetch.mockReturnValue(pending.promise);
  const logout = authApi.logout().catch(error => error);
  await flush();
  const queued = authApi.login({ username: 'test', password: 'password' }).catch(error => error);
  await flush();
  pending.resolve(response({ success: false }, 500));
  expect((await logout).message).toContain('could not be confirmed');
  expect((await queued).message).toContain('could not be confirmed');
  expect(fetch).toHaveBeenCalledTimes(1);
  fetch.mockImplementation(url => Promise.resolve(url.endsWith('/logout') ? response({ success: true, data: { revocationConfirmed: true } }) : response({ data: { user: { _id: 'test' }, accessToken: 'direct-login' } })));
  const loggedIn = await authApi.login({ username: 'test', password: 'password' });
  expect(loggedIn.accessToken).toBe('direct-login');
  expect(authApi.getAccessToken()).toBe('direct-login');
  expect(useAuthStore.getState().accessToken).toBe('direct-login');
  expect(fetch.mock.calls.map(([url]) => url.split('/').pop())).toEqual(['logout', 'logout', 'login']);
});
