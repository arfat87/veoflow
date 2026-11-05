# VeoFlow: Comprehensive Threat Model (STRIDE)

**Document Version:** 1.0.0  
**Last Updated:** November 5, 2026  
**Methodology:** Microsoft STRIDE Threat Modeling Framework

---

## 1. System Overview & Trust Boundaries

VeoFlow operates across distinct trust boundaries on a Windows desktop:

```
[ Unconstrained Internet: Groq / OpenAI / Gemini APIs ]
                      | (TLS 1.3 HTTPS - Main Process Only)
                      v
+-------------------------------------------------------------+
| TRUST BOUNDARY 1: ELECTRON MAIN PROCESS (Node.js ESM)       |
| - High Privilege (File System, Windows DPAPI, Helper Spawner) |
+-------------------------------------------------------------+
       ^ (Strict ContextBridge IPC)          | (Anonymous Stdio Pipes)
       |                                     v
+-----------------------------+   +---------------------------+
| TRUST BOUNDARY 2: RENDERER  |   | TRUST BOUNDARY 3: NATIVE  |
| - Low Privilege Sandboxed   |   | HELPER (VeoFlowHelper.exe)|
| - contextIsolation: true    |   | - Medium Privilege        |
| - nodeIntegration: false    |   | - Win32 Keyboard Hook     |
| - connect-src 'none'        |   | - UI Automation / Paste   |
+-----------------------------+   +---------------------------+
                                             | (Win32 API)
                                             v
                                  +---------------------------+
                                  | TRUST BOUNDARY 4: TARGET  |
                                  | OS APPLICATIONS & FIELD   |
                                  +---------------------------+
```

---

## 2. STRIDE Threat Analysis

### 2.1. Spoofing

