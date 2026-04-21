'use strict';

function ts() {
  return new Date().toISOString().slice(11, 23);
}

function fmt(prefix, args) {
  return [`[${ts()}] [sim] [${prefix}]`, ...args];
}

function make(prefix) {
  return {
    info: (...args) => console.log(...fmt(prefix, args)),
    warn: (...args) => console.warn(...fmt(prefix, args)),
    error: (...args) => console.error(...fmt(prefix, args)),
    debug: (...args) => {
      if (process.env.SIM_DEBUG) console.log(...fmt(prefix + ':dbg', args));
    },
    child: (sub) => make(`${prefix}/${sub}`),
  };
}

module.exports = { make };
