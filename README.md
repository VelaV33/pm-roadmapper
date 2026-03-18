# Netstar HW Roadmap — Desktop App

Offline-first Electron desktop app for the Netstar Hardware FY26 Roadmap.  
Auto-saves all data locally. Exports to PDF and Excel.

---

## Quick Start

```bash
npm install
npm start
```
> Requires [Node.js v18+](https://nodejs.org)

---

## Data Storage

All edits are auto-saved to a local JSON file:

| OS | Path |
|---|---|
| Windows | `%APPDATA%\netstar-roadmap\roadmap-data.json` |
| macOS | `~/Library/Application Support/netstar-roadmap/roadmap-data.json` |
| Linux | `~/.config/netstar-roadmap/roadmap-data.json` |

---

## Build Distributable

```bash
npm run build:win    # → dist/*.exe
npm run build:mac    # → dist/*.dmg
npm run build:linux  # → dist/*.AppImage
```

---

## Project Structure

```
├── main.js          # Electron main process (window, IPC, file I/O, PDF)
├── preload.js       # Secure contextBridge API
├── renderer/
│   └── index.html   # Full app UI + all logic
├── package.json
└── README.md
```

---

## Push to GitHub

```bash
git remote add origin https://github.com/YOUR_USERNAME/netstar-roadmap.git
git push -u origin main
```
