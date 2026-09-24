"use strict";

const http = require("http");
const { execFileSync } = require("child_process");

const port = Number(process.env.THREADS_CDP_PORT || process.env.CDP_PORT || 9222);

function active() {
  return new Promise(resolve => {
    const req = http.get({ hostname: "127.0.0.1", port, path: "/json/version", timeout: 1200 }, res => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(false); });
  });
}

function commandExists(name) {
  try {
    execFileSync("sh", ["-lc", "command -v " + name], { stdio: "ignore" });
    return true;
  } catch (_) { return false; }
}

async function bridgeAndroidChrome() {
  if (await active()) {
    console.log("✅ CDP already reachable on http://127.0.0.1:" + port);
    return true;
  }
  const isTermux = String(process.env.PREFIX || "").includes("com.termux");
  if (!isTermux || !commandExists("adb")) return false;

  try {
    const devices = execFileSync("adb", ["devices"], { encoding: "utf8", timeout: 5000 });
    const connected = devices.split("\n").slice(1).some(line => line.includes("\tdevice"));
    if (!connected) {
      console.log("ℹ️  ADB is installed but no authorized Android device session is connected.");
      return false;
    }
    execFileSync("adb", ["forward", "tcp:" + port, "localabstract:chrome_devtools_remote"], {
      stdio: "ignore",
      timeout: 5000
    });
    if (await active()) {
      console.log("✅ Android Chrome CDP bridged through ADB on http://127.0.0.1:" + port);
      return true;
    }
  } catch (err) {
    console.log("ℹ️  Android Chrome ADB bridge unavailable: " + err.message);
  }
  return false;
}

if (require.main === module) {
  bridgeAndroidChrome().then(ok => process.exit(ok ? 0 : 1));
}

module.exports = { bridgeAndroidChrome };
