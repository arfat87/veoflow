# VeoFlow: Complete File Inventory & Architecture Mapping

**Document Version:** 1.5.0  
**Inventory Date:** November 5, 2026  
**Engineering Governance:** Adheres to Section 3 of `VEOFLOW_ARCHITECTURE.md`.

---

## 1. Master Repository Structure

```
veoflow/
├── package.json                      # Project metadata, scripts (start, dev, build:renderer, test)
├── package-lock.json                 # Lockfile (electron@34, vite@8, vitest@5, zod@4, diff-match-patch)
├── vite.config.js                    # Vite multi-page configuration for renderer builds
├── vitest.config.js                  # Vitest runner configuration
├── .gitignore                        # Standard node, electron, C#, build, and secrets ignore rules
├── LICENSE                           # MIT License
├── README.md                         # Project documentation and architectural overview
├── test_all.js                       # Comprehensive legacy 7-suite integration runner
├── VEOFLOW_ARCHITECTURE.md           # Authoritative 21-section engineering specification
├── WISPR_FLOW_ARCHITECTURE.md        # Reference reverse-engineered analysis
│
├── app/                              # Modular production architecture (ESM)
│   ├── main/
│   │   ├── index.js                  # Application entry point, service lifecycle, IPC binding
│   │   ├── lifecycle.js              # Single-instance lock, permission handlers, strict CSP
│   │   ├── window-manager.js         # HUD window (focusable: false) and Settings window lifecycle
│   │   ├── tray-manager.js           # System tray icon, context menu, and quick actions
│   │   ├── hotkey-manager.js         # Global accelerator registration and helper sync
│   │   └── ipc/
│   │       └── index.js              # Validated IPC dispatch with Zod schemas
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
│   │   ├── helperClient.js           # Subprocess client for VeoFlowHelper.exe (JSON-RPC over stdio)
│   │   ├── aiService.js              # Multi-provider STT and contextual LLM formatter
│   │   ├── diffPaster.js             # diff-match-patch wrapper for incremental/full text pasting
│   │   ├── context/                  # Phase 05 Application Context Subsystem
│   │   │   ├── app-classifier.js     # Semantic application classification & rule overrides
│   │   │   ├── context-sanitizer.js  # Prompt injection token neutralization, control char stripping, bounding
│   │   │   └── context-engine.js     # Privacy permission filtering, HWND change tracking, context envelopes
│   │   ├── formatting/               # Reserved for Phase 06 contextual prompt engine
│   │   ├── injection/                # Reserved for Phase 07 text injection strategies
│   │   └── pipeline/                 # Reserved for dictation state machine orchestration
│   │
│   ├── database/
│   │   └── database.js               # Isolated DatabaseManager supporting test sandboxing
│   │
│   ├── security/                     # Reserved for Phase 10 DPAPI credential protection
│   │
│   └── shared/
│       ├── constants.js              # PIPELINE_STATES, HOTKEY_MODES, DEFAULT_CONFIG, PROVIDERS, MODELS
│       ├── logger.js                 # Structured JSON logging to stdout and file
│       └── validation.js             # Zod validation schemas for IPC envelopes
│
├── assets/
│   └── icon.png                      # Application icon for Tray and Window (635 bytes)
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
│       └── VeoFlowHelper.exe         # Compiled standalone 64-bit managed executable (37,376 bytes)
│
├── tests/                            # Automated testing harness
│   ├── unit/
│   │   ├── constants.test.js         # Vitest specs for shared constants
│   │   ├── validation.test.js        # Vitest specs for Zod validation schemas
│   │   ├── database.test.js          # Vitest specs for isolated database CRUD
│   │   ├── wav_encoder.test.js       # Vitest specs for WAV header encoding and parsing
│   │   ├── audio_utils.test.js       # Vitest specs for RMS, dBFS, silence, and duration limits
│   │   ├── audio_manager.test.js     # Vitest specs for recording persistence & worker threads
│   │   ├── audio_capture_state.test.js # Vitest specs for client audio engine state transitions
│   │   ├── providers.test.js         # Vitest specs for Groq, OpenAI, Gemini adapters
│   │   ├── transcription_engine.test.js # Vitest specs for fallback, language, and errors
│   │   └── context_engine.test.js    # Vitest specs for app classification, sanitization, privacy & HWND tracking
│   ├── integration/
│   │   ├── helper_ipc.test.js        # Vitest specs for native helper IPC & lifecycle
│   │   └── notepad_live.test.js      # Vitest live integration with Notepad.exe
│   ├── fixtures/
│   │   ├── generate_fixtures.js      # Audio test fixtures generator script
│   │   ├── silence_16k.wav           # 16kHz mono pure silence WAV fixture (32 KB)
│   │   ├── sine_440hz_16k.wav        # 16kHz mono 440Hz tone WAV fixture (32 KB)
│   │   ├── noisy_16k.wav             # 16kHz mono random noise WAV fixture (32 KB)
│   │   └── short_burst_16k.wav       # 16kHz mono 300ms burst WAV fixture (9.6 KB)
│   └── e2e/
│
└── docs/                             # Engineering governance & audit documentation
    ├── PROJECT_AUDIT.md              # In-depth subsystem audit
    ├── IMPLEMENTATION_STATUS.md      # Matrix of current vs target phase implementation
    ├── FILE_INVENTORY.md             # This document
    ├── TECHNICAL_RISKS.md            # Critical engineering risks & mitigations
    └── PHASE_TRACKER.md              # 12-Phase roadmap completion tracker
```

---

## 2. Dependencies & Build Tools Inventory

| Package            |  Version  | Type | Function                                                        |
| :----------------- | :-------: | :--: | :-------------------------------------------------------------- |
| `electron`         | `^34.2.0` | Dev  | Cross-platform desktop application container                    |
| `vite`             | `^8.3.6`  | Dev  | High-performance bundling and asset pipeline                    |
| `vitest`           | `^5.1.0`  | Dev  | Fast unit and integration test runner                           |
| `zod`              | `^4.6.7`  | Dev  | Strict runtime validation schemas for IPC & settings            |
| `diff-match-patch` | `^1.0.5`  | Prod | High-efficiency diff calculation for incremental text injection |
