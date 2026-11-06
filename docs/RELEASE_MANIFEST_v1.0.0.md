# VeoFlow v1.0.0 Release Candidate Manifest

**Release Version:** `1.0.0`  
**Build Date:** November 6, 2026  
**Target Platform:** Windows 10 / Windows 11 (x64)  
**Distribution Output Folder:** `dist_release_candidate/`  
**Electron Version:** `34.5.8`  
**Embedded Node Version:** `20.19.1`  
**C# Helper Framework:** .NET Framework 4.7.2+ (64-bit Native C#)

---

## 1. Verified Release Artifacts

All artifacts in this release candidate were built from source with verified codebases:
- Clean C# helper compilation from `helper/src/` with strict active foreground window enforcement.
- Renderer assets built via Vite production bundling.
- Electron distribution packaged via `electron-builder v26.18.0`.

| Artifact File | Relative Path | Type | File Size (Bytes) | SHA-256 Hash |
|---|---|---|---|---|
| **`VeoFlow-Setup-1.0.0-x64.exe`** | `dist_release_candidate/VeoFlow-Setup-1.0.0-x64.exe` | NSIS Setup Installer | 99,385,066 | `DC70A12BA2607ADC52A4D9484ABABC09D2ED7855A86C1E5C099737773AF92018` |
| **`VeoFlow-Portable-1.0.0-x64.exe`** | `dist_release_candidate/VeoFlow-Portable-1.0.0-x64.exe` | Standalone Portable EXE | 86,658,615 | `DA625847894ADFF702A654A6D4E63B4B661BC5731405AEC6B33865A4E65C5C25` |
| **`VeoFlow.exe`** | `dist_release_candidate/win-unpacked/VeoFlow.exe` | Core Unpacked Executable | 190,557,184 | `B826695B544127A5C2BFF73FE361C53BEB41BC2EB20A8B97551C591CD142C359` |
| **`VeoFlowHelper.exe` (Packaged)** | `dist_release_candidate/win-unpacked/resources/bin/VeoFlowHelper.exe` | Native Companion Binary | 47,616 | `4599C3E0737CEE185054F10E9125F995373D14624EE3032BD7D2B5DDA51B1860` |
| **`VeoFlowHelper.exe` (Source)** | `helper/bin/VeoFlowHelper.exe` | Native Companion Binary | 47,616 | `4599C3E0737CEE185054F10E9125F995373D14624EE3032BD7D2B5DDA51B1860` |
| **`VeoFlow-Setup-1.0.0-x64.exe.blockmap`** | `dist_release_candidate/VeoFlow-Setup-1.0.0-x64.exe.blockmap` | NSIS Update Blockmap | 104,344 | `58BBE19939DCDBDF3CFF4A1CB2C9782CFFAFFD3C5BB1491DF293674349F03F49` |
| **`latest.yml`** | `dist_release_candidate/latest.yml` | Auto-updater Metadata | 350 | `EE3D8BFA7082E0524DAFA56C65DB087A47D82EB3C9B1B2E9A63F480196FAC1EE` |

---

## 2. Helper Packaging Integrity Proof

To ensure complete remediation of the Phase 00 baseline blocker (where stale Phase 12 helper binaries remained packaged inside the installer), physical decompression verification was executed:

1. **Source Helper:** `helper/bin/VeoFlowHelper.exe` (47,616 bytes)
   - SHA-256: `4599C3E0737CEE185054F10E9125F995373D14624EE3032BD7D2B5DDA51B1860`
2. **Unpacked Directory Helper:** `dist_release_candidate/win-unpacked/resources/bin/VeoFlowHelper.exe` (47,616 bytes)
   - SHA-256: `4599C3E0737CEE185054F10E9125F995373D14624EE3032BD7D2B5DDA51B1860`
3. **Extracted from NSIS Installer:** `VeoFlow-Setup-1.0.0-x64.exe -> resources\bin\VeoFlowHelper.exe` (47,616 bytes)
   - SHA-256: `4599C3E0737CEE185054F10E9125F995373D14624EE3032BD7D2B5DDA51B1860`
4. **Extracted from Portable Executable:** `VeoFlow-Portable-1.0.0-x64.exe -> resources\bin\VeoFlowHelper.exe` (47,616 bytes)
   - SHA-256: `4599C3E0737CEE185054F10E9125F995373D14624EE3032BD7D2B5DDA51B1860`

**Result:** All four hashes are **byte-for-byte identical**. Zero stale binaries exist in any release artifact.

---

## 3. Package Verification & Clean Startup

- **Executable Invocation:** `dist_release_candidate/win-unpacked/VeoFlow.exe --version`
  - Output: `v20.19.1`
  - Exit Code: `0`
- **Native Helper Unit Tests:** `helper/tests/run_tests.bat`
  - Total Tests: 13
  - Passed: 13 (100%)
  - Failed: 0
- **ASAR Archive Integrity:** `dist_release_candidate/win-unpacked/resources/app.asar`
  - Validated via `npx asar list`. ASAR headers and file contents intact.
- **Isolation Guarantee:**
  - Existing distribution folder `dist_release/` was preserved unmodified.
  - No network deployment or publish actions were performed.

