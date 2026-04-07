const mongoose = require('mongoose');

// Ensure we don't keep Jest alive due to open DB handles.
afterAll(async () => {
  try {
    if (mongoose.connection?.readyState === 1) {
      await mongoose.connection.close();
    }
  } catch (_) {
    // Best-effort: tests should not fail due to teardown.
  }
});

