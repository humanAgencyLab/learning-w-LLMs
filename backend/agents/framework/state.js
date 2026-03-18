/**
 * Canonical agent I/O contracts.
 * These are reference shapes, not enforced at runtime (the validators do that).
 */

/**
 * @typedef {object} AgentInput
 * @property {object}  session      – Mongoose session document
 * @property {string}  userMessage  – latest user message
 * @property {object}  [profile]    – user profile
 * @property {object}  [plan]       – current learning plan
 * @property {object}  [milestone]  – current milestone
 * @property {object}  [module]     – current module
 * @property {object}  [metadata]   – extra context (retry errors, etc.)
 */

/**
 * @typedef {object} AgentOutput
 * @property {string}  type        – e.g. 'intent', 'plan', 'teaching', 'assessment', 'quiz'
 * @property {object}  payload     – agent-specific structured data
 * @property {string}  [uiMessage] – human-readable message for the chat UI
 * @property {object}  [debug]     – optional debug info
 */

/**
 * @typedef {object} ValidationResult
 * @property {boolean}  valid
 * @property {string[]} errors
 */

module.exports = {};
