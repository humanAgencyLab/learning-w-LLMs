const mongoose = require('mongoose');

module.exports = async () => {
  try {
    if (mongoose.connection?.readyState === 1) {
      await mongoose.connection.close();
    }
  } catch (_) {
    // ignore
  }
};

