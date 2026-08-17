'use strict';

require('dotenv').config();

const path = require('path');

const API_BASE_URL = process.env.SIM_API_BASE_URL || 'http://localhost:3000/v1';
const GROQ_API_KEY = process.env.GROQ_API_KEY || process.env.SIM_GROQ_API_KEY;
const GROQ_MODEL = process.env.SIM_GROQ_MODEL || 'openai/gpt-oss-120b';
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
const SIM_CONCURRENCY = Number(process.env.SIM_CONCURRENCY || 3);
const SIM_PASSWORD = process.env.SIM_PASSWORD || 'SimStudent!2025';
const SIM_TIMEOUT_MS = Number(process.env.SIM_TIMEOUT_MS || 90_000);

const MANIFEST_DIR = path.join(__dirname, 'snapshots');
const MANIFEST_PATH = path.join(MANIFEST_DIR, 'run-manifest.json');

module.exports = {
  API_BASE_URL,
  GROQ_API_KEY,
  GROQ_MODEL,
  MONGO_URI,
  SIM_CONCURRENCY,
  SIM_PASSWORD,
  SIM_TIMEOUT_MS,
  MANIFEST_DIR,
  MANIFEST_PATH,
};