| Threat ID | Threat Description                                                  | Attacking Entity                     | Mitigation Implemented                                                                                                                                                                                                                                                  |
| :-------- | :------------------------------------------------------------------ | :----------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **S-01**  | Spoofing IPC messages from an unauthorized browser frame or webview | Compromised or malicious web content | [`validateIpcSender()`](file:///c:/MY_ALL_ITEM/rea/veoflow/app/main/ipc/index.js) checks `event.senderFrame.url`, requires `file://` protocol, and allowlists only local HTML assets (`overlay.html`, `settings.html`). Webviews are blocked via `will-attach-webview`. |
| **S-02**  | Rogue executable impersonating `VeoFlowHelper.exe`                  | Malicious local process              | Helper binary path is resolved strictly from the application installation directory (`path.resolve(__dirname, '../../helper/bin/VeoFlowHelper.exe')`). Stdio pipes are anonymous and inherited directly from the parent process.                                        |
| **S-03**  | Rogue window impersonating target application for text injection    | Malware or focus stealer             | Target HWND is captured before dictation begins. Helper validates `GetForegroundWindow()` immediately before keystroke dispatch; if foreground window changed, injection is aborted with `target_mismatch` / `CANCELLED`.                                               |

---

### 2.2. Tampering

| Threat ID | Threat Description                                                   | Attacking Entity               | Mitigation Implemented                                                                                                                                                                  |
| :-------- | :------------------------------------------------------------------- | :----------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **T-01**  | Prompt Injection via untrusted target window titles or selected text | Malicious web page or document | [`ContextSanitizer`](file:///c:/MY_ALL_ITEM/rea/veoflow/app/core/context/context-sanitizer.js) strips instruction injection tokens (`<                                                  | im_start | >`, `[INST]`, `<<SYS>>`), converts markdown fences to single quotes, removes ASCII control characters, bounds lengths, and isolates context inside `<untrusted_app_context>`. |
| **T-02**  | Modification of SQLite database file on disk                         | Local unprivileged malware     | Critical credentials in `settings` and `provider_configs` are encrypted using Windows DPAPI (`CryptProtectData`), which is cryptographically bound to the user's Windows logon session. |
| **T-03**  | Tampering with in-transit clipboard data                             | Concurrent application         | Text injection verifies target application consumption after 250ms and checks if clipboard content still matches the temporary payload before restoring user data.                      |

---

### 2.3. Repudiation

| Threat ID | Threat Description                                                  | Attacking Entity         | Mitigation Implemented                                                                                                                                                                                                                                                                                                                                                       |
| :-------- | :------------------------------------------------------------------ | :----------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R-01**  | Unverifiable text injection operations or silent insertion failures | System or target failure | [`TransactionTracker`](file:///c:/MY_ALL_ITEM/rea/veoflow/app/core/injection/transaction-tracker.js) logs every injection attempt with a unique `tx_<timestamp>_<uuid>`, SHA-256 hash of payload, target HWND, and audit status (`pending`, `inserted`, `verified`, `unverified`, `failed`, `cancelled`). Strict invariant: unverified insertions are never marked verified. |

---

### 2.4. Information Disclosure

| Threat ID | Threat Description                                      | Attacking Entity            | Mitigation Implemented                                                                                                                                                                                            |
| :-------- | :------------------------------------------------------ | :-------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **I-01**  | API keys exposed to renderer or XSS payload             | Compromised renderer script | Secrets are completely stripped from `db.getAllSettings(false)`. Renderer only receives masked key previews (`••••••••1234`).                                                                                     |
| **I-02**  | Sensitive tokens leaked in diagnostic logs              | Log collector / inspection  | [`StructuredLogger`](file:///c:/MY_ALL_ITEM/rea/veoflow/app/shared/logger.js) applies automatic recursive redaction across all log levels, scrubbing Google, Groq, OpenAI, Anthropic, Bearer, and DPAPI patterns. |
| **I-03**  | Sensitive URLs or text scraped from target applications | Third-party AI provider     | Browser URLs, selected text, and surrounding text are **disabled by default**. Window title capture is user-configurable.                                                                                         |
| **I-04**  | Outbound data exfiltration from renderer                | Malicious renderer script   | Content Security Policy header enforces `connect-src 'none'`. Renderer cannot open network connections.                                                                                                           |

---

### 2.5. Denial of Service

| Threat ID | Threat Description                                             | Attacking Entity            | Mitigation Implemented                                                                                                                                                                                                                     |
| :-------- | :------------------------------------------------------------- | :-------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D-01**  | Excessive IPC line length or payload flooding to native helper | Malformed IPC message       | Native helper enforces `MAX_LINE_LENGTH = 1 MB` and `MAX_INJECTION_TEXT_LENGTH = 500,000` characters, rejecting oversized payloads with JSON-RPC error codes.                                                                              |
| **D-02**  | Memory leak from unbounded audio recordings                    | Long-running daemon         | Audio manager executes automated file retention on every save, rotating files older than 24 hours or exceeding 50 entries.                                                                                                                 |
| **D-03**  | Infinite loop in dictionary substitutions                      | Recursive substitution rule | [`DictionaryService`](file:///c:/MY_ALL_ITEM/rea/veoflow/app/core/formatting/dictionary-service.js) uses indexed token placeholders (`\uE000__VEO_REP_${i}__\uE001`) with single-pass resolution, making recursive replacement impossible. |

---

### 2.6. Elevation of Privilege

| Threat ID | Threat Description                                                | Attacking Entity                 | Mitigation Implemented                                                                                                                                      |
| :-------- | :---------------------------------------------------------------- | :------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **E-01**  | Renderer process escapes sandbox to execute arbitrary OS commands | Malicious renderer code          | `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`. No Node.js APIs or remote code execution primitives are bridged into `window.veoflow`. |
| **E-02**  | Arbitrary process execution via native helper                     | Command injection                | Native helper contains zero `Process.Start` calls. Supported actions are strictly allowlisted (`ping`, `get_context`, `inject_text`, `set_hotkey`, `exit`). |
| **E-03**  | Unintended privilege escalation via link navigation               | User clicks malicious URL in app | All windows enforce `will-navigate: preventDefault()` and `setWindowOpenHandler: deny`.                                                                     |

---

## 3. Residual Risk Assessment

| Risk                                                              | Likelihood | Impact | Residual Risk | Ongoing Control                                                                                                          |
| :---------------------------------------------------------------- | :--------: | :----: | :-----------: | :----------------------------------------------------------------------------------------------------------------------- |
| Malicious keylogger running with administrative privileges        |    Low     |  High  |      Low      | Native Windows DPAPI mitigates offline extraction; administrative memory scraping is outside userland app threat models. |
| User explicitly opts in to browser URL & surrounding text capture |   Medium   |  Low   |      Low      | Clear warning in Settings UI explaining that sensitive form content could be sent to configured AI providers.            |
| Third-party AI provider outage                                    |   Medium   |  Low   |      Low      | Automatic fallback chain (Groq -> OpenAI -> Gemini) with raw transcript preservation.                                    |
