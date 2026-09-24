/**
 * scripts/launch-browser-cdp.js
 * Universal, cross-platform, multi-browser CDP discovery and launcher.
 *
 * Supported Browsers:
 *  - Google Chrome (Default on Android & most PCs/Macs)
 *  - Microsoft Edge (Default on Windows 10/11, available on macOS & Linux)
 *  - Brave Browser (Privacy & Web3 focused)
 *  - Chromium / Ungoogled Chromium (Default on Termux, Raspberry Pi & Linux)
 *
 * Supported Operating Systems:
 *  - Linux (Ubuntu, Debian, Zorin, Fedora, Arch, etc.)
 *  - macOS (Darwin - Intel & Apple Silicon M1/M2/M3/M4)
 *  - Windows (win32 - Windows 10 / 11)
 *  - Android Termux (Termux:X11 mobile environment)
 *
 * Features:
 *  1. Auto-detects system default browser or running browser session.
 *  2. Supports explicit choice via CLI flag (`--browser=chrome|edge|brave|chromium|auto`)
 *     or environment variable (`BROWSER_TYPE=chrome`).
 *  3. Connects to existing tabs/sessions without losing logins or cookies.
 *  4. Automatically starts remote debugging (CDP) on port 9222.
 */

const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn, execSync } = require("child_process");

const CDP_PORT = parseInt(process.env.THREADS_CDP_PORT || process.env.CDP_PORT || "9222", 10);
const OS = process.platform;
const IS_TERMUX = !!process.env.PREFIX && process.env.PREFIX.includes("com.termux");

/**
 * Fast check whether CDP port 9222 is active and responding over HTTP.
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
 * Returns user home directory cross-platform.
 */
function getHomeDir() {
  return process.env.HOME || process.env.USERPROFILE || "";
}

/**
 * Catalog of known browser binaries and profile paths across platforms.
 */
