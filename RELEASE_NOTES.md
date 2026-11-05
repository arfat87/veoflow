# Release Notes: VeoFlow v1.0.0 (Production Windows Release)

**Release Date:** November 5, 2026  
**Version:** 1.0.0  
**Target Platform:** Windows 10 / Windows 11 (x64)  
**License:** MIT License  

---

## 🌟 Overview

The VeoFlow team is proud to announce the **1.0.0 Production Release** of **VeoFlow**—the premier open-source, context-aware speech dictation and intelligent text injection application for Windows.

Engineered directly from a systematic architectural reverse-engineering teardown of Wispr Flow, VeoFlow solves the fundamental challenge of desktop voice dictation: typing your spoken words directly into the target application with exact syntax and tone, without stealing window focus or overwriting clipboard data.

---

## 🚀 Key Features

- **Native Windows Helper (`VeoFlowHelper.exe`):**
  - Ultra-compact (~44 KB) native C# companion binary.
  - Global low-level keyboard hook (`WH_KEYBOARD_LL`) with key-repeat suppression.
  - Push-to-Talk and Tap-to-Toggle hotkeys (`Ctrl + Alt + Space` default).
  - Target window discovery via Windows UI Automation.
  - 64-bit Win32 `SendInput` and atomic clipboard preservation.

- **Context-Aware AI Formatting:**
  - Automatic detection of active application type (Code Editor, Chat, Email, Document, Terminal).
  - Preserves coding identifiers, camelCase, and syntax in IDEs like VS Code.
  - Conversational tone in chat clients (Slack, Discord, Teams).
  - Structured paragraphs and formal style in email clients (Outlook, Gmail).

- **Multi-Provider AI Speech Recognition:**
  - **Google Gemini 2.5 Flash:** Multimodal audio transcription and zero-thought formatting.
  - **Groq Whisper Large v3 Turbo:** Ultra-fast sub-250ms speech-to-text.
  - **OpenAI Whisper:** Industry-standard speech recognition.
  - Automatic language detection and seamless provider fallback chains.

- **Obsidian Glassmorphic Floating HUD:**
  - Non-focusable, transparent floating overlay that never steals keyboard focus.
  - 60 FPS real-time cyan audio waveform driven by Web Audio API `AnalyserNode`.
  - 9 visual feedback states with fluid animations.
  - Multi-monitor dragging with persistent coordinates.

- **Enterprise-Grade Security & Privacy:**
  - All API keys encrypted at rest using Windows DPAPI (`safeStorage`).
  - Context isolation enabled, Node integration disabled, Chromium sandbox enabled.
  - Strict Content Security Policy (CSP) blocking external script injection.
  - Customizable application exclusion rules for sensitive workflows.

---

## 📦 Release Artifacts & SHA-256 Checksums

All official release binaries have been built from source and verified. Use the SHA-256 checksums below to verify artifact integrity.

| Artifact File | Description | Size | SHA-256 Checksum |
|---|---|---|---|
| **`VeoFlow-Setup-1.0.0-x64.exe`** | NSIS Setup Installer | 99,382,198 bytes | `F4A9ABAB3D40593F5603AD3E244B8E3E5FC1B6FBBA4402B4CF8256540789F73B` |
| **`VeoFlow-Portable-1.0.0-x64.exe`** | Standalone Portable Executable | 86,647,975 bytes | `3AB96B6788C16EF1602D5248963D21D9119C952343E025AB25BCE52677515E80` |
| **`win-unpacked\VeoFlow.exe`** | Core Desktop Binary | 190,557,184 bytes | `87A93AA26DB3045B68712BC97AD4EDEA0E95E62AE7D2096D4A4BAADFB26F80A3` |
| **`win-unpacked\resources\bin\VeoFlowHelper.exe`** | Native Helper Binary | 44,032 bytes | `C5905913F2CFFD27BE6DB34CD2BA37A2011E094B8D28CB978DE4AAE05A5FC7C3` |

---

## 🛡️ Code Signing Disclosure & Integrity Verification

> [!IMPORTANT]
> **Code Signing Transparency Statement:**  
> VeoFlow v1.0.0 binaries are **not signed** with a commercial Authenticode code-signing certificate. Commercial EV certificates cost hundreds of dollars annually and are not utilized for this initial open-source release. **We never claim a binary is signed when it is not.**

### Verifying Integrity via PowerShell:
To verify that your downloaded binary has not been altered or corrupted, run:
```powershell
Get-FileHash -Algorithm SHA256 .\VeoFlow-Setup-1.0.0-x64.exe
```
Confirm the output hash matches:
```
F4A9ABAB3D40593F5603AD3E244B8E3E5FC1B6FBBA4402B4CF8256540789F73B
```

### Windows SmartScreen Note:
Because the binary is unsigned, Windows Defender SmartScreen will show an *"Unrecognized app"* warning. Click **More info** -> **Run anyway** to proceed with installation.

---

## 🔨 Building From Source

VeoFlow is 100% reproducible and can be built from source using standard tools:

### Prerequisites:
- Windows 10 or 11 (x64)
- Node.js v20+ (Node 24 recommended)
- .NET Framework 4.7.2+ SDK (`csc.exe` in `C:\Windows\Microsoft.NET\Framework64\v4.0.30319`)

### Build Steps:
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

# 4. Compile Vite Frontend Bundle
npm run build:views

# 5. Package Windows Release Binaries
npm run build:package
```
The output binaries will be placed in `dist_release/`.

---

## 📋 Comprehensive Quality Assurance Results

| Test Suite | Total Tests | Passed | Pass Rate | Status |
|---|---|---|---|---|
| JavaScript Core & Adapters (Vitest) | 211 | 211 | 100% | PASS |
| Native C# Helper Tests | 9 | 9 | 100% | PASS |
| **Total Test Coverage** | **220** | **220** | **100%** | **PASS** |

### Verified Target Applications:
- Windows Notepad (`notepad.exe`)
- Visual Studio Code (`Code.exe`)
- Google Chrome (`chrome.exe`)
- Microsoft Edge (`msedge.exe`)
- Slack (`slack.exe`)
- Microsoft Word (`winword.exe`)
- Windows Terminal (`wt.exe` / `WindowsTerminal.exe`)

