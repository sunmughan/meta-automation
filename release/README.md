# Release Builds - Meta Automation v1.0.0

This directory contains pre-built distribution packages for **Meta Automation v1.0.0**.

---

## 📦 Package Distribution Files

| File | Size | Format | Description |
|---|---|---|---|
| **`meta-automation-1.0.0.tgz`** | ~330 KB | npm Tarball | Standard npm pack distribution. Installable via `npm install ./meta-automation-1.0.0.tgz`. |
| **`meta-automation-v1.0.0.tar.gz`** | ~176 KB | Standalone Archive | Complete source and script distribution without runtime bloat or state files. |
| **`SHA256SUMS.txt`** | Text | Checksums | Cryptographic SHA-256 hashes to verify release package integrity. |

---

## 🚀 Quick Install from Release Bundle

```bash
# Extract the standalone archive
tar -xzf meta-automation-v1.0.0.tar.gz -C /opt/meta-automation
cd /opt/meta-automation

# Install dependencies
npm install

# Launch automation daemon
./start-automation
```

---

*Official release build verified and packaged by [CodeAir Software Solutions](https://www.codeair.tech).*
