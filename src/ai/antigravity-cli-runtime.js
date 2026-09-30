"use strict";

const { spawn } = require("child_process");

function stripCodeFences(text) {
  if (!text || typeof text !== "string") return text;
  let clean = text.trim();
  if (clean.startsWith("```json")) {
    clean = clean.slice(7);
  } else if (clean.startsWith("```")) {
    clean = clean.slice(3);
  }
  if (clean.endsWith("```")) {
    clean = clean.slice(0, -3);
  }
  return clean.trim();
}

function parseAntigravityOutput(stdout, stderr = "") {
  const raw = stripCodeFences(String(stdout || "").trim() || String(stderr || "").trim());
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
    if (typeof candidate === "string" && candidate.trim()) return stripCodeFences(candidate.trim());
    if (candidate && typeof candidate === "object") return JSON.stringify(candidate);
  } catch (_) {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        const envelope = JSON.parse(raw.slice(start, end + 1));
        const candidate = envelope.response ?? envelope.result ?? envelope.output_text ?? envelope.output ?? envelope.content;
        if (candidate) return stripCodeFences(typeof candidate === "string" ? candidate.trim() : JSON.stringify(candidate));
      } catch (_) {}
    }
  }
  return raw;
}

function normalizeAntigravityModel(rawModel, rawEffort) {
  if (!rawModel || typeof rawModel !== "string") return null;
  const trimmed = rawModel.trim();
  if (!trimmed) return null;
  if (trimmed.includes("(") && trimmed.includes(")")) return trimmed;
  const effortNormalized = rawEffort && typeof rawEffort === "string" && rawEffort.trim()
    ? rawEffort.trim().charAt(0).toUpperCase() + rawEffort.trim().slice(1).toLowerCase()
    : "Medium";
  if (/^gemini[- ]*3\.8[- ]*flash$/i.test(trimmed)) {
    return `Gemini 3.8 Flash (${effortNormalized})`;
  }
  if (/^gemini[- ]*3\.7[- ]*flash$/i.test(trimmed)) {
    return `Gemini 3.7 Flash (${effortNormalized})`;
  }
  if (/^gemini[- ]*3\.6[- ]*flash$/i.test(trimmed)) {
    return `Gemini 3.6 Flash (${effortNormalized})`;
  }
  if (/^gemini[- ]*3\.1[- ]*pro$/i.test(trimmed)) {
    return `Gemini 3.1 Pro (${effortNormalized === "Medium" ? "High" : effortNormalized})`;
  }
  return trimmed;
}

function callAntigravityCli(prompt, options = {}) {
  const timeoutMs = Math.max(1000, Number(options.timeoutMs) || 90000);
  const binary = process.env.ANTIGRAVITY_CLI_BIN || "agy";
  const args = [
    "-p", String(prompt),
    "--output-format", "json",
    "--disable-slash-commands",
    "--dangerously-skip-permissions",
    "--print-timeout", Math.max(1, Math.ceil(timeoutMs / 1000)) + "s"
  ];
  const rawModel = process.env.ANTIGRAVITY_MODEL;
  const normalizedModel = normalizeAntigravityModel(rawModel, process.env.ANTIGRAVITY_EFFORT);
  if (normalizedModel) args.push("--model", normalizedModel);
  if (process.env.ANTIGRAVITY_EFFORT && (!normalizedModel || !normalizedModel.includes("("))) {
    args.push("--effort", process.env.ANTIGRAVITY_EFFORT);
  }

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

module.exports = { callAntigravityCli, parseAntigravityOutput, stripCodeFences };

