const fs = require('fs');
const path = require('path');
const net = require('net');
const crypto = require('crypto');
const { spawn } = require('child_process');
const mongoose = require('mongoose');
const { assertAuthTarget, verifyAuthConnection } = require('../tests/authIsolation');

async function main() {
  const directory = fs.mkdtempSync('/private/tmp/auth-phase1-');
  const dbPath = path.join(directory, 'db');
  fs.mkdirSync(dbPath);
  const port = await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', error => {
      fs.rmSync(directory, { recursive: true, force: true });
      reject(error);
    });
    server.listen(0, '127.0.0.1', () => {
      const selected = server.address().port;
      server.close(() => resolve(selected));
    });
  });
  const env = { ...process.env,
    AUTH_TEST_URI: `mongodb://127.0.0.1:${port}/auth_phase1_${crypto.randomBytes(12).toString('hex')}`,
    AUTH_TEST_DBPATH: dbPath,
  };
  const target = assertAuthTarget(env);
  const mongod = spawn(process.env.AUTH_TEST_MONGOD || 'mongod', [
    '--dbpath', dbPath, '--bind_ip', '127.0.0.1', '--port', String(port),
    '--logpath', path.join(directory, 'mongod.log'),
  ], { stdio: 'ignore' });
  let spawnError;
  mongod.on('error', error => { spawnError = error; });
  const stopped = new Promise(resolve => { mongod.once('exit', resolve); mongod.once('error', resolve); });
  try {
    let connection;
    for (let attempt = 0; attempt < 20; attempt++) {
      if (spawnError || mongod.exitCode !== null) throw spawnError || new Error('Disposable mongod exited; see ' + directory);
      try {
        connection = await mongoose.createConnection(target.uri, { serverSelectionTimeoutMS: 500 }).asPromise();
        break;
      } catch (_) { await new Promise(resolve => setTimeout(resolve, 250)); }
    }
    if (!connection) throw new Error('Disposable mongod unavailable');
    try { await verifyAuthConnection(connection, target); } finally { await connection.close(); }
    console.log('Verified disposable MongoDB:', target.uri, 'directory:', dbPath);
    // A dedicated config selects only auth regression suites; no application server startup.
    const jest = spawn(process.execPath, [require.resolve('jest/bin/jest'), '--config', 'jest.auth.config.js', '--runInBand'], {
      cwd: path.resolve(__dirname, '..'), env, stdio: 'inherit',
    });
    process.exitCode = await new Promise((resolve, reject) => {
      jest.once('error', reject); jest.once('exit', code => resolve(code ?? 1));
    });
  } finally {
    mongod.kill('SIGTERM');
    await stopped;
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
