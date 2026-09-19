/**
 * src/ai/ai-runtime.js
 * Primary AI runtime for CodeAir Threads + Instagram System.
 * Uses Antigravity CLI / agent runtime as primary, with direct Gemini REST fallback.
 * Enforces exponential backoff and structured JSON output.
 */

const { spawn } = require("child_process");
const https = require("https");
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

  async callAntigravityCli(prompt, timeoutMs = 120000) {
    return new Promise((resolve, reject) => {
      const proc = spawn("agy", [
        "-p", prompt,
        "--model", this.model,
        "--output-format", "json",
        "--dangerously-skip-permissions"
      ], {
        env: { ...process.env, DISPLAY: CONFIG.DISPLAY }
      });

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", chunk => { stdout += chunk; });
      proc.stderr.on("data", chunk => { stderr += chunk; });

      const timer = setTimeout(() => {
        proc.kill("SIGTERM");
        reject(new Error(`Antigravity CLI timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      proc.on("close", code => {
        clearTimeout(timer);
        if (code !== 0) {
          return reject(new Error(`Antigravity CLI exited with code ${code}: ${stderr || stdout}`));
        }
        try {
          const parsed = JSON.parse(stdout);
          const innerText = parsed.response || stdout;
          const result = this.cleanAndParseJson(innerText);
          resolve(result);
        } catch (e) {
          reject(new Error(`Failed to parse Antigravity CLI output: ${e.message}`));
        }
      });

      proc.on("error", err => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  async callGeminiRest(prompt, retries = 3) {
    CONFIG.validateApiKey();

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${CONFIG.GEMINI_API_KEY}`;
    let lastError = null;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const payload = JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json"
          }
        });

        const responseText = await new Promise((resolve, reject) => {
          const u = new URL(endpoint);
          const req = https.request(
            {
              hostname: u.hostname,
              path: u.pathname + u.search,
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(payload)
              },
              timeout: 45000
            },
            res => {
              let data = "";
              res.on("data", chunk => { data += chunk; });
              res.on("end", () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                  resolve(data);
                } else {
                  reject(new Error(`Gemini HTTP ${res.statusCode}: ${data}`));
                }
              });
            }
          );

          req.on("error", reject);
          req.on("timeout", () => {
            req.destroy();
            reject(new Error("Gemini API request timed out"));
          });

          req.write(payload);
          req.end();
        });

        const parsed = JSON.parse(responseText);
        const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) {
          throw new Error("No candidate text returned by Gemini");
        }
        return this.cleanAndParseJson(text);
      } catch (err) {
        lastError = err;
        const delay = Math.pow(2, attempt) * 1000;
        logger.warn(`AI REST attempt ${attempt}/${retries} failed: ${err.message}. Retrying in ${delay}ms...`);
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }

    throw lastError;
  }

  async callAi(prompt) {
    const runtime = CONFIG.AI_RUNTIME || "antigravity";
    if (runtime === "antigravity") {
      try {
        return await this.callAntigravityCli(prompt);
      } catch (err) {
        // If Antigravity CLI is not installed or available, try Gemini REST if key is available
        if (CONFIG.GEMINI_API_KEY) {
          logger.warn(`Antigravity CLI unavailable (${err.message}). Using direct Gemini REST API...`);
          return await this.callGeminiRest(prompt);
        }
        throw err;
      }
    }
    return await this.callGeminiRest(prompt);
  }
}

const aiRuntime = new AiRuntime();
module.exports = aiRuntime;
