# VeoFlow Security Audit Report

**Document Version:** 1.0.0  
**Audit Date:** November 5, 2026  
**Auditor:** Antigravity AI Engineering Security Practice  
**Status:** All Critical and High-Severity Findings Resolved

---

## 1. Executive Summary

A comprehensive, zero-trust security audit of the VeoFlow Windows desktop voice dictation application was conducted. The audit spanned the Electron main process, secure preload boundary, renderer context, native C# Win32 helper (`VeoFlowHelper.exe`), SQLite database persistence layer, IPC communication bus, credential handling, and privacy controls.

All findings have been identified, classified under standard CVSS severity tiers (Critical, High, Medium, Low, Informational), and verified with automated test suites. **All Critical and High-severity vulnerabilities have been remediated prior to closing Phase 10.**

---

## 2. Vulnerability Classification Matrix

| Finding ID |    Severity     | Category                 | Description                                               |     Status     |
| :--------- | :-------------: | :----------------------- | :-------------------------------------------------------- | :------------: |
| **SEC-01** |   `CRITICAL`    | Credential Storage       | Plaintext API Key Storage & Leakage to Renderer           |  **RESOLVED**  |
| **SEC-02** |   `CRITICAL`    | Information Disclosure   | Unredacted Sensitive Secrets in Application Logs          |  **RESOLVED**  |
| **SEC-03** |     `HIGH`      | Privacy Defeat           | Privacy Setting Key Discrepancy & Permissive URL Default  |  **RESOLVED**  |
| **SEC-04** |     `HIGH`      | IPC Security             | Missing IPC Sender Frame & Origin Validation              |  **RESOLVED**  |
| **SEC-05** |     `HIGH`      | Native Helper DoS        | Unbounded IPC Line Buffer & Payload Memory Exhaustion     |  **RESOLVED**  |
| **SEC-06** |    `MEDIUM`     | Content Security Policy  | Overly Permissive `connect-src https:` in Renderer CSP    |  **RESOLVED**  |
| **SEC-07** |    `MEDIUM`     | Privacy / Data Retention | Persistent Audio Recordings Left on Disk on Clear History |  **RESOLVED**  |
| **SEC-08** |      `LOW`      | Dependency Management    | Electron DevDependency Vulnerabilities (`extract-zip`)    | **DOCUMENTED** |
| **SEC-09** | `INFORMATIONAL` | Software Licensing       | Dependency License Review & Permissive Terms              |  **AUDITED**   |

---

## 3. In-Depth Findings & Remediations

### SEC-01: Plaintext API Key Storage & Leakage to Renderer

- **Severity:** `CRITICAL` (CVSS: 9.1)
- **Vulnerability:**
  Prior to Phase 10, third-party AI provider credentials (`gemini_api_key`, `groq_api_key`, `openai_api_key`) were stored as plaintext strings in the SQLite `settings` table. Furthermore, `db.getAllSettings()` returned the raw API keys directly to the renderer process through the `get-settings` IPC endpoint, where JavaScript in `settings.js` populated HTML password inputs with plaintext secrets.
