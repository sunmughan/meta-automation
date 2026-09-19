/**
 * src/ai/ai-runtime.js
 * Primary AI runtime for CodeAir Threads + Instagram System.
 * Pure Antigravity AI Agent runtime (agy / Antigravity SDK).
 * Enforces structured JSON schema parsing and resilient retry execution.
 */

const { spawn } = require("child_process");
const CONFIG = require("../../config");
const logger = require("../logging/logger");

class AiRuntime {
  constructor() {
    this.model = CONFIG.MODEL || "gemini-3.6-flash";
  }

  cleanAndParseJson(text) {
    if (!text || typeof text !== "string") {
      throw new Error("Empty or invalid AI output");
    }

    let cleaned = text.trim();
    // Strip markdown code fences if present
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

    try {
      return JSON.parse(cleaned);
    } catch (e) {
      // Find outermost JSON object
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      if (start !== -1 && end !== -1 && end > start) {
        const slice = cleaned.slice(start, end + 1);
        return JSON.parse(slice);
      }
      throw new Error(`JSON parsing failed: ${e.message}. Raw: ${cleaned.slice(0, 150)}...`);
    }
  }

  /**
   * Invokes Antigravity AI runtime.
   * Runs agy command line with clean prompt and structured JSON formatting.
   */
  async callAntigravityCli(prompt, timeoutMs = 90000) {
    return new Promise((resolve, reject) => {
      const proc = spawn("agy", [
        "-p", prompt,
        "--model", this.model,
        "--output-format", "json"
      ], {
        env: { ...process.env, DISPLAY: CONFIG.DISPLAY }
      });

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", chunk => { stdout += chunk; });
      proc.stderr.on("data", chunk => { stderr += chunk; });

      const timer = setTimeout(() => {
        proc.kill("SIGTERM");
        reject(new Error(`Antigravity AI runtime timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      proc.on("close", code => {
        clearTimeout(timer);
        if (code !== 0) {
          return reject(new Error(`Antigravity AI runtime exited with code ${code}: ${stderr || stdout}`));
        }
        try {
          const parsed = JSON.parse(stdout);
          const innerText = parsed.response || stdout;
          const result = this.cleanAndParseJson(innerText);
          resolve(result);
        } catch (e) {
          try {
            // Attempt direct parse if stdout was plain JSON
            resolve(this.cleanAndParseJson(stdout));
          } catch (err2) {
            reject(new Error(`Failed to parse Antigravity AI output: ${e.message}`));
          }
        }
      });

      proc.on("error", err => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  /**
   * Primary entry point for AI reasoning.
   * Exclusively leverages the authenticated Antigravity AI runtime with retry resilience.
   */
  async callAi(prompt, retries = 2) {
    let lastError = null;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await this.callAntigravityCli(prompt);
      } catch (err) {
        lastError = err;
        if (err.code === "ENOENT") {
          // Binary not found on system PATH; immediate fallback without delay
          break;
        }
        if (attempt < retries) {
          const delayMs = attempt * 1500;
          logger.warn(`Antigravity AI call attempt ${attempt}/${retries} failed: ${err.message}. Retrying in ${delayMs}ms...`);
          await new Promise(r => setTimeout(r, delayMs));
        }
      }
    }
    throw lastError;
  }
}

const aiRuntime = new AiRuntime();
module.exports = aiRuntime;