function getBrowserCatalog() {
  const home = getHomeDir();

  if (IS_TERMUX) {
    const prefix = process.env.PREFIX || "/data/data/com.termux/files/usr";
    return {
      chromium: {
        name: "Chromium (Termux)",
        type: "chromium",
        binaries: [`${prefix}/bin/chromium`, "/data/data/com.termux/files/usr/bin/chromium"],
        userDataDir: path.join(home, ".config/chromium"),
        flags: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"]
      },
      brave: {
        name: "Brave (Termux)",
        type: "brave",
        binaries: [`${prefix}/bin/brave-browser`, `${prefix}/bin/brave`],
        userDataDir: path.join(home, ".config/chromium"),
        flags: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"]
      },
      chrome: {
        name: "Chrome / Chromium (Termux)",
        type: "chrome",
        binaries: [`${prefix}/bin/chromium`],
        userDataDir: path.join(home, ".config/chromium"),
        flags: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"]
      },
      edge: {
        name: "Edge / Chromium (Termux)",
        type: "edge",
        binaries: [`${prefix}/bin/chromium`],
        userDataDir: path.join(home, ".config/chromium"),
        flags: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"]
      }
    };
  }

  if (OS === "darwin") {
    // macOS
    return {
      chrome: {
        name: "Google Chrome",
        type: "chrome",
        binaries: [
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          path.join(home, "Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
        ],
        userDataDir: path.join(home, "Library/Application Support/Google/Chrome"),
        flags: []
      },
      edge: {
        name: "Microsoft Edge",
        type: "edge",
        binaries: [
          "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
          path.join(home, "Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge")
        ],
        userDataDir: path.join(home, "Library/Application Support/Microsoft Edge"),
        flags: []
      },
      brave: {
        name: "Brave Browser",
        type: "brave",
        binaries: [
          "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
          path.join(home, "Applications/Brave Browser.app/Contents/MacOS/Brave Browser")
        ],
        userDataDir: path.join(home, "Library/Application Support/BraveSoftware/Brave-Browser"),
        flags: []
      },
      chromium: {
        name: "Chromium",
        type: "chromium",
        binaries: [
          "/Applications/Chromium.app/Contents/MacOS/Chromium",
          path.join(home, "Applications/Chromium.app/Contents/MacOS/Chromium")
        ],
        userDataDir: path.join(home, "Library/Application Support/Chromium"),
        flags: []
      }
    };
  }

  if (OS === "win32") {
    // Windows
    const localAppData = process.env.LOCALAPPDATA || path.join(home, "AppData/Local");
    const programFiles = process.env.ProgramFiles || "C:\\Program Files";
    const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";

    return {
      chrome: {
        name: "Google Chrome",
        type: "chrome",
        binaries: [
          path.join(programFiles, "Google/Chrome/Application/chrome.exe"),
          path.join(programFilesX86, "Google/Chrome/Application/chrome.exe"),
          path.join(localAppData, "Google/Chrome/Application/chrome.exe")
        ],
        userDataDir: path.join(localAppData, "Google/Chrome/User Data"),
        flags: []
      },
      edge: {
        name: "Microsoft Edge",
        type: "edge",
        binaries: [
          path.join(programFilesX86, "Microsoft/Edge/Application/msedge.exe"),
          path.join(programFiles, "Microsoft/Edge/Application/msedge.exe"),
          path.join(localAppData, "Microsoft/Edge/Application/msedge.exe")
        ],
        userDataDir: path.join(localAppData, "Microsoft/Edge/User Data"),
        flags: []
      },
      brave: {
        name: "Brave Browser",
        type: "brave",
        binaries: [
          path.join(programFiles, "BraveSoftware/Brave-Browser/Application/brave.exe"),
          path.join(programFilesX86, "BraveSoftware/Brave-Browser/Application/brave.exe"),
          path.join(localAppData, "BraveSoftware/Brave-Browser/Application/brave.exe")
        ],
        userDataDir: path.join(localAppData, "BraveSoftware/Brave-Browser/User Data"),
        flags: []
      },
      chromium: {
        name: "Chromium",
        type: "chromium",
        binaries: [
          path.join(localAppData, "Chromium/Application/chrome.exe"),
          path.join(programFiles, "Chromium/Application/chrome.exe")
        ],
        userDataDir: path.join(localAppData, "Chromium/User Data"),
        flags: []
      }
    };
  }

  // Linux (Default)
  return {
    chrome: {
      name: "Google Chrome",
      type: "chrome",
      binaries: [
        "/usr/bin/google-chrome-stable",
        "/usr/bin/google-chrome",
        "/opt/google/chrome/chrome",
        "/usr/bin/chrome"
      ],
      userDataDir: path.join(home, ".config/google-chrome"),
      flags: []
    },
    edge: {
      name: "Microsoft Edge",
      type: "edge",
      binaries: [
        "/usr/bin/microsoft-edge-stable",
        "/usr/bin/microsoft-edge",
        "/opt/microsoft/msedge/msedge"
      ],
      userDataDir: path.join(home, ".config/microsoft-edge"),
      flags: []
    },
    brave: {
      name: "Brave Browser",
      type: "brave",
      binaries: [
        "/opt/brave.com/brave/brave",
        "/usr/bin/brave-browser-stable",
        "/usr/bin/brave-browser",
        "/usr/bin/brave"
      ],
      userDataDir: path.join(home, ".config/BraveSoftware/Brave-Browser"),
      flags: []
    },
    chromium: {
      name: "Chromium",
      type: "chromium",
      binaries: [
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
        "/snap/bin/chromium"
      ],
      userDataDir: path.join(home, ".config/chromium"),
      flags: []
    }
  };
}

/**
 * Detects the system default web browser handler.
 */
function detectSystemDefaultBrowser() {
  if (IS_TERMUX) {
    return "chromium";
  }

  if (OS === "linux") {
    try {
      const out = execSync("xdg-settings get default-web-browser 2>/dev/null", { encoding: "utf8" }).toLowerCase();
      if (out.includes("chrome")) return "chrome";
      if (out.includes("edge")) return "edge";
      if (out.includes("brave")) return "brave";
      if (out.includes("chromium")) return "chromium";
    } catch (e) {}
  }

  if (OS === "win32") {
    try {
      const out = execSync(
        'reg query "HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\http\\UserChoice" /v ProgId 2>nul',
        { encoding: "utf8" }
      ).toLowerCase();
      if (out.includes("chrome")) return "chrome";
      if (out.includes("edge") || out.includes("msedge")) return "edge";
      if (out.includes("brave")) return "brave";
    } catch (e) {}
  }

  return null;
}

/**
 * Detects if a supported browser is currently running.
 */
function detectRunningBrowser() {
  if (OS === "win32") {
    try {
      const tasklist = execSync("tasklist /FO CSV /NH 2>nul", { encoding: "utf8" }).toLowerCase();
      if (tasklist.includes("brave.exe")) return "brave";
      if (tasklist.includes("chrome.exe")) return "chrome";
      if (tasklist.includes("msedge.exe")) return "edge";
    } catch (e) {}
  } else {
    try {
      const pgrep = execSync("ps -A -o comm= 2>/dev/null", { encoding: "utf8" }).toLowerCase();
      if (pgrep.includes("brave")) return "brave";
      if (pgrep.includes("chrome")) return "chrome";
      if (pgrep.includes("edge") || pgrep.includes("msedge")) return "edge";
      if (pgrep.includes("chromium")) return "chromium";
    } catch (e) {}
  }
  return null;
}

/**
 * Resolves the selected browser configuration.
 * Preference hierarchy:
 *  1. Explicit CLI argument (--browser=chrome|edge|brave|chromium)
 *  2. Environment variable BROWSER_TYPE / BROWSER
 *  3. Running browser process (if user is actively browsing with one)
 *  4. System default web browser
 *  5. First available installed browser from catalog (Brave -> Chrome -> Edge -> Chromium)
 */
function resolveBrowser(preference = null) {
  const catalog = getBrowserCatalog();

  // Parse command line flag if preference not passed
  let chosenType = preference;
  if (!chosenType) {
    const arg = process.argv.find(a => a.startsWith("--browser="));
    if (arg) {
      chosenType = arg.split("=")[1].trim().toLowerCase();
    }
  }

  if (!chosenType || chosenType === "auto") {
    chosenType = (process.env.BROWSER_TYPE || process.env.BROWSER || "").trim().toLowerCase();
  }

  // 1. If explicit valid browser chosen
  if (chosenType && chosenType !== "auto" && catalog[chosenType]) {
    const item = catalog[chosenType];
    const bin = item.binaries.find(b => fs.existsSync(b));
    if (bin) {
      return {
        ...item,
        binary: bin,
        display: (OS === "linux" || IS_TERMUX) ? (process.env.DISPLAY || ":1") : null
      };
    }
  }

  // 2. Running browser on system
  const running = detectRunningBrowser();
  if (running && catalog[running]) {
    const item = catalog[running];
    const bin = item.binaries.find(b => fs.existsSync(b));
    if (bin) {
      return {
        ...item,
        binary: bin,
        display: (OS === "linux" || IS_TERMUX) ? (process.env.DISPLAY || ":1") : null
      };
    }
  }

  // 3. System default web browser
  const defaultBrowser = detectSystemDefaultBrowser();
  if (defaultBrowser && catalog[defaultBrowser]) {
    const item = catalog[defaultBrowser];
    const bin = item.binaries.find(b => fs.existsSync(b));
    if (bin) {
      return {
        ...item,
        binary: bin,
        display: (OS === "linux" || IS_TERMUX) ? (process.env.DISPLAY || ":1") : null
      };
    }
  }

  // 4. Installed browser search order: Brave -> Chrome -> Edge -> Chromium
  const priorityOrder = ["brave", "chrome", "edge", "chromium"];
  for (const type of priorityOrder) {
    const item = catalog[type];
    if (!item) continue;
    const bin = item.binaries.find(b => fs.existsSync(b));
    if (bin) {
      return {
        ...item,
        binary: bin,
        display: (OS === "linux" || IS_TERMUX) ? (process.env.DISPLAY || ":1") : null
      };
    }
  }

  // 5. Fallback via 'which' command on Unix
  if (OS !== "win32") {
    for (const cmd of ["brave-browser-stable", "brave", "google-chrome-stable", "google-chrome", "microsoft-edge-stable", "microsoft-edge", "chromium"]) {
      try {
        const found = execSync(`which ${cmd} 2>/dev/null`, { encoding: "utf8" }).trim();
        if (found && fs.existsSync(found)) {
          const type = found.includes("chrome") ? "chrome" : found.includes("edge") ? "edge" : found.includes("chromium") ? "chromium" : "brave";
          const item = catalog[type] || catalog.chromium;
          return {
            ...item,
            binary: found,
            display: (OS === "linux" || IS_TERMUX) ? (process.env.DISPLAY || ":1") : null
          };
        }
      } catch (e) {}
    }
  }

  throw new Error(
    "No supported Chromium-based browser (Chrome, Edge, Brave, or Chromium) was detected.\n" +
    "Please install Google Chrome, Microsoft Edge, or Brave Browser on this system."
  );
}

/**
 * Launches the resolved browser with remote debugging on port 9222.
 */
async function launchBrowser(preference = null) {
  const active = await isCdpActive(CDP_PORT);
  if (active) {
    console.log(`✅ Browser CDP is already active and listening on http://127.0.0.1:${CDP_PORT}`);
    return true;
  }

  const browser = resolveBrowser(preference);
  console.log(`🔍 Detected Browser: ${browser.name} (${browser.type})`);
  console.log(`🚀 Executable: ${browser.binary}`);
  console.log(`📂 User Data: ${browser.userDataDir}`);

  const shouldRestart = process.argv.includes("--restart") || process.argv.includes("-r");
  const runningType = detectRunningBrowser();
  if ((runningType && !active) || shouldRestart) {
    console.log(`🔄 Restarting ${browser.name} to activate CDP debugging on port ${CDP_PORT} (preserving tabs & logins)...`);
    try {
      if (OS === "win32") {
        const exe = browser.type === "brave" ? "brave.exe" : browser.type === "chrome" ? "chrome.exe" : browser.type === "edge" ? "msedge.exe" : "chrome.exe";
        execSync(`taskkill /IM ${exe} 2>nul`, { stdio: "ignore" });
      } else {
        execSync(`pkill -TERM -f "${browser.binary}" 2>/dev/null || pkill -TERM -f "${browser.type}" 2>/dev/null || true`, { stdio: "ignore" });
      }
      await new Promise(r => setTimeout(r, 2000));
    } catch (e) {}
  }

  // Create user data directory if needed
  if (!fs.existsSync(browser.userDataDir)) {
    try {
      fs.mkdirSync(browser.userDataDir, { recursive: true });
    } catch (e) {}
  }

  // Remove stale SingletonLock on Unix
  if (OS !== "win32") {
    const lockFile = path.join(browser.userDataDir, "SingletonLock");
    if (fs.existsSync(lockFile)) {
      try {
        fs.unlinkSync(lockFile);
      } catch (e) {}
    }
  }

  const args = [
    `--remote-debugging-port=${CDP_PORT}`,
    "--remote-debugging-address=127.0.0.1",
    `--user-data-dir=${browser.userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--restore-last-session",
    ...(browser.flags || [])
  ];

  const env = { ...process.env };
  if (browser.display) {
    env.DISPLAY = browser.display;
  }

  const logFile = path.resolve(__dirname, "../logs/browser.log");
  try {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
  } catch (e) {}
  const out = fs.openSync(logFile, "a");

  console.log(`🌐 Starting ${browser.name} with CDP remote port ${CDP_PORT}...`);
  const child = spawn(browser.binary, args, {
    detached: true,
    stdio: ["ignore", out, out],
    env
  });

  child.unref();

  // Poll port 9222
  for (let i = 1; i <= 15; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const ready = await isCdpActive(CDP_PORT);
    if (ready) {
      console.log(`✅ ${browser.name} CDP successfully verified on http://127.0.0.1:${CDP_PORT}!`);
      return true;
    }
    process.stdout.write(`...connecting to CDP (${i}s)\r`);
  }

  console.error(`\n❌ Could not verify CDP port ${CDP_PORT}. Please check ${logFile} for details.`);
  return false;
}

if (require.main === module) {
  launchBrowser()
    .then(success => process.exit(success ? 0 : 1))
    .catch(err => {
      console.error("Error launching browser:", err.message);
      process.exit(1);
    });
}

module.exports = {
  isCdpActive,
  getBrowserCatalog,
  resolveBrowser,
  detectSystemDefaultBrowser,
  detectRunningBrowser,
  launchBrowser
};
