# VeoFlow Installation Guide (Windows x64)

This guide provides instructions for installing, verifying, and configuring **VeoFlow v1.0.0** on Windows 10 and Windows 11.

---

## 💻 System Requirements

| Specification | Minimum Requirement | Recommended |
|---|---|---|
| **Operating System** | Windows 10 (64-bit, 1903+) | Windows 11 (64-bit, 22H2+) |
| **Processor** | Intel Core i3 / AMD Ryzen 3 | Intel Core i5 / AMD Ryzen 5 or better |
| **RAM** | 4 GB | 8 GB or more |
| **Disk Space** | 350 MB free disk space | 1 GB (for audio buffers & history store) |
| **Audio** | Working microphone / audio input | Directional or noise-canceling mic |
| **Network** | Broadband internet connection | Low-latency connection (<100ms) |
| **Runtime** | Built-in .NET Framework 4.7.2+ | Bundled with Windows 10 & 11 |

---

## 📦 Distribution Packages

VeoFlow is packaged in two formats:

1. **NSIS Setup Installer (`VeoFlow-Setup-1.0.0-x64.exe`)**:
   - Standard Windows setup wizard.
   - Installs per-user to `%LOCALAPPDATA%\Programs\VeoFlow`.
   - Creates Start Menu shortcuts and optional Desktop shortcut.
   - Registers Windows Add/Remove Programs entry with clean uninstallation.
   - Supports optional auto-launch on Windows login.

2. **Portable Executable (`VeoFlow-Portable-1.0.0-x64.exe`)**:
   - Zero-installation standalone binary.
   - Can be run directly from any folder or USB drive.
   - Stores settings and user history in standard `%USERPROFILE%\.veoflow`.

---

## 🛡️ Code Signing & SmartScreen Notice

> [!IMPORTANT]
> **Code Signing Disclosure:** VeoFlow v1.0.0 is an open-source release compiled locally without an expensive commercial EV Authenticode certificate. The binaries are **unsigned** (or test-signed). **We never claim a binary is signed when it is not.**

Because of this, Windows Defender SmartScreen may display:
> *"Windows protected your PC — Microsoft Defender SmartScreen prevented an unrecognized app from starting."*

### How to Bypass SmartScreen Safely:
1. Click **More info**.
2. Verify the publisher is listed as **Unknown Publisher** and the application name is **VeoFlow-Setup-1.0.0-x64.exe**.
3. Verify the SHA-256 hash against the official checksum provided in [RELEASE_NOTES.md](file:///c:/MY_ALL_ITEM/rea/veoflow/RELEASE_NOTES.md) (see verification instructions below).
4. Click **Run anyway**.

---

## 🔍 Verifying Release Integrity (SHA-256)

Before running the installer or portable executable, verify its SHA-256 checksum in PowerShell:

```powershell
# In PowerShell:
Get-FileHash -Algorithm SHA256 .\VeoFlow-Setup-1.0.0-x64.exe
```

Compare the computed hash string with the official release hash in `RELEASE_NOTES.md`.

---

## 🚀 Step-by-Step Installation (Setup Wizard)

1. **Download & Launch:**
   - Double-click `VeoFlow-Setup-1.0.0-x64.exe`.
2. **Installation Options:**
   - Choose install directory (Default: `%LOCALAPPDATA%\Programs\VeoFlow`).
   - Choose whether to create desktop shortcut.
3. **Finish & Launch:**
   - Check **Run VeoFlow** and click **Finish**.
4. **First-Time Launch Initialization:**
   - VeoFlow initializes the native helper binary (`VeoFlowHelper.exe`).
   - The floating HUD pill appears on your primary display.
   - The VeoFlow icon appears in the Windows System Tray (notification area).

---

## 🎙️ Windows Permissions Setup

### 1. Microphone Access
VeoFlow requires microphone access to capture voice dictation.
- Windows Settings -> **Privacy & security** -> **Microphone**.
- Ensure **Microphone access** is toggled **On**.
- Ensure **Let apps access your microphone** and **Let desktop apps access your microphone** are toggled **On**.

### 2. UI Automation & Accessibility
- VeoFlow does **not** require administrative privileges for normal operation.
- UI Automation text insertion and `SendInput` run within standard medium integrity level for standard desktop applications.
- *Note:* If you are dictating into an application running **As Administrator** (elevated command prompt / elevated editor), Windows UIPI (User Interface Privilege Isolation) prevents standard apps from sending inputs to elevated windows. In such cases, run VeoFlow as administrator if dictating into elevated tools is required.

---

## ⚙️ Post-Installation Configuration

1. **Configure AI Provider API Key:**
   - Click the **Gear** icon on the floating HUD, or right-click the system tray icon and select **Settings**.
   - Navigate to the **Providers** tab.
   - Enter your API Key for at least one supported provider:
     - **Google Gemini** (Recommended for multimodal transcription + contextual formatting).
     - **Groq** (Recommended for ultra-fast <250ms Whisper transcription).
     - **OpenAI** (Standard Whisper & GPT formatting).
   - Click **Test Connection** to verify your key and network connectivity.
   - Click **Save**.

2. **Select Hotkey:**
   - Default hotkey is `Ctrl + Alt + Space`.
   - Customize hotkey mode in Settings -> **General** (Push-to-Talk or Tap-to-Toggle).

---

## 🔄 Updates Subsystem

VeoFlow includes an automated update verification engine:
- Downloads update packages to temporary staging.
- Verifies package SHA-256 hash using timing-safe comparisons before any installation.
- Automatically creates a rollback snapshot of previous binaries before applying updates.
- If a hash mismatch or corrupt file is detected, the update is immediately rejected and deleted (`UntrustedUpdateError`).

---

## 🗑️ Clean Uninstallation

### Standard Uninstallation:
1. Open Windows **Settings** -> **Apps** -> **Installed apps**.
2. Locate **VeoFlow**, click `...`, and select **Uninstall**.
3. The NSIS uninstaller will cleanly remove:
   - All executable binaries (`VeoFlow.exe`, `VeoFlowHelper.exe`).
   - All runtime resources, asar archives, and dependencies.
   - Start Menu and Desktop shortcuts.
   - Startup registry entries (`HKCU\Software\Microsoft\Windows\CurrentVersion\Run`).

### Full Data Wipe (Optional):
By default, your custom vocabulary, voice snippets, and dictation history are safely preserved in:
```
%USERPROFILE%\.veoflow\
```
To perform a complete wipe of all user data and credentials:
```powershell
Remove-Item -Recurse -Force "$env:USERPROFILE\.veoflow"
```

