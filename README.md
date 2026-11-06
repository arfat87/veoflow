# VeoFlow 🎙️✨

**VeoFlow** is an open-source, intelligent, context-aware voice dictation and desktop text injection assistant for Windows, engineered directly from the comprehensive architectural teardown of Wispr Flow.

It translates natural human speech into polished, properly formatted text and types it directly into whatever application is currently active—adapting syntax and tone to match the target environment (code syntax in VS Code, conversational phrasing in Slack, professional structure in Email)—without stealing window focus or corrupting clipboard data.

[![Windows 10/11 x64](https://img.shields.io/badge/Platform-Windows%2010%20%2F%2011%20(x64)-0078D6?logo=windows&logoColor=white)](docs/INSTALLATION.md)
[![Release Version](https://img.shields.io/badge/Release-v1.0.0-00C7B7)](RELEASE_NOTES.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Tests Passing](https://img.shields.io/badge/Tests-220%2F220%20Passing-brightgreen)](docs/QA_REPORT.md)
[![Database: SQLite WAL](https://img.shields.io/badge/Database-SQLite%20WASM%20(WAL)-003B57?logo=sqlite&logoColor=white)](docs/USER_GUIDE.md#local-database)
[![Security: DPAPI Protected](https://img.shields.io/badge/Security-Windows%20DPAPI%20Protected-4CAF50)](docs/SECURITY_AUDIT.md)

---

## ⚡ Architectural Overview

VeoFlow is built on a high-performance decoupled architecture connecting a lightweight native Win32 companion process, an Electron core orchestration engine, multi-provider AI inference adapters, and a local SQLite database.

```
                                      ┌─────────────────────────────────────────────────────────┐
                                      │           Target Window (Active Application)            │
                                      │            (VS Code, Slack, Chrome, Word)               │
                                      └────────────▲───────────────────────────────┬────────────┘
                                                   │                               │
                                     Direct UIA /  │                      Windows  │
                                   SendInput Paste │               UI Automation   │
                                                   │                               │
                                      ┌────────────┴───────────────────────────────▼────────────┐
                                      │            VeoFlow Helper (VeoFlowHelper.exe)           │
                                      │      Native C# / Win32 Low-Level Hook + UIA Engine      │
                                      │      (Key-repeat suppression, 64-bit SendInput)         │
                                      └────────────▲───────────────────────────────┬────────────┘
                                                   │                               │
                                      JSON-RPC IPC │                  Global Push- │
                                     (stdin/stdout)│                  to-Talk Event│
                                                   │                               │
┌───────────────────────────────┐     ┌────────────┴───────────────────────────────▼────────────┐
│      AI Inference Engine      │◄────┤                    VeoFlow Core                         │
│  • Groq Whisper Turbo (<250ms)│     │                 (Electron Desktop)                      │
│  • Google Gemini 2.5 Flash    │     │                                                         │
│  • OpenAI Whisper & GPT-4o    ├────►│  • Floating Frameless HUD Pill (Vanilla JS/Canvas)      │
│  • Contextual AI Formatter    │     │  • Real-Time Audio Capture (Web Audio / AnalyserNode)   │
└───────────────────────────────┘     │  • SQLite Persistence (~/.veoflow/veoflow.sqlite)       │
                                      └─────────────────────────────────────────────────────────┘
```

### Key Engineering Highlights

1. **Zero-Latency Native Windows Helper (`VeoFlowHelper.exe`):**
   - Standalone 64-bit C# companion binary compiled via built-in `csc.exe` (~45 KB, zero external runtime dependencies).
   - Global low-level keyboard hook (`WH_KEYBOARD_LL`) supporting push-to-talk (`Ctrl + Alt + Space` default) and tap-to-toggle.
   - Hardware key-repeat suppression prevents keystroke leakage into the active application.
   - Foreground Window Context discovery via Windows UI Automation (target executable, window title, focused textbox contents, browser URL).
   - Smart 64-bit Win32 text injection supporting direct UI Automation insertion or clipboard fallback with complete restoration.

2. **Context-Aware AI Formatting Engine:**
   - Automatically detects the target application category and adapts punctuation, casing, and structure.
   - **IDEs & Code Editors:** Preserves identifiers, camelCase, snake_case, brackets, and code syntax without stray periods.
   - **Chat Apps:** Generates natural, conversational phrasing with clean punctuation.
   - **Email Clients:** Produces professional greeting, structured paragraphs, and sign-offs.
   - **Instruction Mode:** Recognizes spoken commands (*"translate to Spanish"*, *"format as bullet points"*, *"fix grammar"*).

3. **Multi-Provider AI Speech Architecture:**
   - **Groq Whisper Large v3 Turbo:** Ultra-low latency speech-to-text (<250ms processing).
   - **Google Gemini 2.5 Flash:** Multimodal audio transcription + zero-thought contextual formatting.
   - **OpenAI Whisper:** Industry-standard speech recognition.
   - Automatic provider health checking, exponential backoff, and seamless fallback chains.

4. **Production SQLite Persistence (`~/.veoflow/veoflow.sqlite`):**
   - Built on SQLite WebAssembly with Write-Ahead Logging (WAL) mode and foreign keys enabled.
   - Stores settings, full dictation history with search/filter/retry/export, custom vocabulary with whole-word regex substitution, voice snippets, and injection transaction ledgers.
   - Automatic migrations and atomic JSON migration for legacy configurations.

5. **Premium Obsidian Glassmorphic HUD:**
   - Frameless, transparent, always-on-top floating pill configured with `focusable: false` and `showInactive()`.
   - Never steals window focus or disrupts the user's cursor position in the target application.
   - Real-time 60 FPS cyan audio waveform driven by HTML5 Canvas and Web Audio API `AnalyserNode`.
   - 9 animated visual states: *Idle, Preparing, Recording, Stopping, Transcribing, Formatting, Inserting, Completed, Error*.

6. **Enterprise-Grade Security & Privacy:**
   - API keys encrypted at rest using Windows Data Protection API (DPAPI via Electron `safeStorage`).
   - Isolated Electron renderer with `contextIsolation: true`, `nodeIntegration: false`, and strict Content Security Policy.
   - IPC channel allowlist and strict payload validation via Zod schemas.
   - Granular privacy toggles: selectively disable window title, browser URL, or textbox content capture.

---

## 📥 Downloads & Installation

VeoFlow is distributed for 64-bit Windows 10 and Windows 11.

| Package | File Name | Size | SHA-256 Checksum |
|---|---|---|---|
| **Setup Installer (Recommended)** | [`VeoFlow-Setup-1.0.0-x64.exe`](dist_release_candidate/VeoFlow-Setup-1.0.0-x64.exe) | 99.4 MB | `DC70A12BA2607ADC52A4D9484ABABC09D2ED7855A86C1E5C099737773AF92018` |
| **Standalone Portable** | [`VeoFlow-Portable-1.0.0-x64.exe`](dist_release_candidate/VeoFlow-Portable-1.0.0-x64.exe) | 86.7 MB | `DA625847894ADFF702A654A6D4E63B4B661BC5731405AEC6B33865A4E65C5C25` |

### Installation Instructions
1. Download **`VeoFlow-Setup-1.0.0-x64.exe`**.
2. Run the installer. An NSIS installation wizard will install VeoFlow to your user application directory and add Start Menu shortcuts.
3. Launch VeoFlow. The floating HUD pill will appear at the bottom-center of your primary display, and the tray icon will appear in your Windows taskbar notification area.

For checksum verification steps and troubleshooting Windows SmartScreen warnings, see [docs/INSTALLATION.md](docs/INSTALLATION.md).

---

## ⌨️ How to Use

### 1. Activating Dictation
* **Push-to-Talk (Default):** Press and hold <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>Space</kbd> while speaking. Release the hotkey to stop recording, transcribe, format, and insert.
* **Tap-to-Toggle:** Quickly tap <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>Space</kbd> to begin hands-free recording; tap again to finalize and insert.
* **HUD Microphone:** Click the microphone icon on the floating HUD pill at any time.

### 2. Dictation Modes
Select your preferred dictation mode in Settings or via tray menu:
* **Contextual Dictation (Default):** Transcribes speech and applies application-specific tone and formatting.
* **Clean Dictation:** Cleans up vocal disfluencies (*"um"*, *"ah"*, repetitions) while preserving your exact words.
* **Verbatim Dictation:** Types every word exactly as spoken without semantic modification.
* **Instruction Mode:** Prefix your speech with a directive to transform text (e.g., *"Make this professional: thanks for the sync see you tomorrow"*).

### 3. Application-Specific Formatting

VeoFlow automatically inspects the target application and applies tailored formatting rules:

| Application Type | Examples | Behavior |
|---|---|---|
| **Code Editors / IDEs** | VS Code, Cursor, JetBrains, Visual Studio | Preserves technical identifiers, camelCase, snake_case, brackets, and prevents trailing sentence periods. |
| **Chat & Messaging** | Slack, Discord, Microsoft Teams, WhatsApp | Formats conversational sentences, clean punctuation, and preserves emoji descriptions. |
| **Email Clients** | Outlook, Thunderbird, Gmail, Webmail | Organizes formal greetings, coherent paragraphs, and professional sign-offs. |
| **Terminals** | Windows Terminal, PowerShell, Command Prompt | Transcribes literal commands, paths, parameters, flags, and prevents capitalization. |
| **Word Processors** | Word, Google Docs, Notion, Obsidian | Structures long-form prose with complete punctuation and natural capitalization. |

### 4. Custom Vocabulary & Voice Snippets
* **Custom Dictionary:** Add domain-specific jargon, technical terms, acronyms, or names (e.g., *Kubernetes*, *GraphQL*, *VeoFlow*). VeoFlow applies whole-word regex substitutions prior to insertion.
* **Voice Snippets:** Define trigger keywords that expand into multi-line boilerplates or frequently used text (e.g., saying *"meeting link"* expands into your personal video conference invitation).

---

## 🛠️ Settings & Configuration

Click the gear icon on the floating HUD or right-click the system tray icon and select **Settings** to access the tabbed configuration interface:

* **General:** Toggle launch on Windows startup, minimize to system tray, and choose dark/light theme accents.
* **Audio:** Select input microphone, configure silence detection thresholds, and preview real-time input levels.
* **AI Providers:** Configure API keys for **Groq**, **Google Gemini**, and **OpenAI**. Run instant connection tests. Keys are protected with Windows DPAPI.
* **Dictation:** Set your default dictation mode, target language, and push-to-talk hotkey combinations.
* **Dictionary:** Manage custom vocabulary entries with whole-word matching and case sensitivity options.
* **Snippets:** Add, edit, import, and export voice snippet expansion rules.
* **History:** Browse all past dictation sessions with search, date filtering, text copying, and re-insertion retry.
* **Privacy:** Enable or disable window title capture, browser URL tracking, or textbox content inspection.

---

## 🔨 Building From Source

### Prerequisites
* Windows 10 or 11 (64-bit)
* Node.js v20+ (Node v24 recommended)
* Built-in Windows .NET Framework 4.7.2+ compiler (`csc.exe` located at `C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe`)

### Step-by-Step Build Instructions

```bash
# 1. Clone repository
git clone https://github.com/arfat87/veoflow.git
cd veoflow

# 2. Install Node dependencies
npm install

# 3. Lint codebase
npm run lint

# 4. Compile C# Native Helper (VeoFlowHelper.exe)
npm run build:helper

# 5. Compile Frontend Views via Vite
npm run build:views

# 6. Build Distribution Binaries (NSIS Setup & Portable)
npm run build:package
```

Production artifacts will be generated in the [`dist_release/`](dist_release/) directory:
- `VeoFlow-Setup-1.0.0-x64.exe` (NSIS installer)
- `VeoFlow-Portable-1.0.0-x64.exe` (Portable executable)
- `win-unpacked/` (Unpacked standalone directory)

---

## 🧪 Testing & Verification

VeoFlow includes an extensive automated test suite covering unit tests, provider adapters, database operations, IPC integration, native helper behavior, and end-to-end failure scenarios:

```bash
# Run full Vitest regression suite (22 test suites, 219 tests)
npm test

# Run C# Native Helper test suite (13 test suites)
npm run test:helper

# Run Real Windows Desktop Application Acceptance suite
node scripts/verify_real_desktop_apps.js
```

### Test Verification Status
* **Automated Vitest Suite:** 22/22 test files passed, 219/219 tests passed (100%).
* **C# Native Helper Tests:** 13/13 unit tests passed (100%).
* **Real Desktop Application Acceptance:** Verified active foreground focus validation, text injection, and 100% clipboard canary restoration across live Windows applications (Notepad, VS Code, Chrome).
* **Live Provider Audit:** Verified live transcription request against Groq `whisper-large-v3-turbo` with sub-2-second end-to-end network latency.

For detailed audit logs, see the [QA Report](docs/QA_REPORT.md) and [Performance Report](docs/PERFORMANCE_REPORT.md).

---

## 📚 Documentation Index

* [Installation Guide](docs/INSTALLATION.md) — Prerequisites, installation steps, SHA-256 verification, and clean uninstall.
* [User Guide](docs/USER_GUIDE.md) — Comprehensive user manual, HUD states, dictation workflows, and snippet management.
* [Architecture Specification](VEOFLOW_ARCHITECTURE.md) — Complete product engineering specification, sequence diagrams, and design rationales.
* [Troubleshooting Guide](docs/TROUBLESHOOTING.md) — Solutions for microphone access, hotkey conflicts, and application insertion edge cases.
* [Security Audit](docs/SECURITY_AUDIT.md) — Windows DPAPI credential encryption, Electron sandbox, and IPC validation audit.
* [Threat Model](docs/THREAT_MODEL.md) — Attack surface analysis, STRIDE evaluation, and mitigation ledger.
* [Privacy & Data Flow](docs/PRIVACY_DATA_FLOW.md) — Detailed data flow diagrams and privacy boundary controls.
* [Performance Report](docs/PERFORMANCE_REPORT.md) — Latency benchmarks, memory consumption profiles, and CPU utilization.
* [QA Report](docs/QA_REPORT.md) — Complete test execution logs, test matrices, and verification evidence.
* [Release Notes](RELEASE_NOTES.md) — v1.0.0 release notes, changelog, and artifact checksums.
* [Bug Tracker](docs/BUG_TRACKER.md) — Issue investigation and resolution ledger.

---

## 📄 License

VeoFlow is open-source software licensed under the [MIT License](LICENSE).
