# Phase 1 authentication verification

Run non-database checks from the repository root:

    node backend/node_modules/jest/bin/jest.js --config backend/jest.auth.unit.config.js --runInBand

Run database regressions only through the owned-instance runner:

    node backend/scripts/testAuthIsolated.js

The runner requires an existing `mongod` binary (or explicit `AUTH_TEST_MONGOD` path).
It never uses MONGODB_URI or MONGODB_TEST_URI as its connection target. It creates
an empty `/private/tmp/auth-phase1-*` directory, selects an ephemeral loopback
port, and starts a separate mongod. Before Jest starts, and again before test
fixtures run, verification checks the actual database name, host, port and
MongoDB getCmdLineOpts storage path and bind address. Unverified targets fail
before writes. Application dotenv loading is mocked in this dedicated config.
Automatic collection/index creation is disabled on connection; user indexes are
created explicitly only after verification. Only authentication regression suites run. The runner stops its child process
and removes its own temporary directory; no collection cleanup targets existing
application data. If a disposable process cannot be started or verified, do not
substitute a development, production, or existing local database.

Frontend regressions (from frontend/my-app):

    CI=true npm test -- --watchAll=false --runInBand --runTestsByPath src/lib/authApi.test.js

# Deployment behavior

JWT_SECRET must be explicitly supplied, at least 32 bytes, and not a known
placeholder. Use a randomly generated secret supplied through deployment secret
configuration. Access/refresh durations use positive integers with s/m/h/d units.
Defaults are 15m/7d; refresh cookie lifetime follows refresh JWT lifetime.
Unversioned JWTs are rejected, so existing users must sign in again after rollout.
Existing MongoDB accounts missing authVersion are treated as version zero; no
bulk data migration is required. New signup documents explicitly store zero.

Logout revokes all account sessions using a conditional authVersion increment.
Repeated old logout does not revoke later logins. Password change and reset
atomically invalidate previous credentials. Revocation cannot cancel requests
already authorized. Browser generation checks discard refresh and user lookup
results that arrive after logout; refresh calls share an in-flight request.

Public forgot-password remains at the same endpoint but issues no credentials
and gives an identical, honest response for all valid usernames. There is no
verified recovery delivery channel yet. Legacy raw reset tokens are never
accepted. The reset endpoint consumes SHA-256 hashed tokens in
passwordResetTokenHash atomically; a future trusted issuer must provision those
only after identity verification. Tests seed them only in the disposable DB.
Do not send recovery mail to synthetic compatibility email addresses.

A failed network/database logout clears browser state but reports that server
revocation was not confirmed. Sign in and sign out again when available to
revoke account sessions. Per-device sessions, refresh rotation/reuse detection,
and verified recovery delivery are future work.
