// pm2 ecosystem file for the OpenAI Privacy Filter web interface + API.
//
// Usage:
//   pm2 start ecosystem.config.js
//   pm2 logs openai-privacy-filter
//   pm2 stop openai-privacy-filter
//
// HOST / PORT / VENV_DIR are read from the environment (the run.sh script
// loads them from .env before invoking pm2), with sensible defaults.
const path = require("path");

const HOST = process.env.HOST || "0.0.0.0";
const PORT = process.env.PORT || "8080";
const VENV_DIR = process.env.VENV_DIR || ".venv";
const APP_NAME = process.env.PM2_APP_NAME || "openai-privacy-filter";

const uvicorn = path.join(__dirname, VENV_DIR, "bin", "uvicorn");

module.exports = {
  apps: [
    {
      name: APP_NAME,
      script: uvicorn,
      args: ["src.app:app", "--host", HOST, "--port", String(PORT)],
      interpreter: "none",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      kill_timeout: 10000,
      env: {
        HOST,
        PORT: String(PORT),
        OPF_DEVICE: process.env.OPF_DEVICE || "cpu",
        OPF_OUTPUT_MODE: process.env.OPF_OUTPUT_MODE || "typed",
        OPF_CHECKPOINT: process.env.OPF_CHECKPOINT || "",
      },
      out_file: path.join(__dirname, ".run", "pm2-out.log"),
      error_file: path.join(__dirname, ".run", "pm2-error.log"),
      merge_logs: true,
    },
  ],
};
