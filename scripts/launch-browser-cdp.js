/**
 * scripts/launch-browser-cdp.js
 * Universal, cross-platform CDP browser discovery and launcher.
 * Supports:
 *  - Linux (Ubuntu, Debian, Zorin, Fedora, Arch, etc.)
 *  - macOS (Darwin - Intel & Apple Silicon M1/M2/M3/M4)
 *  - Windows (win32 - Windows 10/11)
 *  - Android Termux (Termux:X11 environment)
 *
 * Automatically locates Brave, Google Chrome, or Chromium,
 * preserves existing user data, cookies, and tabs, and ensures port 9222 is active.
 */

const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn, execSync } = require("child_process");

const CDP_PORT = parseInt(process.env.THREADS_CDP_PORT || "9222", 10);
const OS = process.platform;
const IS_TERMUX = !!process.env.PREFIX && process.env.PREFIX.includes("com.termux");

/**
 * Checks if CDP port is open and responding to HTTP.
 */
async function isCdpActive(port = CDP_PORT, timeoutMs = 1500) {
  return new Promise(resolve => {
    const req = http.get(
      {
        hostname: "127.0.0.1",
        port,
        path: "/json/version",
        timeout: timeoutMs
      },
      res => {
        resolve(res.statusCode === 200);
      }
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * Resolves browser executable and user data directory based on platform.
 */
function getPlatformBrowserConfig() {
  const home = process.env.HOME || process.env.USERPROFILE || "";

  if (IS_TERMUX) {
    // Android Termux Environment
    const candidates = [
      `${process.env.PREFIX}/bin/chromium`,
      `${process.env.PREFIX}/bin/brave-browser`,
      "/data/data/com.termux/files/usr/bin/chromium"
    ];
    const bin = candidates.find(c => fs.existsSync(c)) || "chromium";
    const userData = path.join(home, ".config/chromium");
    return {
      platform: "android-termux",
      binary: bin,
      userDataDir: userData,
      display: process.env.DISPLAY || ":1",
      flags: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"]
    };
  }

  if (OS === "darwin") {
    // macOS
    const candidates = [
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
      `${home}/Applications/Brave Browser.app/Contents/MacOS/Brave Browser`,
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      `${home}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`,
      "/Applications/Chromium.app/Contents/MacOS/Chromium"
    ];
    const bin = candidates.find(c => fs.existsSync(c)) || candidates[0];
    const isBrave = bin.includes("Brave");
    const userData = isBrave
      ? path.join(home, "Library/Application Support/BraveSoftware/Brave-Browser")
      : path.join(home, "Library/Application Support/Google/Chrome");

    return {
      platform: "macos",
      binary: bin,
      userDataDir: userData,
      display: null,
      flags: []
    };
  }

  if (OS === "win32") {
    // Windows
    const localAppData = process.env.LOCALAPPDATA || path.join(home, "AppData/Local");
    const programFiles = process.env.ProgramFiles || "C:\\Program Files";
    const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";

    const candidates = [
      path.join(programFiles, "BraveSoftware/Brave-Browser/Application/brave.exe"),
      path.join(programFilesX86, "BraveSoftware/Brave-Browser/Application/brave.exe"),
      path.join(localAppData, "BraveSoftware/Brave-Browser/Application/brave.exe"),
      path.join(programFiles, "Google/Chrome/Application/chrome.exe"),
      path.join(programFilesX86, "Google/Chrome/Application/chrome.exe"),
      path.join(localAppData, "Google/Chrome/Application/chrome.exe")
    ];

    const bin = candidates.find(c => fs.existsSync(c)) || candidates[0];
    const isBrave = bin.toLowerCase().includes("brave");
    const userData = isBrave
      ? path.join(localAppData, "BraveSoftware/Brave-Browser/User Data")
      : path.join(localAppData, "Google/Chrome/User Data");

    return {
      platform: "windows",
      binary: bin,
      userDataDir: userData,
      display: null,
      flags: []
    };
  }

  // Linux (Default)
  const candidates = [
    "/opt/brave.com/brave/brave",
    "/usr/bin/brave-browser",
    "/usr/bin/brave-browser-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser"
  ];
  let bin = candidates.find(c => fs.existsSync(c));
  if (!bin) {
    try {
      bin = execSync("which brave-browser-stable || which brave || which google-chrome || which chromium", { encoding: "utf8" }).trim();
    } catch (e) {
      bin = "/usr/bin/brave-browser";
    }
  }

  const isBrave = bin.toLowerCase().includes("brave");
  const isChrome = bin.toLowerCase().includes("chrome");
  let userData = path.join(home, ".config/BraveSoftware/Brave-Browser");
  if (isChrome) {
    userData = path.join(home, ".config/google-chrome");
  } else if (!isBrave) {
    userData = path.join(home, ".config/chromium");
  }

  return {
    platform: "linux",
    binary: bin,
    userDataDir: userData,
    display: process.env.DISPLAY || ":1",
    flags: []
  };
}

/**
 * Launches the browser detached with remote debugging.
 */
async function launchBrowser() {
  const active = await isCdpActive(CDP_PORT);
  if (active) {
    console.log(`✅ Browser CDP is already active and listening on http://127.0.0.1:${CDP_PORT}`);
    return true;
  }

  const cfg = getPlatformBrowserConfig();
  console.log(`🔍 Detected platform: ${cfg.platform}`);
  console.log(`🚀 Using browser executable: ${cfg.binary}`);
  console.log(`📂 User Data Directory: ${cfg.userDataDir}`);

  // Ensure user data directory exists
  if (!fs.existsSync(cfg.userDataDir)) {
    try {
      fs.mkdirSync(cfg.userDataDir, { recursive: true });
    } catch (e) {}
  }

  // Clean stale lock if present on Linux/macOS
  if (OS !== "win32") {
    const lockFile = path.join(cfg.userDataDir, "SingletonLock");
    if (fs.existsSync(lockFile)) {
      try {
        fs.unlinkSync(lockFile);
      } catch (e) {}
    }
  }

  const args = [
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${cfg.userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--restore-last-session",
    ...cfg.flags
  ];

  const env = { ...process.env };
  if (cfg.display) {
    env.DISPLAY = cfg.display;
  }

  const logFile = path.resolve(__dirname, "../logs/brave.log");
  try {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
  } catch (e) {}
  const out = fs.openSync(logFile, "a");

  console.log(`🌐 Launching detached browser with CDP port ${CDP_PORT}...`);
  const child = spawn(cfg.binary, args, {
    detached: true,
    stdio: ["ignore", out, out],
    env
  });

  child.unref();

  // Poll for port readiness
  for (let i = 1; i <= 15; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const ready = await isCdpActive(CDP_PORT);
    if (ready) {
      console.log(`✅ Browser CDP verified successfully on http://127.0.0.1:${CDP_PORT}!`);
      return true;
    }
    process.stdout.write(`...waiting for CDP (${i}s)\r`);
  }

  console.error(`\n❌ Could not verify CDP port ${CDP_PORT}. Please check ${logFile} for details.`);
  return false;
}

if (require.main === module) {
  launchBrowser()
    .then(success => process.exit(success ? 0 : 1))
    .catch(err => {
      console.error("Error launching browser:", err);
      process.exit(1);
    });
}

module.exports = {
  isCdpActive,
  getPlatformBrowserConfig,
  launchBrowser
};
