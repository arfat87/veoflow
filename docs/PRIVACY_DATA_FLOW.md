# VeoFlow: Privacy & Data Flow Architecture

**Document Version:** 1.0.0  
**Last Updated:** November 5, 2026  
**Security Practice:** Principle of Least Privilege & Data Minimization

---

## 1. High-Level Data Flow Architecture

The following diagram illustrates how user speech, target context, and credentials flow across VeoFlow subsystems. All external communication is strictly confined to the Electron Main process over encrypted TLS.

```mermaid
flowchart TD
    subgraph UserMachine ["Local Windows Workstation"]
        subgraph Hardware ["Hardware Layer"]
            MIC["Microphone Hardware"]
            KB["Physical Keyboard"]
            APP["Target Application (e.g. VS Code, Chrome)"]
        end

        subgraph NativeHelper ["VeoFlowHelper.exe (64-bit C# Win32)"]
            HOOK["WH_KEYBOARD_LL (Hotkey Hook)"]
            CTX["Win32 Context Reader (GetForegroundWindow)"]
            INJ["Text Injector (UIA / SendInput Ctrl+V)"]
        end

        subgraph RendererLayer ["Electron Renderer (Sandboxed)"]
            HUD["Floating HUD (overlay.html)"]
            AUDIO_CAP["Web Audio API & AnalyserNode"]
            SETTINGS_UI["Settings Dashboard (settings.html)"]
        end

        subgraph MainProcess ["Electron Main Process (Node.js ESM)"]
            IPC_ROUTER["Secure IPC Controller (Sender Validated)"]
            CTX_FILTER["Context Engine (Privacy Permissions Filter)"]
            SANITIZER["Context Sanitizer (Prompt Injection Neutralizer)"]
            CRED_MGR["Credential Manager (Windows DPAPI)"]
            AUDIO_MGR["Audio Manager (Temp Storage & Retention)"]
            AI_ORCH["Transcription & Formatting Orchestrator"]
            SQLITE["SQLite WASM (veoflow.sqlite)"]
            LOGGER["Structured Logger (Automatic Secret Redaction)"]
        end
    end

    subgraph ExternalCloud ["Configured Cloud AI Providers (TLS 1.3)"]
        GROQ["Groq (Whisper Large v3 / LLM)"]
        OPENAI["OpenAI (Whisper-1 / GPT-4o-mini)"]
        GEMINI["Google Gemini (2.5 Flash Multimodal)"]
    end

    %% Audio Capture Flow
    MIC -->|Raw Audio Stream| AUDIO_CAP
    AUDIO_CAP -->|PCM Audio Buffer| HUD
    HUD -->|IPC: submit-audio| IPC_ROUTER
    IPC_ROUTER --> AUDIO_MGR

    %% Context Extraction & Filtering Flow
    KB -->|Ctrl+Alt+Space| HOOK
    HOOK -->|Event: hotkey_down| IPC_ROUTER
    IPC_ROUTER --> CTX
    CTX -->|Raw Win32 Context| CTX_FILTER
    CTX_FILTER -->|Check User Permissions| SANITIZER
    SANITIZER -->|Sanitized Context Envelope| AI_ORCH

    %% Credential Protection Flow
    CRED_MGR <-->|DPAPI Encrypt/Decrypt| SQLITE
    CRED_MGR -.->|Decrypted In-Memory Token| AI_ORCH
    SETTINGS_UI -.->|Masked Keys Only| IPC_ROUTER

    %% Cloud Processing Flow
    AUDIO_MGR -->|Audio Buffer| AI_ORCH
    AI_ORCH -->|HTTPS POST| GROQ
    AI_ORCH -->|HTTPS POST| OPENAI
    AI_ORCH -->|HTTPS POST| GEMINI
    GROQ -->|Raw Transcript| AI_ORCH
    OPENAI -->|Raw Transcript| AI_ORCH
    GEMINI -->|Raw Transcript| AI_ORCH

    %% Text Injection Flow
    AI_ORCH -->|Formatted Text| INJ
    INJ -->|Verified Insertion| APP

    %% Persistence Flow
    AI_ORCH -->|History Record| SQLITE
    IPC_ROUTER -->|Redacted Audit Logs| LOGGER
```

