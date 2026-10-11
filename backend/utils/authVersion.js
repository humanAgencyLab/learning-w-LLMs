// Missing stored versions on existing accounts are version zero. Tokens must carry a version.
const versionOf = user => user.authVersion ?? 0;
const versionFilter = (userId, version) => ({
  _id: userId,
  ...(version === 0 ? { $or: [{ authVersion: 0 }, { authVersion: { $exists: false } }] } : { authVersion: version }),
});
module.exports = { versionOf, versionFilter };
