# VeoFlow: Technical Risks & Architectural Decisions

**Document Version:** 1.0.0  
**Audit Date:** November 5, 2026  
**Reference:** [`VEOFLOW_ARCHITECTURE.md`](../VEOFLOW_ARCHITECTURE.md#L916-L944)

---

## 1. Top Technical Risks & Engineering Mitigations

### Risk 1: Window Focus Loss During Inference
- **Symptom:** While speech is being transcribed and formatted (200–600ms latency), the user clicks another window or the target window closes, causing text to be pasted into the wrong application.
- **Mitigation:** The native helper records the exact target `HWND` and process identity upon hotkey engagement (`hotkey_down`). Before dispatching `SendInput` or `Ctrl+V`, the helper verifies that `GetForegroundWindow()` still matches the original target handle. If focus shifted, text injection is aborted and held in history.

### Risk 2: Clipboard Data Loss / Corruption
- **Symptom:** Injecting text via clipboard overwrite destroys copied images, files, or rich text that the user had on their clipboard prior to speaking.
- **Mitigation:** The native helper captures the full `IDataObject` across all clipboard formats. Text is injected, a 250ms consumption window is observed, and the original clipboard is safely restored. If the target application implements UIA `TextPattern`, direct caret insertion is used instead of the clipboard.

### Risk 3: AI Provider Discrepancies & Reasoning Leaks
- **Symptom:** Reasoning models (e.g., Qwen 3.8 or GPT-OSS on Groq) emit `<think>...</think>` tags into the text, or Gemini thinking tokens consume the output token budget and return empty transcripts.
- **Mitigation:**
  - Gemini: Enforce `thinkingConfig: { thinkingBudget: 0 }` and filter candidate parts for `p.text && !p.thought`.
  - Groq: Enforce `include_reasoning: false` and strip reasoning tags via regex before pasting.
  - Automatic multi-provider failover chain ensures zero loss of spoken user input.

### Risk 4: Key-Repeat and Hotkey Leakage
- **Symptom:** Holding down `Ctrl+Alt+Space` causes Windows to fire repeated keydown events, typing spaces into the user's active code editor or document.
- **Mitigation:** The low-level keyboard hook callback tracks `_isHotkeyDown` and unconditionally returns `(IntPtr)1` for all repeated keydown messages, completely consuming them at the Win32 kernel hook layer.

### Risk 5: Native Process Lifecycle & Memory Leaks
- **Symptom:** If Electron crashes or is terminated from Task Manager, `VeoFlowHelper.exe` remains running in the background, holding keyboard hooks.
- **Mitigation:** The helper's IPC listener loop detects `Console.ReadLine() == null` (`stdin` EOF) and immediately calls `Application.Exit()`, unhooking the keyboard and terminating itself cleanly.

### Risk 6: Unbounded Audio Buffer & Memory Pressure
- **Symptom:** Leaving dictation running accidentally creates huge audio buffers and out-of-memory crashes.
- **Mitigation:** Hardcoded 5-minute safety cutoff in the audio capture state machine. Temporary audio chunks are flushed and garbage-collected immediately after submission.

### Risk 7: Unencrypted API Credentials
- **Symptom:** Plaintext API keys in configuration files are vulnerable to local malware or accidental source repository commits.
- **Mitigation:** In Phase 10, migrate all API key storage to Windows DPAPI encryption using Electron's `safeStorage` API.

---

## 2. Key Architecture Decisions Requiring Resolution

1. **Native Helper Build Pipeline:**
   - *Current:* Compiles via Windows built-in `csc.exe` (.NET Framework 4.0 runtime) into a 25.6 KB binary.
   - *Decision:* Maintain the lightweight `build.bat` script for zero-install portability, while introducing a modern .NET 8+ project solution (`VeoFlowHelper.sln`) for developer tooling and xUnit test automation.
2. **Database Engine Transition:**
   - *Current:* Atomic JSON file (`~/.veoflow/veoflow_store.json`).
   - *Decision:* Migrate to `node:sqlite` (native in Node 24 LTS) in Phase 09, avoiding external binary compilation while providing full ACID relational capabilities.
3. **Audio Transport Format:**
   - *Current:* `audio/webm;codecs=opus` recorded via MediaRecorder.
   - *Decision:* Both Groq and Gemini accept WebM Opus directly. For OpenAI upload fallbacks, implement on-the-fly WAV conversion.

