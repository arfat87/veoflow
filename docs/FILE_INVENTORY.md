# VeoFlow: Complete File Inventory & Architecture Mapping

**Document Version:** 2.1.0  
**Inventory Date:** November 5, 2026  
**Engineering Governance:** Adheres to Section 3 of `VEOFLOW_ARCHITECTURE.md`.

---

## 1. Master Repository Structure

```
veoflow/
├── package.json                      # Project metadata, scripts (start, dev, build:views, build:package, test)
├── package-lock.json                 # Lockfile (electron@34, vite@8, vitest@5, zod@4, electron-builder@26)
├── vite.config.js                    # Vite multi-page configuration for renderer builds
├── vitest.config.js                  # Vitest runner configuration (fileParallelism: false)
├── electron-builder.yml              # electron-builder production packaging configuration (NSIS & Portable)
├── .gitignore                        # Standard node, electron, C#, build, and secrets ignore rules
├── LICENSE                           # MIT License
├── README.md                         # Product documentation, quick start, download links & architecture
├── CHANGELOG.md                      # Complete milestone version history from Phase 01 to Phase 12
├── RELEASE_NOTES.md                  # Version 1.0.0 release notes, SHA-256 hashes & transparency disclosures
├── VEOFLOW_ARCHITECTURE.md           # Authoritative 21-section engineering specification
├── WISPR_FLOW_ARCHITECTURE.md        # Reference reverse-engineered analysis
│
├── build/                            # Production icons and packaging assets
│   ├── icon.ico                      # Multi-resolution Windows application icon (16x16 to 256x256)
│   └── icon.png                      # High-resolution 256x256 application icon
│
├── dist_release/                     # Production distribution release directory
│   ├── VeoFlow-Setup-1.0.0-x64.exe   # NSIS Windows x64 setup installer (99.3 MB)
│   ├── VeoFlow-Portable-1.0.0-x64.exe # Standalone portable Windows x64 executable (86.6 MB)
│   ├── latest.yml                    # Auto-update release manifest
│   └── win-unpacked/                 # Unpacked production application directory
│       ├── VeoFlow.exe               # Main Electron Windows desktop executable
│       └── resources/
│           ├── app.asar              # Bundled application source and renderer views
│           └── bin/
│               └── VeoFlowHelper.exe # Bundled native C# companion binary
│
├── app/                              # Modular production architecture (ESM)
│   ├── main/
│   │   ├── index.js                  # Application entry point, service lifecycle, IPC binding
│   │   ├── lifecycle.js              # Single-instance lock, permission handlers, strict CSP, startup sync
│   │   ├── window-manager.js         # HUD window (focusable: false) and Settings window lifecycle
│   │   ├── tray-manager.js           # System tray icon, context menu, and quick actions
│   │   ├── hotkey-manager.js         # Global accelerator registration and helper sync
│   │   └── ipc/
│   │       └── index.js              # Validated IPC dispatch with Zod schemas & sender validation
│   │
│   ├── preload/
│   │   └── index.cjs                 # Secure contextBridge API definition (`window.veoflow`)
│   │
│   ├── renderer/
│   │   ├── hud/
│   │   │   ├── audio-capture.js      # Web Audio API engine, AnalyserNode, MediaRecorder, duration limit
│   │   │   ├── overlay.html          # Floating HUD markup structure
│   │   │   ├── overlay.css           # Glassmorphic HUD styling and animations
│   │   │   └── overlay.js            # HUD state machine, canvas FFT waveform, and mic recording
│   │   ├── settings/
│   │   │   ├── settings.html         # Tabbed settings dashboard markup
│   │   │   ├── settings.css          # Dark-theme settings styling
│   │   │   └── settings.js           # Settings UI event handlers, history table, dictionary, snippets
│   │   └── styles/
│   │
│   ├── core/
│   │   ├── audio/                    # Phase 03 Audio Subsystem
│   │   │   ├── wav-encoder.js        # Pure 16-bit linear PCM WAV RIFF encoder and parser
│   │   │   ├── audio-utils.js        # RMS calculation, dBFS analysis, silence detection, resampler
│   │   │   ├── audio-worker.js       # Background Worker Thread offloading CPU-intensive audio encoding
│   │   │   └── audio-manager.js      # Recording persistence in ~/.veoflow/recordings/, rotation & recovery
│   │   ├── providers/                # Phase 04 AI Provider Adapters
│   │   │   ├── errors.js             # Normalized errors (Authentication, RateLimit, Server, Network, Timeout)
│   │   │   ├── base-provider.js      # Abstract AIProvider contract
│   │   │   ├── groq-provider.js      # Groq Whisper Large v3 Turbo adapter
│   │   │   ├── openai-provider.js    # OpenAI Whisper-1 adapter
│   │   │   └── gemini-provider.js    # Google Gemini 2.5 Flash multimodal adapter
│   │   ├── transcription/            # Phase 04 Transcription Subsystem
│   │   │   └── transcription-engine.js # Provider routing, fallback hierarchy, raw transcript preservation
│   │   ├── helperClient.js           # Subprocess client for VeoFlowHelper.exe with dynamic path resolution
│   │   ├── update-manager.js         # Timing-safe update verification, SHA-256 integrity & rollback snapshots
│   │   ├── aiService.js              # Multi-provider STT and contextual LLM formatter
│   │   ├── diffPaster.js             # diff-match-patch wrapper for incremental/full text pasting
│   │   ├── context/                  # Phase 05 Application Context Subsystem
│   │   │   ├── app-classifier.js     # Semantic application classification & rule overrides
│   │   │   ├── context-sanitizer.js  # Prompt injection token neutralization, control char stripping, bounding
│   │   │   └── context-engine.js     # Privacy permission filtering, HWND change tracking, context envelopes
│   │   ├── formatting/               # Phase 06 Contextual AI Formatter & Instruction Engine
│   │   │   ├── base-formatter.js     # Abstract BaseFormatter interface
│   │   │   ├── gemini-formatter.js   # Google Gemini LLM adapter with zero-thought latency
│   │   │   ├── groq-formatter.js     # Groq LLM adapter with multi-model fallback (Qwen, GPT-OSS, LLaMA)
│   │   │   ├── openai-formatter.js   # OpenAI GPT-4o-mini LLM adapter
│   │   │   ├── prompt-engine.js      # Version-controlled prompt engine (v2026.11.05-v1), directives & rules
│   │   │   ├── response-validator.js # LLM fence/quote stripping, number preservation & refusal checks
│   │   │   ├── dictionary-service.js # Injection-safe whole-word dictionary substitutions & snippet expansion
│   │   │   └── formatting-engine.js  # Master orchestrator, fallback chain resolution & pipeline integration
│   │   ├── injection/                # Phase 07 Smart Text Injection Subsystem
│   │   │   ├── transaction-tracker.js # SHA-256 transaction auditing (pending, inserted, verified, failed)
│   │   │   ├── target-manager.js     # Target window capture, HWND normalization & revalidation
│   │   │   └── injection-manager.js  # Main insertion orchestrator, UIA/clipboard dispatch & recovery
│   │   └── pipeline/
│   │
│   ├── database/
│   │   ├── database.js               # DatabaseManager providing SQLite persistence API
│   │   ├── migrations.js             # Versioned SQLite migrations (001_initial, 002_user_features)
│   │   └── sqlite-driver.js          # SQLite WebAssembly (sql.js) driver with atomic disk sync
│   │
│   ├── security/
│   │   └── credential-manager.js     # Windows DPAPI safeStorage credential encryption & key masking
│   │
│   └── shared/
│       ├── constants.js              # PIPELINE_STATES, HOTKEY_MODES, DEFAULT_CONFIG, PROVIDERS, MODELS
│       ├── logger.js                 # Structured JSON logging to stdout and file
│       └── validation.js             # Zod validation schemas for IPC envelopes
│
├── assets/
│   └── icon.png                      # Application icon for Tray and Window (14.7 KB)
│
├── helper/                           # Native C# Win32 integration subsystem
│   ├── VeoFlowHelper.sln             # Visual Studio solution
│   ├── build.bat                     # Compiler script (supports csc.exe and MSBuild)
│   ├── Program.cs                    # Compatibility entry point
│   ├── src/
│   │   ├── NativeMethods.cs          # Win32 P/Invokes, structs (40-byte INPUT on x64), constants
│   │   ├── Protocol.cs               # JSON serializer, parser, escape encoder, JSON-RPC envelopes
│   │   ├── KeyboardHook.cs           # WH_KEYBOARD_LL hook, key-repeat suppression, Escape cancel
│   │   ├── UIAutomationReader.cs     # Bounded UI automation inspection (TextPattern, ValuePattern)
│   │   ├── WindowContext.cs          # GetForegroundWindow, HWND tracking, PID, browser URL
│   │   ├── TextInjector.cs           # Clipboard preservation, 250ms wait, SendInput Ctrl+V, Unicode
│   │   ├── Program.cs                # Entry point, STA message loop, IPC stdio reader, shutdown
│   │   └── VeoFlowHelper.csproj      # .NET 8 / Windows SDK project configuration
│   ├── tests/
│   │   ├── HelperProtocolTests.cs    # Native unit tests (struct sizing, JSON parsing, hotkeys)
│   │   ├── TestRunner.cs             # Standalone test runner entry point
│   │   ├── run_tests.bat             # Test compilation and execution batch runner
│   │   └── VeoFlowHelper.Tests.csproj# xUnit test project configuration
│   └── bin/
│       └── VeoFlowHelper.exe         # Compiled standalone 64-bit managed executable (44 KB)
│
├── tests/                            # Automated testing harness
│   ├── unit/
│   │   ├── constants.test.js         # Vitest specs for shared constants
│   │   ├── validation.test.js        # Vitest specs for Zod validation schemas
│   │   ├── database.test.js          # Vitest specs for isolated database CRUD
│   │   ├── sqlite_persistence.test.js # Vitest specs for SQLite driver, migrations, history, dictionary & snippets
│   │   ├── wav_encoder.test.js       # Vitest specs for WAV header encoding and parsing
│   │   ├── audio_utils.test.js       # Vitest specs for RMS, dBFS, silence, and duration limits
│   │   ├── audio_manager.test.js     # Vitest specs for recording persistence & worker threads
│   │   ├── audio_capture_state.test.js # Vitest specs for client audio engine state transitions
│   │   ├── providers.test.js         # Vitest specs for Groq, OpenAI, Gemini adapters
│   │   ├── transcription_engine.test.js # Vitest specs for fallback, language, and errors
│   │   ├── context_engine.test.js    # Vitest specs for app classification, sanitization, privacy & HWND tracking
│   │   ├── formatting_engine.test.js # Vitest specs for LLM adapters, prompt rules, directives & validation
│   │   ├── injection_manager.test.js # Vitest specs for target validation, UIA, clipboard restoration & auditing
│   │   ├── ui_desktop.test.js        # Vitest specs for HUD positioning, multi-monitor bounds, 7-screen settings & tray
│   │   ├── security_hardening.test.js # Vitest specs for DPAPI encryption, logger redaction, IPC origin & privacy defaults
│   │   └── update_and_startup.test.js # Vitest specs for timing-safe update verification & login item sync
│   ├── integration/
│   │   ├── helper_ipc.test.js        # Vitest specs for native helper IPC & lifecycle
│   │   └── notepad_live.test.js      # Vitest live integration with Notepad.exe
│   ├── fixtures/
│   │   ├── generate_fixtures.js      # Audio test fixtures generator script
│   │   ├── silence_16k.wav           # 16kHz mono pure silence WAV fixture (32 KB)
│   │   ├── sine_440hz_16k.wav        # 16kHz mono 440Hz tone WAV fixture (32 KB)
│   │   ├── noisy_16k.wav             # 16kHz mono random noise WAV fixture (32 KB)
│   │   ├── short_burst_16k.wav       # 16kHz mono 300ms burst WAV fixture (9.6 KB)
│   │   └── formatting-fixtures.js    # Spoken transcripts (chat, email, code, Hinglish, directives, terminal)
│   └── e2e/
│       ├── dictation_pipeline.test.js    # Complete 11-step dictation journey from hotkey to verified insertion
│       ├── app_compatibility.test.js     # Compatibility across 8 Windows applications (Notepad, VS Code, Chrome, etc.)
│       ├── failure_scenarios.test.js     # 16 failure & edge case scenarios (mic disconnected, rate limits, crashes)
│       └── performance_benchmark.test.js # Latency, WAV encoding, prompt compilation, and SQLite throughput benchmarks
│
└── docs/                             # Engineering governance & release documentation
    ├── INSTALLATION.md               # User installation walkthrough, SmartScreen bypass & SHA-256 verification
    ├── USER_GUIDE.md                 # Complete user manual (HUD states, push-to-talk, vocabulary, snippets)
    ├── TROUBLESHOOTING.md            # Diagnoses for microphone permissions, hotkeys, UIA, and log inspection
    ├── PROJECT_AUDIT.md              # In-depth subsystem audit
    ├── IMPLEMENTATION_STATUS.md      # Matrix of current vs target phase implementation
    ├── FILE_INVENTORY.md             # This document
    ├── TECHNICAL_RISKS.md            # Critical engineering risks & mitigations
    ├── PHASE_TRACKER.md              # 12-Phase roadmap completion tracker
    ├── SECURITY_AUDIT.md             # Complete security audit report with CVSS vulnerability matrix
    ├── PRIVACY_DATA_FLOW.md          # Privacy data flow architecture & data minimization boundaries
    ├── THREAT_MODEL.md               # STRIDE threat model across all system trust boundaries
    ├── QA_REPORT.md                  # Complete Phase 11 QA audit report and test matrices
    ├── PERFORMANCE_REPORT.md         # Phase 11 performance, latency, and resource benchmark report
    ├── BUG_TRACKER.md                # Phase 11 defect log, root cause analyses, and verified fixes
    └── RELEASE_READINESS.md          # Formal release readiness evaluation and Phase 12 gate sign-off
```

---

## 2. Dependencies & Build Tools Inventory

| Package | Version | Type | Function |
| :--- | :---: | :---: | :--- |
| `electron` | `^34.2.0` | Dev | Cross-platform desktop application container |
| `electron-builder` | `^26.18.0` | Dev | Production Windows packaging (NSIS installer & portable executable) |
| `vite` | `^8.3.6` | Dev | High-performance bundling and asset pipeline |
| `vitest` | `^5.1.0` | Dev | Fast unit and integration test runner |
| `zod` | `^4.6.7` | Dev | Strict runtime validation schemas for IPC & settings |
| `diff-match-patch` | `^1.0.5` | Prod | High-efficiency diff calculation for incremental text injection |
| `sql.js` | `^1.15.2` | Prod | SQLite compiled to WebAssembly with zero native build prerequisites |
