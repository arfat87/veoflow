# VeoFlow User Guide 🎙️✨

Welcome to the **VeoFlow User Guide**. VeoFlow is an intelligent, context-aware speech dictation and text injection tool designed specifically for Windows power users, developers, and professionals.

---

## 📑 Table of Contents
1. [Core Concepts](#1-core-concepts)
2. [The Floating HUD Interface](#2-the-floating-hud-interface)
3. [Dictation & Recording Controls](#3-dictation--recording-controls)
4. [Context-Aware Tone & Formatting](#4-context-aware-tone--formatting)
5. [Voice Directives & Instruct Mode](#5-voice-directives--instruct-mode)
6. [Custom Vocabulary & Dictionary](#6-custom-vocabulary--dictionary)
7. [Voice Snippets & Dynamic Expansions](#7-voice-snippets--dynamic-expansions)
8. [Application Rules & Privacy Settings](#8-application-rules--privacy-settings)
9. [History Management](#9-history-management)
10. [System Tray & Shortcuts Reference](#10-system-tray--shortcuts-reference)

---

## 1. Core Concepts

VeoFlow differs from standard operating system speech-to-text in three fundamental ways:

1. **Target-Aware Formatting:** VeoFlow inspects the active application you are typing into. In **Visual Studio Code**, it preserves `camelCase`, function syntax, and identifiers. In **Slack**, it uses natural, conversational prose. In **Outlook or Gmail**, it formats with business polish and structured paragraphs.
2. **True Non-Focus Stealing:** VeoFlow operates via a low-level native Windows helper (`VeoFlowHelper.exe`). When the HUD appears or records audio, your active application **never loses focus**.
3. **Dual Smart Text Injection:** VeoFlow first attempts direct insertion via Microsoft Windows UI Automation (`IUIAutomation` TextPattern / ValuePattern) for flicker-free input. If an application (like certain legacy or game windows) does not support UI Automation, it falls back to atomic Win32 `SendInput` (Ctrl+V) with full clipboard preservation and restore.

---

## 2. The Floating HUD Interface

VeoFlow features a minimalist obsidian glassmorphic HUD pill that floats seamlessly on top of your windows.

### Visual States & Indicator Colors

| State | Status Text | Visual Behavior | Description |
|---|---|---|---|
| **Idle** | `Ready` | Subtle obsidian glass, microphone icon | Waiting for hotkey or trigger. |
| **Preparing** | `Preparing...` | Pulsing cyan ring | Initializing audio input device and target window capture. |
| **Recording** | `Recording...` | Real-time cyan 60 FPS audio waveform | Capturing your voice. Speaks into the active microphone. |
| **Stopping** | `Finalizing...` | Smooth transition animation | Flushing PCM buffers and encoding audio. |
| **Transcribing** | `Transcribing...` | Dual animated cyan loading arcs | Converting speech to text via Whisper or Gemini. |
| **Formatting** | `Formatting...` | Rotating emerald accent | Applying context classification and LLM formatting. |
| **Inserting** | `Inserting...` | Pulsing green check icon | Injecting text into target field via UIA or clipboard fallback. |
| **Completed** | `Done` | Brief green flash (1.2s fade) | Text successfully injected. |
| **Error** | `Error: [Reason]` | Rose/Red warning badge | Displays actionable error message (e.g. mic muted, invalid key). |

### Moving & Repositioning the HUD
- **Click and Drag:** Click and hold anywhere on the HUD background to drag it anywhere across your monitors.
- **Position Persistence:** VeoFlow automatically remembers your preferred coordinates across restarts and monitor config changes.

---

## 3. Dictation & Recording Controls

### Activation Modes (Configurable in Settings)

1. **Push-to-Talk (Default & Recommended):**
   - **Press and Hold** `Ctrl + Alt + Space`.
   - Speak naturally while holding the keys.
   - **Release** the keys to immediately stop recording, transcribe, and insert.
   - *Advantage:* Zero lag, no background ambient speech recorded.

2. **Tap-to-Toggle:**
   - **Tap** `Ctrl + Alt + Space` once to start recording.
   - Speak your thoughts.
   - **Tap** `Ctrl + Alt + Space` again to stop recording.
   - *Advantage:* Ideal for long-form dictation, drafting articles, or documentation.

3. **HUD Click:**
   - Click the microphone icon on the HUD pill to toggle recording without touching the keyboard.

---

## 4. Context-Aware Tone & Formatting

VeoFlow automatically inspects the active window executable, class name, and title to classify your workspace:

### Application Profiles

- **Code Editors & Terminals (`Code.exe`, `devenv.exe`, `WindowsTerminal.exe`, `wt.exe`):**
  - Converts verbal code instructions: *"create function get user profile"* -> `function getUserProfile()`
  - Retains symbols: backticks, parentheses, braces, arrows, and operators.
  - Preserves camelCase, snake_case, and kebab-case.
- **Chat & Messaging (`Slack.exe`, `Teams.exe`, `Discord.exe`, `Telegram.exe`):**
  - Keeps sentence structure concise and natural.
  - Automatically handles casual tone and contractions without over-formalizing.
- **Email & Correspondence (`OUTLOOK.EXE`, `Thunderbird.exe`, browser webmail):**
  - Formats with professional paragraphs, capitalization, and business tone.
  - Formats greeting salutations and sign-offs cleanly.
- **Documents (`WINWORD.EXE`, `Notepad.exe`, Google Docs):**
  - Clean paragraphs, formal grammar, and complete punctuation.

---

## 5. Voice Directives & Instruct Mode

When you speak instructions to VeoFlow, its Contextual LLM Formatter recognizes your intent and executes the command directly on your dictated content:

### Examples of Voice Directives:

- **Bullet Points:**
  - *You speak:* *"Format this as bullet points: we need to review the pull request, run integration tests, and push the release candidate to staging."*
  - *VeoFlow outputs:*
    ```markdown
    • Review the pull request
    • Run integration tests
    • Push the release candidate to staging
    ```

- **Translation:**
  - *You speak:* *"Translate into Japanese: Thank you for your email, we will send the proposal tomorrow morning."*
  - *VeoFlow outputs:*
    ```
    メールをお送りいただきありがとうございます。提案書は明日の午前中にお送りいたします。
    ```

- **Tone Shift:**
  - *You speak:* *"Make this sound professional: hey team, the server broke again, someone fix it quick"*
  - *VeoFlow outputs:*
    ```
    Hi team, we are currently experiencing another server outage. Please investigate and remediate the issue as soon as possible.
    ```

---

## 6. Custom Vocabulary & Dictionary

VeoFlow lets you define custom domain vocabulary, acronyms, and proper nouns so the speech recognition model never misinterprets specialized terminology.

### How to Add Vocabulary:
1. Open **Settings** -> **Dictionary**.
2. Click **Add Term**.
3. Enter:
   - **Term / Phrase:** (e.g., `Kubernetes`, `gRPC`, `VeoFlow`, `OAuth2`).
   - **Alternative Spoken Matches:** (e.g., `cube net ease`, `gee are pee see`).
   - **Whole Word Matching:** Check to avoid substring replacements.
   - **Case Sensitive:** Check if capitalization matters (`iOS` vs `ios`).
4. Click **Save**.

---

## 7. Voice Snippets & Dynamic Expansions

Voice Snippets allow you to dictate a short trigger word or phrase and have VeoFlow instantly insert a large pre-written template or block of text.

### Example Snippets:

| Voice Trigger | Expanded Content |
|---|---|
| `insert bug template` | `**Steps to Reproduce:**\n1. \n**Expected:**\n\n**Actual:**\n` |
| `my calendly link` | `Feel free to schedule time on my calendar here: https://calendly.com/user/30min` |
| `standard signature` | `Best regards,\nAlex Mercer\nStaff Systems Engineer` |

To configure, navigate to **Settings** -> **Snippets** -> **Add Snippet**.

---

## 8. Application Rules & Privacy Settings

VeoFlow puts user privacy and security first:

### Privacy Controls
- **Window Title Capture:** Can be toggled On/Off in Settings. When disabled, VeoFlow only inspects the executable binary name (`Code.exe`) and never inspects sensitive window titles or document names.
- **Context Extraction:** By default, textbox surrounding content and selection capture are **disabled**. You can enable them explicitly per application.
- **Local Credential Security:** All API keys are encrypted via **Windows DPAPI** (`safeStorage`). Keys never leave your machine except when sent directly to the official HTTPS endpoint of your chosen provider.

### Exclusion Rules
You can blacklist specific applications where dictation should never be allowed (e.g., password managers like `1Password.exe`, banking portals, or confidential internal software).

---

## 9. History Management

VeoFlow maintains a full, searchable local log of all dictations:
- **Search:** Search across transcripts, formatted outputs, and target application names.
- **Inspect:** View processing duration, providers used, audio length, and insertion status.
- **Copy:** One-click copy any past dictation to the clipboard.
- **Re-insert:** Re-inject past dictation into any active window.
- **Export:** Export history to JSON or CSV for archiving.
- **Clear:** Delete individual items or wipe entire history with one click.

---

## 10. System Tray & Shortcuts Reference

### Keyboard Shortcuts
- `Ctrl + Alt + Space`: Default Dictation Hotkey (Push-to-Talk or Toggle).
- `Esc`: Cancel active recording without transcribing or inserting.
- `Ctrl + Shift + V`: (Optional) Re-insert last dictation.

### System Tray Menu Options
- **Open Settings:** Displays the multi-tab preferences window.
- **Toggle HUD:** Show or hide the floating HUD pill.
- **Mute / Pause:** Temporarily disarms the global hotkey.
- **Check for Updates:** Securely checks for newer releases.
- **Quit VeoFlow:** Safely shuts down the native helper and background processes.

