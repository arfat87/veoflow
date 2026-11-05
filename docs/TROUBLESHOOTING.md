# VeoFlow Troubleshooting Guide 🛠️

This guide covers common issues, root cause diagnostics, and step-by-step solutions for **VeoFlow v1.0.0**.

---

## 📑 Diagnostic Quick Navigation
- [1. Audio & Microphone Issues](#1-audio--microphone-issues)
- [2. Global Hotkey & Push-to-Talk Issues](#2-global-hotkey--push-to-talk-issues)
- [3. Native Helper (VeoFlowHelper.exe) Diagnostics](#3-native-helper-veoflowhelperexe-diagnostics)
- [4. Text Injection & Target Window Issues](#4-text-injection--target-window-issues)
- [5. AI Provider & Transcription Errors](#5-ai-provider--transcription-errors)
- [6. Antivirus & SmartScreen Warnings](#6-antivirus--smartscreen-warnings)
- [7. Log Inspection & Diagnostics](#7-log-inspection--diagnostics)

---

## 1. Audio & Microphone Issues

### Symptom: HUD stays in `Recording...` but no waveform moves, or transcript is empty.
- **Cause 1: Windows Microphone Privacy Setting Disabled.**
  - *Fix:* Open Windows **Settings** (`Win + I`) -> **Privacy & security** -> **Microphone**.
  - Toggle **Microphone access** to **On**.
  - Toggle **Let desktop apps access your microphone** to **On**.
- **Cause 2: Wrong Default Microphone Selected.**
  - *Fix:* Open VeoFlow **Settings** -> **Audio**.
  - Ensure the active microphone is selected from the dropdown rather than an inactive or virtual audio cable device.
- **Cause 3: Exclusive Mode Lockout.**
  - Another application (e.g., DAW or communication software) may have claimed exclusive control of the microphone.
  - *Fix:* Open Windows Sound Control Panel (`mmsys.cpl`) -> **Recording** tab -> Right-click Microphone -> **Properties** -> **Advanced** tab -> Uncheck *"Allow applications to take exclusive control of this device"*.

---

## 2. Global Hotkey & Push-to-Talk Issues

### Symptom: Pressing `Ctrl + Alt + Space` does not trigger the HUD or recording.
- **Cause 1: Hotkey Conflict.**
  - Another application (such as an IDE, language input switcher, or screen recorder) may have already bound `Ctrl + Alt + Space`.
  - *Fix:* Open VeoFlow **Settings** -> **General** -> **Global Shortcut**, and change the key combination (e.g. to `Win + Alt + Space` or `F8`).
- **Cause 2: VeoFlow is Muted or Paused.**
  - Check the System Tray icon. If it shows paused/muted, right-click the tray icon and select **Resume**.
- **Cause 3: Helper Process Terminated.**
  - If `VeoFlowHelper.exe` encountered an unhandled exception, the keyboard hook may be disarmed.
  - *Fix:* Check System Tray -> **Restart Helper**, or restart VeoFlow. Check `%USERPROFILE%\.veoflow\logs\helper.log` for error details.

---

## 3. Native Helper (VeoFlowHelper.exe) Diagnostics

### Symptom: VeoFlow displays an error stating the native helper is not responding.
- **Cause 1: Missing .NET Framework Runtime.**
  - `VeoFlowHelper.exe` requires .NET Framework 4.7.2 or later (standard on Windows 10 & 11).
  - *Fix:* Verify .NET installation by checking `reg query "HKLM\SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full" /v Release`. If below 461808, run Windows Update to install latest .NET Framework.
- **Cause 2: Blocked by Antivirus / Security Software.**
  - Because `VeoFlowHelper.exe` installs a global low-level Windows keyboard hook (`WH_KEYBOARD_LL`) to capture push-to-talk events system-wide, heuristic antivirus scanners might flag the binary.
  - *Fix:* Add an exclusion for `%LOCALAPPDATA%\Programs\VeoFlow\resources\bin\VeoFlowHelper.exe`. Verify the SHA-256 hash matches the release hash in [RELEASE_NOTES.md](file:///c:/MY_ALL_ITEM\rea\veoflow\RELEASE_NOTES.md).
- **Cause 3: UIPI (User Interface Privilege Isolation) Block.**
  - If the active target window is running **As Administrator** (elevated `cmd.exe`, `powershell.exe`, or elevated IDE) while VeoFlow is running as standard user, Windows prevents lower-integrity processes from sending inputs or inspecting elements of higher-integrity processes.
  - *Fix:* Run VeoFlow as Administrator if you routinely dictate into elevated tools.

---

## 4. Text Injection & Target Window Issues

### Symptom: Audio transcribes successfully, but text is not typed into the application.
- **Diagnostics:**
  - VeoFlow first uses **UI Automation** (`TextPattern` or `ValuePattern`).
  - If the target application does not expose UI Automation edit patterns, VeoFlow falls back to **Clipboard Injection** (`Ctrl + V`).
- **Cause 1: Target Window Lost Focus Before Insertion.**
  - If you clicked away or switched windows while the audio was transcribing, VeoFlow's target window revalidator aborts insertion to prevent accidental typing into the wrong window.
  - *Fix:* Keep focus on your target textbox until insertion completes (typically < 500ms).
- **Cause 2: Target Window Is Read-Only.**
  - The focused control does not accept text input.
- **Cause 3: Clipboard Lock.**
  - Another clipboard manager (e.g. Ditto or Windows Clipboard History `Win + V`) may be locking the Windows clipboard temporarily.
  - *Fix:* VeoFlow implements retry logic with exponential backoff. If it still fails, check `%USERPROFILE%\.veoflow\logs\app.log` for clipboard acquisition errors.

---

## 5. AI Provider & Transcription Errors

| Error Code / Message | Root Cause | Actionable Solution |
|---|---|---|
| `HTTP 401 Unauthorized` | Invalid, expired, or missing API key. | Open **Settings** -> **Providers**, re-enter your API key, and click **Test Connection**. |
| `HTTP 429 Too Many Requests` | Provider rate limit exceeded. | VeoFlow automatically backs off and retries. If the issue persists, configure a secondary fallback provider or check your quota at your provider's console. |
| `HTTP 408 / Timeout` | Network latency exceeded 15 seconds. | Check internet connectivity. Switch to **Groq Whisper Turbo** for sub-second transcription. |
| `Audio format unsupported` | Audio codec conversion failed. | Ensure 16 kHz 16-bit PCM WAV encoding is active (default). |

---

## 6. Antivirus & SmartScreen Warnings

VeoFlow is built directly from open source. It is unsigned because commercial EV code-signing certificates require costly annual hardware tokens.

- **Microsoft Defender SmartScreen:**
  - Click **More info** -> **Run anyway**.
- **Windows Defender Heuristic Alerts:**
  - `VeoFlowHelper.exe` uses `SetWindowsHookEx(WH_KEYBOARD_LL, ...)` and `SendInput`. These are standard Win32 APIs for global hotkeys and text input tools, but some generic heuristics flag them.
  - You can verify the source code in `helper/Program.cs` and compile the binary yourself using the instructions in `README.md`.

---

## 7. Log Inspection & Diagnostics

When seeking assistance or reporting a bug, inspect the following diagnostic logs:

### Log Files:
- **Application Core Log:**
  ```
  %USERPROFILE%\.veoflow\logs\app.log
  ```
- **Native Helper Log:**
  ```
  %USERPROFILE%\.veoflow\logs\helper.log
  ```
- **Local Database / Store:**
  ```
  %USERPROFILE%\.veoflow\veoflow_store.json
  ```

### Launching in Verbose Debug Mode:
To see all live internal logging in a console window:
```powershell
& "$env:LOCALAPPDATA\Programs\VeoFlow\VeoFlow.exe" --enable-logging
```
Or when running from source:
```bash
npm run start:dev
```

