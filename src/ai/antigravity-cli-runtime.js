"use strict";

const { spawn } = require("child_process");

function parseAntigravityOutput(stdout, stderr = "") {
  const raw = String(stdout || "").trim() || String(stderr || "").trim();
  if (!raw) throw new Error("Antigravity CLI returned an empty response");
  try {
    const envelope = JSON.parse(raw);
    const candidate =
      envelope.response ??
      envelope.result ??
      envelope.output_text ??
      envelope.output ??
      envelope.message?.content ??
      envelope.content;
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    if (candidate && typeof candidate === "object") return JSON.stringify(candidate);
  } catch (_) {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        const envelope = JSON.parse(raw.slice(start, end + 1));
        const candidate = envelope.response ?? envelope.result ?? envelope.output_text ?? envelope.output ?? envelope.content;
        if (candidate) return typeof candidate === "string" ? candidate.trim() : JSON.stringify(candidate);
      } catch (_) {}
    }
  }
  return raw;
}

function callAntigravityCli(prompt, options = {}) {
  const timeoutMs = Math.max(1000, Number(options.timeoutMs) || 90000);
  const binary = process.env.ANTIGRAVITY_CLI_BIN || "agy";
  const args = [
    "-p", String(prompt),
    "--output-format", "json",
    "--disable-slash-commands",
    "--print-timeout", Math.max(1, Math.ceil(timeoutMs / 1000)) + "s"
  ];
  if (process.env.ANTIGRAVITY_MODEL) args.push("--model", process.env.ANTIGRAVITY_MODEL);
  if (process.env.ANTIGRAVITY_EFFORT) args.push("--effort", process.env.ANTIGRAVITY_EFFORT);

  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      cwd: options.cwd || process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Antigravity CLI timed out after " + timeoutMs + "ms"));
    }, timeoutMs + 5000);

    child.stdout.on("data", chunk => { stdout += chunk.toString(); });
    child.stderr.on("data", chunk => { stderr += chunk.toString(); });
    child.on("error", err => {
      clearTimeout(timer);
      if (err.code === "ENOENT") {
        reject(new Error("Antigravity CLI (agy) is not available in PATH"));
        return;
      }
      reject(err);
    });
    child.on("close", code => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error("Antigravity CLI exited with code " + code + ": " + stderr.trim().slice(0, 800)));
        return;
      }
      try { resolve(parseAntigravityOutput(stdout, stderr)); }
      catch (err) { reject(err); }
    });
  });
}

module.exports = { callAntigravityCli, parseAntigravityOutput };
