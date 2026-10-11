const path = require('path');

// Only the dedicated runner's loopback mongod and fresh temporary directory qualify.
function assertAuthTarget(env) {
  const uri = env.AUTH_TEST_URI;
  if (!uri || !env.AUTH_TEST_DBPATH) throw new Error('Disposable auth test target is required');
  const url = new URL(uri);
  if (url.protocol !== 'mongodb:' || url.hostname !== '127.0.0.1' ||
      !url.port || url.port === '27017' || url.username || url.password || url.search ||
      !/^\/auth_phase1_[a-f0-9]{24}$/.test(url.pathname)) {
    throw new Error('Unsafe auth test URI');
  }
  const dbPath = path.resolve(env.AUTH_TEST_DBPATH);
  if (!/^\/private\/tmp\/auth-phase1-[^/]+\/db$/.test(dbPath)) {
    throw new Error('Unsafe disposable database directory');
  }
  return { uri, dbPath, database: url.pathname.slice(1), port: Number(url.port) };
}

async function verifyAuthConnection(connection, target) {
  if (connection.name !== target.database || connection.host !== '127.0.0.1' ||
      connection.port !== target.port) throw new Error('Connected database does not match disposable target');
  const options = await connection.db.admin().command({ getCmdLineOpts: 1 });
  if (path.resolve(options.parsed?.storage?.dbPath || '') !== target.dbPath ||
      options.parsed?.net?.bindIp !== '127.0.0.1' || options.parsed?.net?.port !== target.port) {
    throw new Error('MongoDB process is not the owned disposable instance');
  }
}
module.exports = { assertAuthTarget, verifyAuthConnection };
