"use strict";

const { spawn } = require("child_process");

function stripCodeFences(text) {
  if (typeof text !== "string") return text;
  let clean = text.trim();
  if (clean.startsWith("```json")) clean = clean.slice(7);
  else if (clean.startsWith("```")) clean = clean.slice(3);
  if (clean.endsWith("```")) clean = clean.slice(0, -3);
  return clean.trim();
}

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
    if (typeof candidate === "string" && candidate.trim()) return stripCodeFences(candidate);
    if (candidate && typeof candidate === "object") return JSON.stringify(candidate);
  } catch (_) {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        const envelope = JSON.parse(raw.slice(start, end + 1));
        const candidate = envelope.response ?? envelope.result ?? envelope.output_text ?? envelope.output ?? envelope.content;
        if (candidate) return typeof candidate === "string" ? stripCodeFences(candidate) : JSON.stringify(candidate);
      } catch (_) {}
    }
  }
  return stripCodeFences(raw);
}

function callAntigravityCli(prompt, options = {}) {
  const timeoutMs = Math.max(1000, Number(options.timeoutMs) || 90000);
  const binary = process.env.ANTIGRAVITY_CLI_BIN || "agy";

  let cleanPrompt = String(prompt);
  if (!cleanPrompt.includes("CRITICAL OPERATIONAL CONSTRAINT") && !cleanPrompt.includes("DO NOT INVOKE ANY TOOLS")) {
    cleanPrompt = `CRITICAL OPERATIONAL CONSTRAINT:
You are an autonomous JSON extraction and planning engine.
DO NOT CALL ANY TOOLS (no view_file, no run_command, no search_web, no manage_task).
You ALREADY have all the information and context you need in this prompt.
Return ONLY valid JSON matching the requested schema. No conversational prose, no markdown fences, no tools.

${cleanPrompt}`;
  }

  const args = [
    "-p", cleanPrompt,
    "--output-format", "json",
    "--disable-slash-commands",
    "--dangerously-skip-permissions",
    "--print-timeout", Math.max(1, Math.ceil(timeoutMs / 1000)) + "s"
  ];
  const rawModel = String(process.env.ANTIGRAVITY_MODEL || "").trim();
  if (rawModel) {
    if (rawModel.includes("(") && rawModel.includes(")")) {
      args.push("--model", rawModel);
    } else {
      args.push("--model", `${rawModel} (High)`);
    }
  } else {
    args.push("--model", "Gemini 3.8 Flash (High)");
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

module.exports = { callAntigravityCli, parseAntigravityOutput };
