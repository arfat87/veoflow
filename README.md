# VeoFlow 🎙️✨

**VeoFlow** is an open-source, context-aware voice dictation and intelligent text injection desktop application for Windows, engineered directly from the architectural teardown of Wispr Flow.

It seamlessly translates spoken thoughts into polished, properly-formatted text and types it directly into your active window—matching the tone and conventions of your current application (code formatting in VS Code, casual tone in Slack, polished professionalism in Email).

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
                                  │  • Atomic JSON Storage (~/.veoflow/veoflow_store.json│
                                  └──────────────────────────────────────────────────────┘
```

### Key Highlights
1. **Zero-Latency Native Windows Helper (`VeoFlowHelper.exe`):**
   - Standalone C# .NET binary compiled via `csc.exe` (~25 KB, 0 external runtime dependencies).
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
   - Real-time audio waveform visualizer.

---

## 🚀 Quick Start

### 1. Requirements
* Windows 10 / 11
* Node.js v20+ (Node 24 recommended)

### 2. Build Helper (C#)
```cmd
cd helper
build.bat
cd ..
```
*Compiles `helper/bin/VeoFlowHelper.exe` using Windows' built-in .NET Framework compiler.*

### 3. Install Dependencies & Launch
```bash
npm install
npm start
```

---

## ⌨️ How to Use

1. **Activate Dictation:**
   - **Hotkey:** Press and hold `Ctrl + Alt + Space` (Push-to-Talk) while speaking, or tap once to start and tap again to finish.
   - Or click the microphone icon on the floating HUD pill.
2. **Speak Naturally:**
   - The HUD displays an animated cyan audio visualizer as you talk.
3. **Automatic Insertion:**
   - Upon releasing the hotkey, your speech is transcribed, passed through the contextual LLM formatter, and typed directly into the active text box!
4. **Open Settings & History:**
   - Click the gear icon on the floating HUD or double-click the system tray icon to configure API keys, custom dictionary terms, snippets, and review transcription history.
