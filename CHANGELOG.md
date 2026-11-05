# Changelog

All notable changes to the **VeoFlow** project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2026-11-05

### Initial Production Release 🎉

#### Added
- **Native Windows Helper Subsystem (`VeoFlowHelper.exe`)**:
  - Standalone high-performance C# .NET helper (~44 KB) requiring zero external runtime dependencies.
  - Global low-level keyboard hook (`WH_KEYBOARD_LL`) supporting customizable Push-to-Talk and Tap-to-Toggle hotkeys (`Ctrl + Alt + Space` default).
  - Native key-repeat suppression to eliminate keyboard event leakage into active textboxes.
  - Windows UI Automation target discovery (foreground HWND, process ID, class name, window title, focused element type).
  - High-precision Win32 `SendInput` text injection and atomic clipboard backup/restoration.
- **Audio Capture & DSP Engine**:
  - Real-time Web Audio API capture running in isolated audio processing threads.
  - 16 kHz 16-bit mono PCM WAV encoding and provider-compatible Opus encoding.
  - Real-time `AnalyserNode` RMS volume calculation and 60 FPS waveform stream.
  - Silence detection with configurable threshold and 5-minute safety timeout.
- **Multi-Provider AI Speech Recognition**:
  - Provider-independent speech recognition abstraction layer.
  - Google Gemini 2.5 Flash audio transcription with structured reasoning.
  - Groq Whisper Large v3 Turbo adapter delivering sub-250ms transcription latency.
  - OpenAI Whisper standard adapter.
  - Automatic language detection and configurable provider fallback sequence.
- **Application Context Engine**:
  - Real-time application classification into 7 distinct target domains: Code Editor, Chat, Email, Document, Terminal, Browser Form, and Unknown.
  - Strict privacy defaults: window title capture configurable, selection and textbox extraction disabled by default.
  - User-configurable application exclusion rules (e.g. password managers, banking tools).
- **Contextual AI Formatter & Instruct Engine**:
  - 4 specialized formatting modes: Verbatim, Clean, Contextual, and Instruct.
  - Domain-specific formatting: preserves code syntax (`camelCase`, identifiers, operators) in IDEs; conversational tone in chat apps; professional paragraphs in email.
  - Voice Directives: handles voice commands such as *"format as bullet points"*, *"translate into French"*, and *"make this professional"*.
  - Custom dictionary substitution and whole-word matching.
- **Smart Text Injection Engine**:
  - Dual injection architecture: Primary insertion via Windows UI Automation (`IUIAutomation` TextPattern / ValuePattern).
  - Seamless fallback to atomic Win32 `SendInput` (Ctrl+V) with full clipboard format backup and automatic restore.
  - Pre-insertion HWND revalidation preventing text injection if the user switched windows during transcription.
- **Floating HUD & Glassmorphic Desktop UI**:
  - Frameless, non-focusable (`showInactive()`) obsidian glassmorphic overlay that never steals window focus.
  - High-performance HTML5 Canvas audio waveform visualizer rendering at 60 FPS.
  - 9 distinct visual feedback states: Idle, Preparing, Recording, Stopping, Transcribing, Formatting, Inserting, Completed, Error.
  - Multi-monitor coordinate tracking and drag-and-drop repositioning with persistent coordinates.
  - Dedicated multi-tab Settings window (General, Audio, Providers, Dictionary, Snippets, Rules, History).
- **Local Persistence & Data Management**:
  - Atomic JSON persistence (`~/.veoflow/veoflow_store.json`) with safe temporary write and rename semantics.
  - Full dictation history logging with search, filter, copy, and export capabilities.
  - Custom vocabulary editor with case sensitivity and whole-word matching controls.
  - Voice Snippets expansion engine for instant templated text expansion.
- **Security & Privacy Hardening**:
  - Windows DPAPI credential protection via Electron `safeStorage` (API keys encrypted at rest).
  - Strict Electron security posture: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
  - Comprehensive Content Security Policy (CSP) blocking unauthorized network connections and inline scripts.
  - IPC channel allowlist and strict frame sender URL validation.
  - JSON-RPC command authorization and payload validation for native helper communications.
- **Packaging & Windows Distribution**:
  - Full production Vite build bundling HUD and Settings views into optimized distribution assets.
  - Complete `electron-builder` configuration producing Windows x64 NSIS Setup Installer (`VeoFlow-Setup-1.0.0-x64.exe`) and standalone Portable binary (`VeoFlow-Portable-1.0.0-x64.exe`).
  - Native helper bundled via `extraResources` into `resources/bin/VeoFlowHelper.exe` with dynamic path resolution.
  - Secure Update Manager with timing-safe SHA-256 verification and automatic rollback snapshots.
  - Windows launch on startup integration via `app.setLoginItemSettings()`.
- **Quality Assurance & Verification**:
  - 223 automated unit, integration, and security regression tests passing with 100% pass rate.
  - Full end-to-end verification across Windows Notepad, VS Code, Google Chrome, Microsoft Edge, Slack, and Windows Terminal.

