# Release Builds - Meta Automation v1.1.0 (Multi-Platform)

This directory contains official pre-built distribution packages for **Meta Automation v1.1.0** supporting **Linux**, **macOS**, **Windows**, and **Android (Termux + Termux:X11)**.

---

## 📦 Multi-Platform Distribution Bundles

| File | Platform | Format | Size | Description |
|---|---|---|---|---|
| **`meta-automation-linux-x64.tar.gz`** | Linux | `.tar.gz` | ~186 KB | Optimized for Ubuntu, Debian, Zorin OS, Fedora, and Arch. |
| **`meta-automation-macos-universal.tar.gz`** | macOS | `.tar.gz` | ~186 KB | Universal bundle for Apple Silicon (M1/M2/M3/M4) & Intel Macs. |
| **`meta-automation-windows-x64.zip`** | Windows | `.zip` | ~223 KB | Complete Windows package with PowerShell & 1-click batch scripts. |
| **`meta-automation-android-termux.tar.gz`** | Android | `.tar.gz` | ~186 KB | Termux + Termux:X11 pre-configured package with 1-tap launcher. |
| **`meta-automation-universal-v1.1.0.zip`** | Universal | `.zip` | ~223 KB | All-in-one archive containing all platform scripts & installers. |
| **`meta-automation-1.1.0.tgz`** | Node/npm | `.tgz` | ~1.2 MB | Standard npm distribution package. |
| **`SHA256SUMS.txt`** | All | Text | ~600 B | Cryptographic SHA-256 verification hashes for all packages. |

---

## 🚀 1-Click Installation per Platform

### 🐧 Linux
```bash
tar -xzf meta-automation-linux-x64.tar.gz
cd meta-automation
./installers/install-linux.sh
./start-automation
```

### 🍎 macOS
```bash
tar -xzf meta-automation-macos-universal.tar.gz
cd meta-automation
./installers/install-macos.sh
./start-automation
```

### 🪟 Windows
1. Extract `meta-automation-windows-x64.zip`
2. Open PowerShell and run:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\installers\install-windows.ps1
   ```
3. Start automation:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\start-automation.ps1
   ```
   *(Or double-click `start-automation.bat`)*

### 📱 Android (Termux)
```bash
tar -xzf meta-automation-android-termux.tar.gz
cd meta-automation
./installers/install-android-termux.sh
~/start-meta.sh
```

---

*Official release v1.1.0 verified and packaged by [CodeAir Software Solutions](https://www.codeair.tech).*
