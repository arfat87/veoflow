# VeoFlow 🎙️✨

**VeoFlow** is an open-source, context-aware voice dictation and intelligent text injection desktop application for Windows, engineered directly from the architectural teardown of Wispr Flow.

It translates spoken thoughts into polished, properly-formatted text and types it directly into your active window—matching the tone and conventions of your current application (code formatting in VS Code, casual tone in Slack, polished professionalism in Email), without stealing keyboard focus or overwriting clipboard data.

[![Windows 10/11 x64](https://img.shields.io/badge/Platform-Windows%2010%20%2F%2011%20(x64)-0078D6?logo=windows&logoColor=white)](docs/INSTALLATION.md)
[![Release Version](https://img.shields.io/badge/Release-v1.0.0-00C7B7)](RELEASE_NOTES.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Tests Passing](https://img.shields.io/badge/Tests-220%2F220%20Passing-brightgreen)](docs/QA_REPORT.md)

---

## ⚡ Architectural Overview

```
                                          ┌──────────────────────────────────────────────┐
                                          │      Target Window (Active Application)      │
                                          │          (VS Code, Slack, Chrome)            │
                                          └──────▲───────────────────────────────┬───────┘
                                                 │                               │
                                      Simulated  │                      Windows  │
                                   Ctrl+V / Type │               UI Automation   │
                                                 │                               │
                                  ┌──────────────┴───────────────────────────────▼───────┐
                                  │           VeoFlow Helper (VeoFlowHelper.exe)         │
                                  │      Native C# / Win32 Low-Level Hook + UIA Engine   │
                                  └──────────────▲───────────────────────────────┬───────┘
                                                 │                               │
                                    JSON-RPC IPC │                  Global Push- │
                                   (stdin/stdout)│                  to-Talk Event│
                                                 │                               │
┌───────────────────────────┐     ┌──────────────┴───────────────────────────────▼───────┐
│     AI Inference Engine   │◄────┤                   VeoFlow Core                       │
│  • Google Gemini 2.5 Flash│     │                 (Electron Desktop)                   │
│  • Groq Whisper Turbo     │     │                                                      │
│  • Contextual Formatter   ├────►│  • Floating Frameless HUD Pill (Vanilla JS/Canvas)   │
└───────────────────────────┘     │  • Audio Capture (Web Audio API / AnalyserNode)      │
                                  │  • Atomic JSON Storage (~/.veoflow/veoflow_store.json)│
                                  └──────────────────────────────────────────────────────┘
```

### Key Highlights
1. **Zero-Latency Native Windows Helper (`VeoFlowHelper.exe`):**
   - Standalone C# .NET binary compiled via `csc.exe` (~44 KB, 0 external runtime dependencies).
   - Global low-level keyboard hooks (`WH_KEYBOARD_LL`) for push-to-talk (`Ctrl+Alt+Space` or customizable).
   - Key-repeat suppression prevents keystroke leaking into the active window.
   - Active Window Context capture via Windows UI Automation (target executable, window title, focused textbox contents, browser URL).
   - 64-bit compliant Win32 `SendInput` with complete clipboard backup and restoration.
2. **Context-Aware AI Formatting:**
   - Detects target environment: adjusts capitalization, punctuation, and style automatically (code syntax in IDEs vs natural sentences in chat).
   - Instruct Mode: Executes voice directives (e.g., *"translate to Spanish"*, *"format as bullet points"*, *"fix grammar"*).
3. **Multi-Provider AI Speech Engine:**
   - **Google Gemini 2.5 Flash:** Multimodal audio transcription + zero-thought contextual formatter.
   - **Groq Whisper Large v3 Turbo:** Ultra-low latency speech-to-text (<250ms) paired with Groq LLM formatting.
   - **OpenAI Whisper:** Industry standard transcription.
4. **Local Persistence (`~/.veoflow/veoflow_store.json`):**
   - Atomic JSON store for Settings, History logs, Custom Vocabulary / Dictionary, and Voice Snippet expansions.
5. **Modern Glassmorphic Floating HUD:**
   - Non-focusable, draggable, always-on-top overlay that never steals window focus.
   - Real-time 60 FPS audio waveform visualizer driven by HTML5 Canvas.
6. **Hardened Security & Privacy:**
   - API keys encrypted at rest using Windows DPAPI (`safeStorage`).
   - Isolated Electron renderer with zero Node integration and strict Content Security Policy.

---

## 📥 Downloads & Installation

VeoFlow is distributed for 64-bit Windows 10 and 11:

- **Setup Installer (Recommended):** [VeoFlow-Setup-1.0.0-x64.exe](dist_release/VeoFlow-Setup-1.0.0-x64.exe)
  - Full NSIS installer with Start Menu shortcuts and uninstaller.
- **Standalone Portable:** [VeoFlow-Portable-1.0.0-x64.exe](dist_release/VeoFlow-Portable-1.0.0-x64.exe)
  - Zero-installation executable that can run from any folder or USB drive.

For verification instructions, SHA-256 hashes, and SmartScreen guidance, see [docs/INSTALLATION.md](file:///c:/MY_ALL_ITEM/rea/veoflow/docs/INSTALLATION.md).

---

## ⌨️ How to Use

1. **Activate Dictation:**
   - **Push-to-Talk (Default):** Press and hold `Ctrl + Alt + Space` while speaking. Release the hotkey to transcribe and insert.
   - **Tap-to-Toggle:** Tap `Ctrl + Alt + Space` once to start, and tap again to stop.
   - **HUD Click:** Click the microphone icon on the floating HUD pill.
2. **Speak Naturally:**
   - The HUD displays an animated cyan audio visualizer as you speak.
3. **Automatic Insertion:**
   - Upon releasing the hotkey, your speech is transcribed, passed through the contextual LLM formatter, and typed directly into the active text box!
4. **Settings & Customization:**
   - Click the gear icon on the floating HUD or right-click the system tray icon to configure API keys, custom vocabulary, voice snippets, and application rules.

For complete documentation, see the [docs/USER_GUIDE.md](file:///c:/MY_ALL_ITEM/rea/veoflow/docs/USER_GUIDE.md).

---

## 🔨 Building From Source

### Prerequisites
- Windows 10 or 11 (64-bit)
- Node.js v20+ (Node 24 recommended)
- Built-in Windows .NET Framework 4.7.2+ compiler (`csc.exe`)

### Build Steps
```bash
# 1. Clone repository
git clone https://github.com/veoflow/veoflow.git
cd veoflow

# 2. Install dependencies
npm install

# 3. Compile C# Native Helper
cd helper
build.bat
cd ..

# 4. Compile Frontend Views
npm run build:views

# 5. Build Windows Distribution Binaries
npm run build:package
```
Packaged binaries will be located in the `dist_release/` directory.

---

## 🧪 Testing & Verification

VeoFlow includes comprehensive test suites across JavaScript and native C#:

```bash
# Run all Vitest unit and integration tests (211 tests)
npm test

# Run native C# helper test suite (9 tests)
cmd /c "helper\tests\run_tests.bat"
```

For the complete testing audit, see [docs/QA_REPORT.md](file:///c:/MY_ALL_ITEM/rea/veoflow/docs/QA_REPORT.md) and [docs/PERFORMANCE_REPORT.md](file:///c:/MY_ALL_ITEM/rea/veoflow/docs/PERFORMANCE_REPORT.md).

---

## 📚 Documentation Index

- [Installation Guide](docs/INSTALLATION.md) — System requirements, installation steps, SHA-256 verification, and uninstallation.
- [User Guide](docs/USER_GUIDE.md) — Detailed feature walkthrough, HUD states, dictation modes, snippets, and vocabulary.
- [Troubleshooting Guide](docs/TROUBLESHOOTING.md) — Solutions for microphone permissions, hotkey conflicts, insertion errors, and log inspection.
- [Release Notes](RELEASE_NOTES.md) — Version 1.0.0 features, artifact checksums, and disclosures.
- [Changelog](CHANGELOG.md) — Complete milestone and version history.
- [QA Report](docs/QA_REPORT.md) — Full test execution log and matrix.
- [Performance Report](docs/PERFORMANCE_REPORT.md) — Latency benchmarks and resource consumption profiles.
- [Bug Tracker](docs/BUG_TRACKER.md) — Bug audit and resolution ledger.

---

## 📄 License

VeoFlow is licensed under the [MIT License](LICENSE).