- **Remediation Implemented:**
  1. Built [`CredentialManager`](file:///c:/MY_ALL_ITEM/rea/veoflow/app/security/credential-manager.js) using Windows DPAPI via Electron's `safeStorage.encryptString()` and `safeStorage.decryptString()`, with an AES-256-GCM machine-bound fallback for headless test environments.
  2. All API keys are encrypted at rest with the `dpapi:` ciphertext prefix.
  3. `db.getAllSettings(includeSecrets = false)` strictly strips all keys ending in `_api_key` before returning settings to general callers or the renderer.
  4. Introduced dedicated zero-secret IPC endpoints:
     - `get-api-key-status`: returns `{ configured: boolean, masked: "••••••••1234" }`.
     - `save-api-key`: receives plaintext, encrypts immediately in the main process, and never reflects the plaintext back.
     - `clear-api-key`: removes secrets cleanly from `settings` and `provider_configs`.
  5. Verified with [`tests/unit/security_hardening.test.js`](file:///c:/MY_ALL_ITEM/rea/veoflow/tests/unit/security_hardening.test.js).

---

### SEC-02: Unredacted Sensitive Secrets in Application Logs

- **Severity:** `CRITICAL` (CVSS: 8.6)
- **Vulnerability:**
  [`StructuredLogger`](file:///c:/MY_ALL_ITEM/rea/veoflow/app/shared/logger.js) previously wrote raw messages and diagnostic data directly to stdout and `~/.veoflow/logs/veoflow.log`. Any error response or logged configuration containing API keys or bearer tokens resulted in permanent plaintext secret disclosure on disk.
- **Remediation Implemented:**
  Implemented recursive pattern sanitization in `redactSecrets()`:
  - Google Gemini keys: `/AIza[0-9A-Za-z-_]{20,}/g`
  - Groq keys: `/gsk_[a-zA-Z0-9_\-]{20,}/g`
  - OpenAI keys: `/sk-(?:proj-)?[a-zA-Z0-9_\-]{20,}/g`
  - Anthropic keys: `/sk-ant-[a-zA-Z0-9_\-]{20,}/g`
  - HTTP Authorization headers: `/Bearer\s+[a-zA-Z0-9_\-\.]+/gi`
  - DPAPI/AES ciphertexts: `/dpapi:[A-Za-z0-9+/=]+/g`, `/aes:[0-9a-fA-F:]+/g`
  - Object keys: `api_key`, `apiKey`, `password`, `secret`, `authorization`, `token` scrubbed to `[REDACTED_SECRET]`.

---

### SEC-03: Privacy Setting Key Discrepancy & Permissive URL Default

- **Severity:** `HIGH` (CVSS: 7.5)
- **Vulnerability:**
  In Phase 05/08, the Settings UI and SQLite database saved privacy controls under `privacy_allow_*` keys (`privacy_allow_window_title`, `privacy_allow_browser_url`, etc.). However, [`ContextEngine.getPrivacyPolicy()`](file:///c:/MY_ALL_ITEM/rea/veoflow/app/core/context/context-engine.js) read `context_*` keys (`context_window_title`, `context_browser_url`), causing user privacy preferences to be silently ignored! In addition, `privacy_allow_browser_url` was enabled by default, violating the requirement that browser URLs must be disabled by default.
- **Remediation Implemented:**
  1. Unified `getPrivacyPolicy()` to read `privacy_allow_*` keys with fallback to `context_*`.
  2. Changed default setting in `database.js` to `privacy_allow_browser_url: 'false'`.
  3. Removed `checked` attribute from `privacyAllowBrowserUrl` in `settings.html`.
  4. Verified default state: Window Title allowed; Browser URL disabled; Selected Text disabled; Surrounding Text disabled.

---

### SEC-04: Missing IPC Sender Frame & Origin Validation

- **Severity:** `HIGH` (CVSS: 7.4)
- **Vulnerability:**
  IPC handlers in [`registerIpcHandlers`](file:///c:/MY_ALL_ITEM/rea/veoflow/app/main/ipc/index.js) accepted invocations without validating `event.senderFrame`. If a malicious web page were ever loaded via an unhandled redirect or webview, it could issue arbitrary IPC commands.
- **Remediation Implemented:**
  1. Implemented `validateIpcSender(event, channel)`:
     - Verifies `event.senderFrame` exists.
     - Strictly enforces `file://` protocol.
     - Allowlist validates frame URL against known local assets (`overlay.html`, `settings.html`, or their `dist/` production equivalents).
  2. Wrapped every IPC handler in `secureHandle(channel, handler)` so unauthorized frames are immediately rejected and logged.

---

### SEC-05: Unbounded Native Helper Payload & Line Buffer

- **Severity:** `HIGH` (CVSS: 7.1)
- **Vulnerability:**
  In [`helper/src/Program.cs`](file:///c:/MY_ALL_ITEM/rea/veoflow/helper/src/Program.cs), the stdin listener loop had no maximum line length or parameter bounding. A rogue process sending multi-megabyte payloads could crash the helper via `OutOfMemoryException` or cause text injection buffer overflows.
- **Remediation Implemented:**
  1. Implemented `MAX_LINE_LENGTH = 1048576` (1 MB) in `IpcListenerLoop`; oversized lines are rejected with JSON-RPC error `-32600`.
  2. Implemented `MAX_INJECTION_TEXT_LENGTH = 500000` (500,000 characters) in `ProcessIpcCommand`; oversized text is rejected with `-32602`.
  3. Bounded `targetHwnd` (32 chars) and `transactionId` (128 chars).
  4. Restricted injection strategy parameter strictly to allowlisted tokens (`auto`, `uia`, `clipboard_paste`, `send_input_unicode`).

---

### SEC-06: Overly Permissive `connect-src https:` in Renderer CSP

- **Severity:** `MEDIUM` (CVSS: 5.3)
- **Vulnerability:**
  The Content Security Policy injected in `LifecycleManager` previously included `connect-src 'self' https:;`. Because all outbound AI requests (Gemini, Groq, OpenAI) are dispatched strictly from the Electron main process, permitting HTTPS connections in the renderer opened an unnecessary data exfiltration vector.
- **Remediation Implemented:**
  Hardened CSP header in [`LifecycleManager`](file:///c:/MY_ALL_ITEM/rea/veoflow/app/main/lifecycle.js) to:
  ```http
  default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none';
  ```
  Completely disabling all renderer network requests.

---

### SEC-07: Persistent Audio Recordings Left on Disk on Clear History

- **Severity:** `MEDIUM` (CVSS: 4.8)
- **Vulnerability:**
  When users executed "Clear all history" in the Settings UI, dictation records were purged from the SQLite database, but previously recorded `.wav` and `.webm` files remained in `~/.veoflow/recordings/` until natural rotation (24 hours).
- **Remediation Implemented:**
  Updated `DatabaseManager.clearHistory()` to explicitly unlink all audio files matching `recording_*` in the local recordings directory, ensuring total physical deletion of spoken audio when requested.

---

### SEC-08: Dependency Management & Electron DevDependencies

- **Severity:** `LOW` (CVSS: 3.5)
- **Vulnerability:**
  `npm audit` reported advisories regarding `extract-zip` and older versions of `electron`.
- **Evaluation & Mitigation:**
  `electron` is installed as a development dependency container (`devDependencies`). In our architecture, the runtime enforces `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, `webSecurity: true`, zero remote navigation, and strict CSP (`connect-src 'none'`). All advisories are mitigated by our architecture. An upgrade to the latest stable Electron version is scheduled for Phase 12 (Packaging).

---

### SEC-09: Software Licensing & Abandoned Packages

- **Severity:** `INFORMATIONAL`
- **Audit:**
  - `diff-match-patch`: Apache 2.0 (Permissive)
  - `sql.js`: MIT (Permissive)
  - `electron`: MIT (Permissive)
  - `vite`: MIT (Permissive)
  - `vitest`: MIT (Permissive)
  - `zod`: MIT (Permissive)
- **Result:** 100% compliant with commercial and personal usage. Zero abandoned packages.

---

## 4. Phase 01 Post-Audit Remediation: Credential Security & DPAPI Migration

**Date Completed:** November 6, 2026  
**Status:** **100% REMEDIATED & VERIFIED**

### 4.1 Plaintext API Key Storage Remediation (Issue A)
- **Root Cause:**
  `DatabaseManager.setDefaultSetting()` previously performed raw SQL inserts without checking if the setting key ended with `_api_key` or encrypting the default value. When environment variables such as `process.env.GEMINI_API_KEY` were defined, `initDefaults()` persisted them directly to SQLite in plaintext.
- **Remediation:**
  1. Updated `setDefaultSetting(key, defaultValue)` to automatically encrypt any non-empty `_api_key` values with Windows DPAPI before persisting to SQLite.
  2. Updated `setSetting(key, value)`, `saveApiKey(provider, apiKey)`, and `setProviderConfig(providerId, config)` to enforce DPAPI encryption before storing secrets.
  3. Added `DatabaseManager.migrateCredentials()` called automatically on database startup. It scans `settings` and `provider_configs`, converting any plaintext or legacy keys to DPAPI and immediately overwriting unencrypted records.

### 4.2 Weak Machine-Bound AES Fallback Elimination (Issue B)
- **Root Cause:**
  The legacy fallback mechanism generated an encryption key using `crypto.createHash('sha256').update(`${os.hostname()}:${username}:veoflow-local-storage-v1`)`. Because hostname and username are public, predictable operating system attributes, this did not provide true cryptographic protection.
- **Remediation:**
  1. Completely removed weak AES key derivation for new encryptions.
  2. Implemented dual Windows DPAPI support:
     - Electron `safeStorage` (backed by Windows DPAPI via Chromium OSCrypt, prefix `dpapi:`).
     - Native Windows DPAPI via `System.Security.Cryptography.ProtectedData` (`DataProtectionScope.CurrentUser`) over standard input (prefix `dpapi-win:`).
  3. Enforced fail-safe behavior: if DPAPI is unavailable, `CredentialManager.encryptSync()` throws `SecureStorageUnavailableError` and refuses to persist credentials.
  4. Retained legacy AES strictly in a decrypt-only capacity (`decryptLegacyAes`) exclusively for migrating pre-existing records to DPAPI.

### 4.3 Credential Migration & Key Compromise Notice (Issue C)
- **Database Migration Verification:**
  The migration was executed against the local database (`%USERPROFILE%\.veoflow\veoflow.sqlite`). Verification confirmed:
  - `gemini_api_key`: migrated from plaintext (length 53) to `dpapi-win:` (length 382).
  - `groq_api_key`: migrated from `aes:` (length 138) to `dpapi-win:` (length 382).
  - `openai_api_key`: empty.
  - Zero plaintext and zero legacy AES keys remain in persistent storage.
- **Compromise Notice & Rotation Advisory:**
  > [!CAUTION]
  > Because previous versions of the software may have stored `gemini_api_key` in plaintext and `groq_api_key` using a predictable machine-derived key, **any API keys used during development prior to Phase 01 must be treated as potentially compromised**.
  > 
  > **Recommended Actions:**
  > 1. Rotate the Google Gemini API key via Google AI Studio / Google Cloud Console.
  > 2. Rotate the Groq API key via the Groq Console.
  > 3. Update the newly generated keys via the VeoFlow Settings UI or via `saveApiKey()`. Newly saved keys are automatically encrypted with Windows DPAPI.
