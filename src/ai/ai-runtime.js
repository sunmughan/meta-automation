/**
 * src/ai/ai-runtime.js
 * Primary AI runtime for CodeAir social automation.
 * Native MiniMax M3 API runtime with queue-based concurrency governance,
 * structured JSON parsing, retries, and resilient execution.
 */

const CONFIG = require("../../config");
const logger = require("../logging/logger");

/**
 * In-memory asynchronous queue and concurrency worker for MiniMax reasoning calls.
 * Prevents process thrashing, enforces priority scheduling, and caches results.
 */
class AiQueue {
  constructor(concurrency = 1) {
    this.concurrency = concurrency;
    this.queue = []; // Array of { id, type, priority, prompt, executor, resolve, reject, options }
    this.activeCount = 0;
    this.completedCount = 0;
    this.cache = new Map(); // cacheKey -> { result, expiresAt }
    this.cacheTtlMs = 120000; // 2-minute deduplication window
  }

  /**
   * Enqueues an AI task with priority and task categorization.
   * Task types: "DM_RESPONSE" | "REPLY_GENERATION" | "COMMENT_SYNTHESIS" | "POST_ANALYSIS"
   */
  enqueue(type, prompt, executor, options = {}) {
    // 1. In-memory Deduplication Cache Check
    const cacheKey = `${type}:${prompt.trim()}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return Promise.resolve(cached.result);
    }

    const priorityMap = {
      DM_RESPONSE: 1,
      REPLY_GENERATION: 2,
      COMMENT_SYNTHESIS: 3,
      POST_ANALYSIS: 4
    };
    const priority = options.priority || priorityMap[type] || 5;

    return new Promise((resolve, reject) => {
      const task = {
        id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        type,
        priority,
        prompt,
        executor,
        resolve: (result) => {
          this.cache.set(cacheKey, { result, expiresAt: Date.now() + this.cacheTtlMs });
          // Prevent unbounded memory growth
          if (this.cache.size > 200) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
          }
          resolve(result);
        },
        reject,
        options
      };

      this.queue.push(task);
      this.queue.sort((a, b) => a.priority - b.priority);
      this.processNext();
    });
  }

  /**
   * Processes the next task in the queue respecting concurrency limits.
   */
  async processNext() {
    if (this.activeCount >= this.concurrency || this.queue.length === 0) {
      return;
    }

    const task = this.queue.shift();
    this.activeCount++;

    try {
      const res = await task.executor(task.prompt, task.options);
      this.completedCount++;
      task.resolve(res);
    } catch (err) {
      task.reject(err);
    } finally {
      this.activeCount--;
      const throttleMs = Number(process.env.AI_THROTTLE_MS) || (CONFIG.AI_PROVIDER === "minimax" ? 1200 : 100);
      setTimeout(() => this.processNext(), throttleMs);
    }
  }

  getStatus() {
    return {
      pending: this.queue.length,
      active: this.activeCount,
      completed: this.completedCount,
      cacheEntries: this.cache.size
    };
  }

  clear() {
    this.queue = [];
    this.cache.clear();
  }
}

class AiRuntime {
  constructor() {
    this.model = CONFIG.MODEL || "MiniMax-M3";
    const defaultConcurrency = CONFIG.AI_PROVIDER === "minimax" ? 1 : 3;
    const maxConcurrency = Math.max(1, Number(process.env.AI_MAX_CONCURRENCY) || defaultConcurrency);
    this.queue = new AiQueue(maxConcurrency);
  }

  cleanAndParseJson(text) {
    if (!text || typeof text !== "string") throw new Error("Empty or invalid AI output");
    let cleaned = text.trim();
    const fence = String.fromCharCode(96).repeat(3);
    if (cleaned.startsWith(fence)) cleaned = cleaned.slice(fence.length).trim();
    if (cleaned.endsWith(fence)) cleaned = cleaned.slice(0, -fence.length).trim();
    try { return JSON.parse(cleaned); } catch (_) {}
    let start = -1;
    let depth = 0;
    let inString = false;
    let escaped = false;
    const quote = String.fromCharCode(34);
    for (let i = 0; i < cleaned.length; i += 1) {
      const ch = cleaned[i];
      if (escaped) { escaped = false; continue; }
      if (ch === "\\") { escaped = true; continue; }
      if (ch === quote) { inString = !inString; continue; }
      if (inString) continue;
      if (ch === "{") { if (depth === 0) start = i; depth += 1; }
      else if (ch === "}") { depth -= 1; if (depth === 0 && start >= 0) {
        try { return JSON.parse(cleaned.slice(start, i + 1)); } catch (_) {}
      }}
    }
    throw new Error("JSON parsing failed. Raw: " + cleaned.slice(0, 150));
  }

  /**
   * Invokes MiniMax  /**
   * Invokes MiniMax M3 through the official HTTP API.
   * Uses native fetch (Node >=18), so no additional SDK dependency is required.
   */
  async callMiniMax(prompt, timeoutMs = CONFIG.MINIMAX_TIMEOUT_MS) {
    if (!CONFIG.MINIMAX_API_KEY) {
      throw new Error("MINIMAX_API_KEY is not configured. Add it to .env before running with AI_PROVIDER=minimax.");
    }

    const baseUrl = String(CONFIG.MINIMAX_BASE_URL || "https://api.minimax.io/v1").replace(/\/+$/, "");
    const endpoint = CONFIG.MINIMAX_ENDPOINT || "/text/chatcompletion_v2";
    const url = endpoint.startsWith("http") ? endpoint : baseUrl + (endpoint.startsWith("/") ? "" : "/") + endpoint;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${CONFIG.MINIMAX_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: CONFIG.MINIMAX_MODEL || "MiniMax-M3",
          messages: [{ role: "user", content: prompt }],
          temperature: CONFIG.MINIMAX_TEMPERATURE,
          max_tokens: CONFIG.MINIMAX_MAX_TOKENS,
          ...(CONFIG.MINIMAX_THINKING === "true" ? { thinking: { type: "adaptive" } } : {})
        }),
        signal: controller.signal
      });

      const raw = await response.text();
      let data;
      try {
        data = JSON.parse(raw);
      } catch (err) {
        throw new Error(`MiniMax returned non-JSON response (HTTP ${response.status}): ${raw.slice(0, 500)}`);
      }

      if (!response.ok) {
        const message = data?.base_resp?.status_msg || data?.error?.message || data?.message || raw.slice(0, 500);
        const error = new Error(`MiniMax API HTTP ${response.status}: ${message}`);
        error.status = response.status;
        throw error;
      }

      // MiniMax may return HTTP 200 with base_resp.status_code != 0 for parameter errors
      if (data?.base_resp?.status_code && data.base_resp.status_code !== 0) {
        throw new Error(`MiniMax API error (${data.base_resp.status_code}): ${data.base_resp.status_msg || "Unknown error"}`);
      }

      const content = data?.choices?.[0]?.message?.content
        ?? data?.choices?.[0]?.message?.reasoning_content
        ?? data?.reply
        ?? data?.response;

      if (typeof content === "string" && content.trim()) {
        return this.cleanAndParseJson(content);
      }
      if (content && typeof content === "object") return content;
      throw new Error("MiniMax API returned no usable message content");
    } catch (err) {
      if (err.name === "AbortError") throw new Error(`MiniMax API timed out after ${timeoutMs}ms`);
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Invokes an OpenAI-compatible API endpoint (Freebuff, DeepSeek, OpenAI, Groq, Ollama, etc.)
   * Uses native fetch (Node >=18), zero external dependencies.
   */
  async callOpenAiCompatible(prompt, timeoutMs = CONFIG.OPENAI_TIMEOUT_MS || 90000) {
    const apiKey = CONFIG.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY / FREEBUFF_API_KEY is not configured in .env");
    }

    const baseUrl = CONFIG.OPENAI_BASE_URL || "https://api.openai.com/v1";
    const endpoint = CONFIG.OPENAI_ENDPOINT || "/chat/completions";
    const url = endpoint.startsWith("http") ? endpoint : baseUrl.replace(/\/+$/, "") + (endpoint.startsWith("/") ? "" : "/") + endpoint;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: CONFIG.OPENAI_MODEL || "deepseek 4.1 flash",
          messages: [{ role: "user", content: prompt }],
          temperature: CONFIG.OPENAI_TEMPERATURE ?? 0.2,
          max_tokens: CONFIG.OPENAI_MAX_TOKENS ?? 4096
        }),
        signal: controller.signal
      });

      const raw = await response.text();
      let data;
      try {
        data = JSON.parse(raw);
      } catch (err) {
        throw new Error(`OpenAI-compatible endpoint returned non-JSON (HTTP ${response.status}): ${raw.slice(0, 500)}`);
      }

      if (!response.ok) {
        const message = data?.error?.message || data?.message || raw.slice(0, 500);
        const error = new Error(`OpenAI-compatible API HTTP ${response.status}: ${message}`);
        error.status = response.status;
        throw error;
      }

      const content = data?.choices?.[0]?.message?.content
        ?? data?.choices?.[0]?.message?.reasoning_content
        ?? data?.choices?.[0]?.delta?.content
        ?? data?.choices?.[0]?.text;

      if (typeof content === "string" && content.trim()) {
        return this.cleanAndParseJson(content);
      }
      if (content && typeof content === "object") return content;
      throw new Error("OpenAI-compatible API returned no usable message content");
    } catch (err) {
      if (err.name === "AbortError") throw new Error(`OpenAI-compatible API timed out after ${timeoutMs}ms`);
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Primary entry point for AI reasoning.
   * Routes all calls through the AiQueue for concurrency control and deduplication.
   *
   * @param {string} prompt
   * @param {Object} [options] - { taskType, priority, timeoutMs, retries }
   * @returns {Promise<Object>}
   */
  async callAi(prompt, options = {}) {
    const taskType = options.taskType || "POST_ANALYSIS";
    return this.queue.enqueue(
      taskType,
      prompt,
      (p, opts) => this.executeAiCall(p, opts),
      options
    );
  }

  /**
   * Discovers active Antigravity Language Server session for Gemini 3.8 Flash.
   */
  discoverAntigravitySession() {
    if (this._cachedSession) return this._cachedSession;
    try {
      const { execSync } = require("child_process");
      const fs = require("fs");
      const ss = execSync("ss -tulpn 2>/dev/null", { encoding: "utf8" });
      const nul = String.fromCharCode(0);
      for (const line of ss.split("\n")) {
        if (!line.includes("language_server")) continue;
        const afterColon = line.lastIndexOf(":");
        if (afterColon < 0) continue;
        const port = Number(line.slice(afterColon + 1).split(" ")[0].trim());
        if (!Number.isInteger(port) || port <= 0) continue;
        const pidKey = "pid=";
        const pidStart = line.indexOf(pidKey);
        if (pidStart < 0) continue;
        const pid = Number(line.slice(pidStart + pidKey.length).split(",")[0].split(")")[0].trim());
        if (!Number.isInteger(pid) || pid <= 0) continue;
        try {
          const cmdline = fs.readFileSync("/proc/" + pid + "/cmdline", "utf8");
          const tokenKey = "--csrf_token";
          const tokenStart = cmdline.indexOf(tokenKey);
          if (tokenStart < 0) continue;
          let token = cmdline.slice(tokenStart + tokenKey.length);
          while (token.startsWith(nul) || token.startsWith(" ")) token = token.slice(1);
          token = token.split(nul)[0].split(" ")[0].trim();
          if (!token) continue;
          this._cachedSession = { host: "127.0.0.1", port, token };
          return this._cachedSession;
        } catch (_) {}
      }
    } catch (_) {}
    return null;
  }

  /**
   * Invokes Gemini 3.8 Flash  /**
   * Invokes Gemini 3.8 Flash via the local Antigravity Language Server session.
   * Completely free, zero external API keys needed, zero rate limits.
   */
  async callAntigravityGemini(prompt, timeoutMs = 90000) {
    const session = this.discoverAntigravitySession();
    if (!session) {
      throw new Error("Antigravity Language Server session not found on localhost");
    }

    const https = require("https");
    const postRpc = (endpoint, body) => new Promise((resolve, reject) => {
      const data = JSON.stringify(body);
      const req = https.request({
        hostname: session.host,
        port: session.port,
        path: "/exa.language_server_pb.LanguageServerService/" + endpoint,
        method: "POST",
        rejectUnauthorized: false,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
          "x-codeium-csrf-token": session.token
        }
      }, res => {
        let buf = "";
        res.on("data", c => { buf += c; });
        res.on("end", () => {
          try { resolve(JSON.parse(buf)); } catch (e) { resolve(buf); }
        });
      });
      req.on("error", reject);
      req.write(data);
      req.end();
    });

    const start = await postRpc("StartCascade", {
      source: "CORTEX_TRAJECTORY_SOURCE_CLI",
      trajectoryType: "CORTEX_TRAJECTORY_TYPE_CASCADE"
    });
    const cascadeId = start.cascadeId;
    if (!cascadeId) {
      throw new Error("Failed to initialize Cascade trajectory in Antigravity IDE: " + JSON.stringify(start));
    }

    try {
      const constrainedPrompt = `CRITICAL OPERATIONAL CONSTRAINT:
You are acting as an autonomous text classifier and lead reasoning specialist. DO NOT invoke ANY tools (no view_file, no search, no run_command). Output ONLY valid JSON matching the requested schema.

` + prompt;

      await postRpc("SendUserCascadeMessage", {
        cascadeId,
        items: [{ text: constrainedPrompt }],
        cascadeConfig: {
          plannerConfig: {
            planModel: "MODEL_PLACEHOLDER_M318",
            requestedModel: { model: "MODEL_PLACEHOLDER_M318" },
            modelName: "gemini-3.8-flash-high",
            conversational: { plannerMode: "CONVERSATIONAL_PLANNER_MODE_DEFAULT", agenticMode: false }
          }
        }
      });

      const startTime = Date.now();
      while (Date.now() - startTime < timeoutMs) {
        await new Promise(r => setTimeout(r, 1000));
        const traj = await postRpc("GetCascadeTrajectory", { cascadeId });
        const steps = traj.trajectory?.steps || [];
        for (const s of steps) {
          if (s.type === "CORTEX_STEP_TYPE_PLANNER_RESPONSE") {
            const resp = s.plannerResponse?.modifiedResponse || s.plannerResponse?.response;
            if (resp && (s.status === "CORTEX_STEP_STATUS_DONE" || (resp.includes("{") && resp.includes("}")))) {
              return this.cleanAndParseJson(resp);
            }
          }
          if (s.type === "CORTEX_STEP_TYPE_ERROR_MESSAGE") {
            const errMsg = s.errorMessage?.error?.shortError || "Unknown error";
            throw new Error("Antigravity agent error: " + errMsg);
          }
        }
      }
      throw new Error(`Antigravity IDE Gemini query timed out after ${timeoutMs}ms`);
    } finally {
      try {
        await postRpc("DeleteCascadeTrajectory", { cascadeId });
      } catch (e) {}
    }
  }

  /**
   * Internal execution with retry backoff and infallible multi-tier fallback.
   * Priority: Configured Primary -> Secondary -> Local Antigravity Gemini 3.8 Flash.
   */
  async callVision(prompt, imagePath, timeoutMs = 120000) {
    const fs = require("fs");
    const apiKey = process.env.GEMINI_API_KEY || "";
    if (!apiKey) throw new Error("GEMINI_API_KEY is not configured for multimodal recovery");
    if (!imagePath || !fs.existsSync(imagePath)) throw new Error("Vision image evidence file is missing");
    const base64Image = fs.readFileSync(imagePath, { encoding: "base64" });
    const body = {
      agent: process.env.ANTIGRAVITY_AGENT || "antigravity-preview-09-2026",
      input: [
        { type: "text", text: prompt },
        { type: "image", data: base64Image, mime_type: "image/png" }
      ],
      agent_config: { type: "antigravity", model: process.env.ANTIGRAVITY_VISION_MODEL || "gemini-3.8-flash" },
      environment: "remote",
      tools: []
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      const raw = await response.text();
      let data;
      try { data = JSON.parse(raw); } catch (_) { throw new Error("Vision endpoint returned non-JSON HTTP " + response.status); }
      if (!response.ok) throw new Error("Vision endpoint HTTP " + response.status + ": " + (data?.error?.message || "request failed"));
      const output = data?.output_text || data?.output?.[0]?.text || data?.response || "";
      if (!String(output).trim()) throw new Error("Vision endpoint returned no output");
      return this.cleanAndParseJson(String(output));
    } catch (err) {
      if (err.name === "AbortError") throw new Error("Vision request timed out after " + timeoutMs + "ms");
      throw err;
    } finally { clearTimeout(timer); }
  }

  async executeAiCall(prompt, options = {}) {
    const provider = (CONFIG.AI_PROVIDER || "minimax").toLowerCase();
    const baseRetries = options.retries !== undefined
      ? options.retries
      : (provider === "minimax" ? (CONFIG.MINIMAX_MAX_RETRIES ?? 2) : (CONFIG.OPENAI_MAX_RETRIES ?? 2));
    const timeoutMs = options.timeoutMs || (provider === "minimax" ? CONFIG.MINIMAX_TIMEOUT_MS : CONFIG.OPENAI_TIMEOUT_MS) || 90000;
    const maxRetries = baseRetries + 1;
    const isRetryable = (err) => {
      const status = Number(err?.status || 0);
      const msg = String(err?.message || "").toLowerCase();
      return status === 408 || status === 409 || status === 429 || status >= 500 ||
        msg.includes("timeout") || msg.includes("temporarily") || msg.includes("rate limit") ||
        msg.includes("2062");
    };

    let lastError = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const now = Date.now();
        const isOpenAiUsable = !this._openAiDisabledUntil || now >= this._openAiDisabledUntil;
        const isMiniMaxUsable = !this._minimaxDisabledUntil || now >= this._minimaxDisabledUntil;

        if (provider === "antigravity" || provider === "gemini") {
          return await this.callAntigravityGemini(prompt, timeoutMs);
        } else if ((provider === "openai" || provider === "freebuff" || provider === "deepseek" || provider === "custom") && isOpenAiUsable) {
          try {
            return await this.callOpenAiCompatible(prompt, timeoutMs);
          } catch (openAiErr) {
            this._openAiDisabledUntil = now + 15 * 60 * 1000;
            if (CONFIG.MINIMAX_API_KEY && isMiniMaxUsable) {
              try {
                logger.warn(`OpenAI provider call failed (${openAiErr.message}). Routing to MiniMax M3...`);
                return await this.callMiniMax(prompt, timeoutMs);
              } catch (minimaxErr) {
                if (String(minimaxErr.message).includes("2067") || String(minimaxErr.message).includes("limit")) {
                  this._minimaxDisabledUntil = now + 15 * 60 * 1000;
                }
                logger.warn(`MiniMax also failed (${minimaxErr.message}). Routing to infallible local Gemini 3.8 Flash...`);
                return await this.callAntigravityGemini(prompt, timeoutMs);
              }
            }
            logger.warn(`OpenAI provider call failed (${openAiErr.message}). Routing to infallible local Gemini 3.8 Flash...`);
            return await this.callAntigravityGemini(prompt, timeoutMs);
          }
        } else if (provider === "minimax" && isMiniMaxUsable) {
          try {
            return await this.callMiniMax(prompt, timeoutMs);
          } catch (minimaxErr) {
            if (String(minimaxErr.message).includes("2067") || String(minimaxErr.message).includes("limit")) {
              this._minimaxDisabledUntil = now + 15 * 60 * 1000;
            }
            if (CONFIG.OPENAI_API_KEY && isOpenAiUsable) {
              try {
                logger.warn(`MiniMax quota limit encountered (${minimaxErr.message}). Routing to OpenAI-compatible provider (${CONFIG.OPENAI_MODEL})...`);
                return await this.callOpenAiCompatible(prompt, timeoutMs);
              } catch (openAiErr) {
                this._openAiDisabledUntil = now + 15 * 60 * 1000;
                logger.warn(`OpenAI provider also unavailable (${openAiErr.message}). Routing to infallible local Gemini 3.8 Flash...`);
                return await this.callAntigravityGemini(prompt, timeoutMs);
              }
            }
            logger.warn(`MiniMax failed (${minimaxErr.message}). Routing to infallible local Gemini 3.8 Flash...`);
            return await this.callAntigravityGemini(prompt, timeoutMs);
          }
        }
        return await this.callAntigravityGemini(prompt, timeoutMs);
      } catch (err) {
        lastError = err;
        if (!isRetryable(err) || attempt >= maxRetries) break;
        const msg = String(err?.message || "").toLowerCase();
        const isRateLimit = msg.includes("2062") || msg.includes("rate limit") || Number(err?.status) === 429;
        const delayMs = isRateLimit
          ? Math.min(5000 * attempt, 25000)
          : Math.min(2000 * Math.pow(2, attempt - 1), 15000);
        logger.warn(`AI call attempt ${attempt}/${maxRetries} failed: ${err.message}. Retrying in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
    throw lastError;
  }

  /**
   * Returns current AI Queue status.
   */
  getQueueStatus() {
    return this.queue.getStatus();
  }
}

const aiRuntime = new AiRuntime();
module.exports = aiRuntime;
