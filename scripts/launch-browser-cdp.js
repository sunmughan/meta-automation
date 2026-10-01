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
        binaries: [`${prefix}/bin/chromium-browser`, `${prefix}/bin/chromium`, "/data/data/com.termux/files/usr/bin/chromium-browser", "/data/data/com.termux/files/usr/bin/chromium"],
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
        binaries: [`${prefix}/bin/chromium-browser`, `${prefix}/bin/chromium`],
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
 * Detects an active, responsive X11 display using xdpyinfo.
 * Checks candidate displays (:0, :1, :2) or $DISPLAY.
 */
function detectActiveDisplay() {
  if (OS !== "linux" && !IS_TERMUX) return null;
  const candidates = [process.env.DISPLAY, ":0", ":1", ":2"].filter(Boolean);
  for (const disp of candidates) {
    try {
      const out = execSync(`xdpyinfo -display "${disp}" 2>/dev/null`, { encoding: "utf8" });
      if (out && out.includes("dimensions:")) {
        return disp;
      }
    } catch (_) {}
  }
  return null;
}

/**
 * Checks whether headless browser mode is requested or required.
 */
function isHeadlessMode(activeDisplay = null) {
  const forceHeadless = process.argv.includes("--headless") ||
                        process.argv.includes("-h") ||
                        process.env.BROWSER_HEADLESS === "1" ||
                        process.env.BROWSER_HEADLESS === "true";
  if (forceHeadless) return true;

  // On Linux/Termux, if no active X11 display is connected, headless is mandatory
  if ((OS === "linux" || IS_TERMUX) && !activeDisplay) {
    return true;
  }

  return false;
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
  const activeDisplay = detectActiveDisplay();
  const headless = isHeadlessMode(activeDisplay);

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
    return {
      ...item,
      binary: bin || item.binaries[0],
      display: activeDisplay,
      headless,
      installed: !!bin
    };
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
        display: activeDisplay,
        headless,
        installed: true
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
        display: activeDisplay,
        headless,
        installed: true
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
        display: activeDisplay,
        headless,
        installed: true
      };
    }
  }

  // 5. Fallback via 'which' command on Unix
  if (OS !== "win32") {
    for (const cmd of ["brave-browser-stable", "brave", "google-chrome-stable", "google-chrome", "microsoft-edge-stable", "microsoft-edge", "chromium-browser", "chromium"]) {
      try {
        const found = execSync(`which ${cmd} 2>/dev/null`, { encoding: "utf8" }).trim();
        if (found && fs.existsSync(found)) {
          const type = found.includes("chrome") ? "chrome" : found.includes("edge") ? "edge" : found.includes("chromium") ? "chromium" : "brave";
          const item = catalog[type] || catalog.chromium;
          return {
            ...item,
            binary: found,
            display: activeDisplay,
            headless,
            installed: true
          };
        }
      } catch (e) {}
    }
  }

  // 6. Fallback default browser from catalog if no binary is currently installed
  const defaultType = IS_TERMUX ? "chromium" : "chrome";
  const defaultItem = catalog[defaultType] || catalog.chromium || catalog.chrome;
  return {
    ...defaultItem,
    binary: defaultItem.binaries[0],
    display: activeDisplay,
    headless,
    installed: false
  };
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
  if (!browser.installed && !fs.existsSync(browser.binary)) {
    throw new Error(
      "No supported Chromium-based browser (Chrome, Edge, Brave, or Chromium) was detected.\n" +
      "Please install Google Chrome, Microsoft Edge, or Brave Browser on this system."
    );
  }
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

  // Detect screen dimensions for Termux / Linux
  let screenWidth = 1440;
  let screenHeight = 2708;
  if (!browser.headless && (OS === "linux" || IS_TERMUX) && browser.display) {
    try {
      const xdpy = execSync(`xdpyinfo -display "${browser.display}" 2>/dev/null`, { encoding: "utf8" });
      const m = xdpy.match(/dimensions:\s+(\d+)x(\d+)\s+pixels/i);
      if (m) {
        screenWidth = parseInt(m[1], 10);
        screenHeight = parseInt(m[2], 10);
      }
    } catch (e) {}
  }

  const isHeadless = browser.headless;
  if (isHeadless) {
    console.log("👻 Running in resilient Headless Mode (--headless=new, zero display dependency).");
  } else {
    console.log(`🖥️ Running in GUI Mode (Display: ${browser.display || ":0"}).`);
  }

  const args = [
    `--remote-debugging-port=${CDP_PORT}`,
    "--remote-debugging-address=127.0.0.1",
    `--user-data-dir=${browser.userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--restore-last-session",
    "--force-device-scale-factor=1",
    ...(browser.flags || [])
  ];

  if (isHeadless) {
    args.push(
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      `--window-size=${screenWidth},${screenHeight}`
    );
  } else {
    args.push(
      "--start-maximized",
      "--window-position=0,0",
      `--window-size=${screenWidth},${screenHeight}`
    );
  }

  const env = { ...process.env };
  if (!isHeadless && browser.display) {
    env.DISPLAY = browser.display;
  } else if (isHeadless) {
    delete env.DISPLAY;
  }

  const logFile = path.resolve(__dirname, "../logs/browser.log");
  try {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
  } catch (e) {}
  const out = fs.openSync(logFile, "a");

  console.log(`🌐 Starting ${browser.name} with CDP remote port ${CDP_PORT} (${isHeadless ? "Headless" : `fullscreen ${screenWidth}x${screenHeight}`})...`);
  let child = spawn(browser.binary, args, {
    detached: true,
    stdio: ["ignore", out, out],
    env
  });

  child.unref();

  // Poll port 9222
  let cdpConnected = false;
  const pollLimit = isHeadless ? 15 : 7;
  for (let i = 1; i <= pollLimit; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const ready = await isCdpActive(CDP_PORT);
    if (ready) {
      cdpConnected = true;
      break;
    }
    process.stdout.write(`...connecting to CDP (${i}s)\r`);
  }

  // Automatic GUI-to-Headless recovery on Android/Linux
  if (!cdpConnected && !isHeadless && (IS_TERMUX || OS === "linux")) {
    console.warn(`\n⚠️ Display (${browser.display || "GUI"}) could not connect CDP within ${pollLimit}s (Termux:X11 may have disconnected).`);
    console.log("🛡️ Automatically recovering into Headless Mode (--headless=new) for guaranteed uptime...");
    try {
      execSync(`pkill -TERM -f "${browser.binary}" 2>/dev/null || true`, { stdio: "ignore" });
    } catch (_) {}
    await new Promise(r => setTimeout(r, 1000));

    const fallbackArgs = [
      `--remote-debugging-port=${CDP_PORT}`,
      "--remote-debugging-address=127.0.0.1",
      `--user-data-dir=${browser.userDataDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--restore-last-session",
      "--force-device-scale-factor=1",
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      `--window-size=${screenWidth},${screenHeight}`,
      ...(browser.flags || [])
    ];
    const fallbackEnv = { ...process.env };
    delete fallbackEnv.DISPLAY;

    child = spawn(browser.binary, fallbackArgs, {
      detached: true,
      stdio: ["ignore", out, out],
      env: fallbackEnv
    });
    child.unref();

    for (let i = 1; i <= 12; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const ready = await isCdpActive(CDP_PORT);
      if (ready) {
        cdpConnected = true;
        break;
      }
      process.stdout.write(`...headless recovery (${i}s)\r`);
    }
  }

  if (cdpConnected) {
    console.log(`\n✅ ${browser.name} CDP successfully verified on http://127.0.0.1:${CDP_PORT}!`);
    // Maximize browser windows via CDP only in GUI mode
    if (!isHeadless) {
      try {
        const puppeteer = require("puppeteer-core");
        const conn = await puppeteer.connect({ browserURL: `http://127.0.0.1:${CDP_PORT}`, defaultViewport: null });
        const targets = await conn.targets();
        for (const t of targets) {
          if (t.type() === "page") {
            try {
              const c = await t.createCDPSession();
              const { windowId } = await c.send("Browser.getWindowForTarget");
              if (windowId) {
                await c.send("Browser.setWindowBounds", {
                  windowId,
                  bounds: { left: 0, top: 0, width: screenWidth, height: screenHeight, windowState: "normal" }
                }).catch(() => {});
                await c.send("Browser.setWindowBounds", {
                  windowId,
                  bounds: { windowState: "maximized" }
                }).catch(() => {});
              }
              await c.detach().catch(() => {});
            } catch (_) {}
          }
        }
        await conn.disconnect().catch(() => {});
      } catch (e) {}
    }
    return true;
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
  detectActiveDisplay,
  isHeadlessMode,
  launchBrowser
};

