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
| **`VeoFlow-Setup-1.0.0-x64.exe`** | NSIS Setup Installer | 99,385,066 bytes | `DC70A12BA2607ADC52A4D9484ABABC09D2ED7855A86C1E5C099737773AF92018` |
| **`VeoFlow-Portable-1.0.0-x64.exe`** | Standalone Portable Executable | 86,658,615 bytes | `DA625847894ADFF702A654A6D4E63B4B661BC5731405AEC6B33865A4E65C5C25` |
| **`win-unpacked\VeoFlow.exe`** | Core Desktop Binary | 190,557,184 bytes | `B826695B544127A5C2BFF73FE361C53BEB41BC2EB20A8B97551C591CD142C359` |
| **`win-unpacked\resources\bin\VeoFlowHelper.exe`** | Native Helper Binary | 47,616 bytes | `4599C3E0737CEE185054F10E9125F995373D14624EE3032BD7D2B5DDA51B1860` |

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
DC70A12BA2607ADC52A4D9484ABABC09D2ED7855A86C1E5C099737773AF92018
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