---

## 2. Privacy Boundaries & Invariants

| Boundary                          | Invariant / Enforcement                                                                                                                                                                         |
| :-------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Outbound Cloud Network Egress** | ONLY speech audio buffers and sanitized target application metadata (`<untrusted_app_context>`) are transmitted to the user-selected AI provider over TLS 1.3.                                  |
| **Renderer Network Isolation**    | Renderer windows (`overlay.html`, `settings.html`) have `connect-src 'none'`. They are physically incapable of establishing HTTP/WebSocket connections.                                         |
| **Zero Screen Capture**           | Screenshots, OCR, display scrapes, and desktop recording are **strictly prohibited and completely absent** from both Electron and the native helper.                                            |
| **Credential Seclusion**          | Third-party API keys are encrypted at rest with Windows DPAPI. Decryption occurs only in main process memory when initiating API requests. Plaintext keys **never enter the renderer process**. |
| **Log Scrubbing**                 | Application logs in `~/.veoflow/logs/` are automatically scrubbed of all known API key patterns, Bearer tokens, and sensitive credential keys before hitting disk.                              |

---

## 3. Context Permission Defaults & User Controls

VeoFlow implements strict **Privacy by Default**:

| Context Property                         | Default State | Configurable In UI | Privacy Rationale                                                                                                |
| :--------------------------------------- | :-----------: | :----------------: | :--------------------------------------------------------------------------------------------------------------- |
| **Process Executable Name** (`appName`)  |  **Allowed**  |         No         | Required for basic application classification (e.g. `Code.exe` vs `Slack.exe`). Contains no user data.           |
| **Window Title** (`windowTitle`)         |  **Allowed**  |      **Yes**       | Helps distinguish document names or editor tabs. Can be completely disabled by the user in Settings.             |
| **Browser URL** (`url`)                  | **DISABLED**  |  **Yes (Opt-in)**  | Browsing URLs may contain tracking parameters, tokens, or sensitive internal paths. User must explicitly opt in. |
| **Selected Text** (`selectedText`)       | **DISABLED**  |  **Yes (Opt-in)**  | Selected text in other applications could contain passwords or confidential data. Strictly opt-in.               |
| **Surrounding Text** (`surroundingText`) | **DISABLED**  |  **Yes (Opt-in)**  | Textbox surrounding content is bounded and strictly opt-in.                                                      |
| **Screenshots / Visuals**                |   **NEVER**   |       **No**       | Zero capability in codebase.                                                                                     |

---

## 4. Local Data Retention & Lifecycle Management

### A. Spoken Audio Buffers (`~/.veoflow/recordings/`)

- Temporary audio files (`recording_<timestamp>_<id>.wav`) are stored locally to permit transcription retries and debugging.
- **Automatic Rotation:** Every new recording triggers `cleanupOldRecordings()`, which deletes all audio files older than **24 hours** or exceeding the **50-file ceiling**.
- **Instant Wipe:** Clicking "Clear all history" in the Settings Dashboard immediately deletes all temporary audio files from disk.

### B. SQLite Database (`~/.veoflow/veoflow.sqlite`)

- Dictation history (transcripts, timestamps, latency, status) is stored locally in SQLite.
- **Configurable Retention Policy:** Users can select 7 days, 30 days, 90 days, 365 days, or indefinite (`0`). Records older than the cutoff are automatically purged upon application startup.
- **Single-Item Deletion:** Users can delete individual history entries at any time.

### C. Clipboard Restoration & Safety

- When using clipboard fallback insertion, VeoFlow snapshots the clipboard before paste.
- After target application consumption (250ms), VeoFlow verifies whether the clipboard still contains the temporary payload.
- If unchanged, the original clipboard content is restored.
- If the user or another process copied new data during the paste window, VeoFlow **preserves the external data** and aborts restoration to avoid overwriting user clipboard modifications.
