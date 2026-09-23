/**
 * src/ai/ai-runtime.js
 * Primary AI runtime for CodeAir Threads + Instagram System.
 * Pure Antigravity AI Agent runtime (agy / Antigravity SDK).
 * Enforces structured JSON schema parsing, queue-based concurrency governance, and resilient execution.
 */

const { spawn, execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const CONFIG = require("../../config");
const logger = require("../logging/logger");

/**
 * In-memory Asynchronous Queue & Concurrency Worker for Antigravity AI calls.
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
      this.processNext();
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
    this.model = CONFIG.MODEL || "gemini-3.8-flash-high";
    const maxConcurrency = Math.max(1, Number(process.env.AI_MAX_CONCURRENCY) || 3);
    this.queue = new AiQueue(maxConcurrency);
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
   * Resolves the Antigravity CLI binary location cross-platform:
   * 1. AGY_BIN environment variable override
   * 2. Termux prefix ($PREFIX/bin/agy or /data/data/com.termux/files/usr/bin/agy)
   * 3. User local bin: $HOME/.local/bin/agy or %USERPROFILE%\.local\bin\agy
   * 4. System PATH lookup via which/where
   * 5. Local repository runner: scripts/agy
   * 6. Default command: 'agy'
   */
  resolveAgyBinary() {
    if (process.env.AGY_BIN && fs.existsSync(process.env.AGY_BIN)) {
      return process.env.AGY_BIN;
    }

    const home = process.env.HOME || process.env.USERPROFILE || "";
    const termuxPrefix = process.env.PREFIX || "/data/data/com.termux/files/usr";
    const termuxAgy = path.join(termuxPrefix, "bin/agy");
    if (fs.existsSync(termuxAgy)) {
      return termuxAgy;
    }

    const localBinAgy = path.join(home, ".local/bin/agy");
    if (fs.existsSync(localBinAgy)) {
      return localBinAgy;
    }

    try {
      const lookupCmd = process.platform === "win32" ? "where agy 2>nul" : "which agy 2>/dev/null";
      const found = execSync(lookupCmd, { encoding: "utf8" }).split(/\r?\n/)[0].trim();
      if (found && fs.existsSync(found)) {
        return found;
      }
    } catch (e) {}

    const repoAgy = path.resolve(__dirname, "../../scripts/agy");
    if (fs.existsSync(repoAgy)) {
      return repoAgy;
    }

    return "agy";
  }

  /**
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
          ...(CONFIG.MINIMAX_THINKING === "true" ? { thinking: { type: "enabled" } } : {})
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
   * Internal execution with retry backoff.
   * Uses exponential backoff for 429/RESOURCE_EXHAUSTED errors (3s → 8s → 20s).
   * Uses linear backoff for other transient errors (1.5s → 3s).
   */
  async executeAiCall(prompt, options = {}) {
    const baseRetries = options.retries !== undefined ? options.retries : 2;
    const timeoutMs = options.timeoutMs || 90000;
    let lastError = null;

    // For 429 errors, allow up to 3 retries with exponential backoff
    const maxRetries = baseRetries + 1; // 3 attempts total
    const is429Error = (err) => err && err.message && (
      err.message.includes("RESOURCE_EXHAUSTED") || 
      err.message.includes("429") || 
      err.message.includes("quota")
    );

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.callAntigravityCli(prompt, timeoutMs);
      } catch (err) {
        lastError = err;
        if (err.code === "ENOENT") {
          // Binary not found on system PATH; abort immediately
          break;
        }
        if (attempt < maxRetries) {
          let delayMs;
          if (is429Error(err)) {
            // Exponential backoff for rate limits: 3s, 8s, 20s
            delayMs = Math.min(3000 * Math.pow(2.5, attempt - 1), 30000);
            logger.warn(`Antigravity AI call attempt ${attempt}/${maxRetries} rate-limited (429). Backing off ${Math.round(delayMs/1000)}s...`);
          } else {
            // Linear backoff for other errors: 1.5s, 3s
            delayMs = attempt * 1500;
            logger.warn(`Antigravity AI call attempt ${attempt}/${maxRetries} failed: ${err.message}. Retrying in ${delayMs}ms...`);
          }
          await new Promise(r => setTimeout(r, delayMs));
        }
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
