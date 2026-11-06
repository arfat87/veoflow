using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
using System.Windows.Automation;

namespace VeoFlow.Helper
{
    public class InjectionResult
    {
        public bool Success { get; set; }
        public string Status { get; set; } // "verified", "unverified", "aborted", "failed", "target_mismatch"
        public string Strategy { get; set; } // "uia_value", "clipboard_paste", "send_input_unicode"
        public bool Verified { get; set; }
        public string TargetHwnd { get; set; }
        public bool ClipboardRestored { get; set; }
        public string TransactionId { get; set; }
        public string ErrorMessage { get; set; }

        public InjectionResult()
        {
            Success = false;
            Status = "pending";
            Strategy = "clipboard_paste";
            Verified = false;
            TargetHwnd = "0x0";
            ClipboardRestored = false;
            TransactionId = "";
            ErrorMessage = "";
        }
    }

    public static class TextInjector
    {
        public const int CLIPBOARD_CONSUMPTION_WAIT_MS = 250;

        public static bool ExecutePaste(string text)
        {
            IntPtr fg = NativeMethods.GetForegroundWindow();
            string fgHwnd = fg != IntPtr.Zero ? "0x" + fg.ToInt64().ToString("X") : "0x0";
            var result = ExecuteInjection(text, fgHwnd, "auto", null);
            return result.Success;
        }

        public static bool TryParseHwnd(string targetHwnd, out IntPtr targetPtr)
        {
            targetPtr = IntPtr.Zero;
            if (string.IsNullOrEmpty(targetHwnd)) return false;

            string trimmed = targetHwnd.Trim();
            if (trimmed == "0x0" || trimmed == "0" || trimmed.Length == 0) return false;

            long val = 0;
            bool parsed = false;
            if (trimmed.StartsWith("0x", StringComparison.OrdinalIgnoreCase))
            {
                parsed = long.TryParse(trimmed.Substring(2), System.Globalization.NumberStyles.HexNumber, null, out val);
            }
            else
            {
                parsed = long.TryParse(trimmed, out val);
            }

            if (!parsed || val == 0) return false;
            targetPtr = new IntPtr(val);
            return true;
        }

        public static bool IsMatchingForeground(IntPtr targetPtr, IntPtr foregroundHwnd)
        {
            if (targetPtr == IntPtr.Zero || foregroundHwnd == IntPtr.Zero) return false;
            if (targetPtr == foregroundHwnd) return true;

            IntPtr targetRoot = NativeMethods.GetAncestor(targetPtr, NativeMethods.GA_ROOT);
            IntPtr foregroundRoot = NativeMethods.GetAncestor(foregroundHwnd, NativeMethods.GA_ROOT);

            if (targetRoot != IntPtr.Zero && targetRoot == foregroundHwnd) return true;
            if (foregroundRoot != IntPtr.Zero && foregroundRoot == targetPtr) return true;
            if (targetRoot != IntPtr.Zero && foregroundRoot != IntPtr.Zero && targetRoot == foregroundRoot) return true;

            return false;
        }

        public static InjectionResult ExecuteInjection(string text, string targetHwnd = null, string strategy = "auto", string transactionId = null)
        {
            var result = new InjectionResult
            {
                TargetHwnd = targetHwnd ?? "0x0",
                TransactionId = transactionId ?? "",
                Strategy = strategy ?? "auto"
            };

            if (string.IsNullOrEmpty(text))
            {
                result.Status = "failed";
                result.ErrorMessage = "Text payload is empty";
                return result;
            }

            NativeMethods.EnsureAttachedToInputDesktop();

            // 1. Strict Target Validation (Requirement 6: Abort if HWND is zero, invalid, destroyed or inaccessible)
            IntPtr targetPtr;
            if (!TryParseHwnd(targetHwnd, out targetPtr))
            {
                result.Status = "aborted";
                result.ErrorMessage = "Target HWND is zero or invalid: strict foreground verification requires a verified target window";
                return result;
            }

            if (!NativeMethods.IsWindow(targetPtr))
            {
                result.Status = "aborted";
                result.ErrorMessage = "Target window does not exist or has been destroyed";
                return result;
            }

            // 2. Capture target process ID and executable identity (Requirement 2)
            uint targetPid = 0;
            NativeMethods.GetWindowThreadProcessId(targetPtr, out targetPid);
            if (targetPid == 0)
            {
                result.Status = "aborted";
                result.ErrorMessage = "Target window process is inaccessible or terminated";
                return result;
            }

            // 3. Strict Foreground Verification (Requirement 1, 3: Abort if target is not verified active foreground window)
            IntPtr currentHwnd = NativeMethods.GetForegroundWindow();
            if (currentHwnd == IntPtr.Zero)
            {
                result.Status = "aborted";
                result.ErrorMessage = "No active foreground window detected on desktop";
                return result;
            }

            uint currentPid = 0;
            NativeMethods.GetWindowThreadProcessId(currentHwnd, out currentPid);

            if (!IsMatchingForeground(targetPtr, currentHwnd) || targetPid != currentPid)
            {
                // SECURITY ENFORCEMENT: Remove background-window injection workaround.
                // Never attempt SetForegroundWindow() to activate background targets.
                result.Status = "aborted";
                result.ErrorMessage = string.Format("Target window 0x{0:X} (PID {1}) is not the active foreground window 0x{2:X} (PID {3})",
                    targetPtr.ToInt64(), targetPid, currentHwnd.ToInt64(), currentPid);
                return result;
            }

            // 4. UI Automation Insertion Strategy Check (Requirement 4 & 7: Do not allow UIA to write to background windows)
            string chosenStrategy = (strategy ?? "auto").ToLower();
            if (chosenStrategy == "uia" || chosenStrategy == "auto")
            {
                bool uiaSuccess = TryUiaDirectInsertion(text, targetPtr, targetPid, ref result);
                if (uiaSuccess)
                {
                    return result;
                }

                if (result.Status == "aborted")
                {
                    // Foreground window changed; abort immediately
                    return result;
                }

                // If UIA was explicitly demanded but failed, do not proceed unless auto
                if (chosenStrategy == "uia")
                {
                    result.Status = "failed";
                    result.ErrorMessage = "UIA insertion not supported on focused element";
                    return result;
                }
            }

            // 5. Keyboard / Clipboard Injection with Strict Revalidation (Requirement 4, 5, 8, 9)
            if (chosenStrategy == "send_input_unicode")
            {
                ExecuteDirectKeystrokeInjection(text, targetPtr, targetPid, ref result);
            }
            else
            {
                ExecuteClipboardInjection(text, targetPtr, targetPid, ref result);
            }

            return result;
        }

        private static bool TryUiaDirectInsertion(string text, IntPtr targetPtr, uint targetPid, ref InjectionResult result)
        {
            bool success = false;
            try
            {
                // Revalidate active foreground window immediately before inspecting UI element
                IntPtr currentFg = NativeMethods.GetForegroundWindow();
                if (!IsMatchingForeground(targetPtr, currentFg))
                {
                    result.Status = "aborted";
                    result.ErrorMessage = "Foreground window changed before UI Automation inspection";
                    return false;
                }

                AutomationElement focused = AutomationElement.FocusedElement;
                if (focused == null)
                {
                    return false;
                }

                // Verify focused element belongs to the verified target process
                if ((uint)focused.Current.ProcessId != targetPid)
                {
                    return false;
                }

                object valPatternObj;
                if (focused.TryGetCurrentPattern(ValuePattern.Pattern, out valPatternObj))
                {
                    ValuePattern valPattern = (ValuePattern)valPatternObj;
                    if (valPattern.Current.IsReadOnly)
                    {
                        return false;
                    }

                    string currentVal = valPattern.Current.Value ?? "";

                    // Rule: NEVER overwrite an entire field accidentally.
                    // Only set value if the current control is empty!
                    if (string.IsNullOrEmpty(currentVal))
                    {
                        // Revalidate active foreground window IMMEDIATELY before SetValue
                        IntPtr fgRightBeforeSet = NativeMethods.GetForegroundWindow();
                        if (!IsMatchingForeground(targetPtr, fgRightBeforeSet))
                        {
                            result.Status = "aborted";
                            result.ErrorMessage = "Foreground window changed immediately before UIA SetValue";
                            return false;
                        }

                        valPattern.SetValue(text);
                        Thread.Sleep(50);

                        // Post-insertion verification
                        string postVal = valPattern.Current.Value ?? "";
                        if (postVal.Contains(text))
                        {
                            result.Success = true;
                            result.Strategy = "uia_value";
                            result.Status = "verified";
                            result.Verified = true;
                            success = true;
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                // UIPI boundary or permission issue
                if (ex.Message.IndexOf("access", StringComparison.OrdinalIgnoreCase) >= 0 ||
                    ex.Message.IndexOf("denied", StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    result.ErrorMessage = "UI Automation access denied by UIPI (target may be running elevated)";
                }
            }

            return success;
        }

        private static void ExecuteClipboardInjection(string text, IntPtr targetPtr, uint targetPid, ref InjectionResult result)
        {
            InjectionResult localResult = result;
            Thread pasteThread = new Thread(() =>
            {
                NativeMethods.EnsureAttachedToInputDesktop();
                IDataObject previousData = null;
                string previousText = null;
                bool hadPreviousContent = false;

                // 1. Revalidate active foreground window before touching clipboard
                IntPtr fgBeforeClip = NativeMethods.GetForegroundWindow();
                if (!IsMatchingForeground(targetPtr, fgBeforeClip))
                {
                    localResult.Status = "aborted";
                    localResult.Success = false;
                    localResult.ErrorMessage = "Foreground window changed before clipboard operation";
                    return;
                }

                // 2. Capture original clipboard contents
                try
                {
                    if (Clipboard.ContainsText())
                    {
                        previousText = Clipboard.GetText();
                        hadPreviousContent = true;
                    }
                    previousData = Clipboard.GetDataObject();
                    if (previousData != null) hadPreviousContent = true;
                }
                catch { }

                try
                {
                    // 3. Set temporary payload on clipboard
                    bool clipSet = false;
                    for (int retry = 0; retry < 5; retry++)
                    {
                        try
                        {
                            Clipboard.SetText(text);
                            clipSet = true;
                            break;
                        }
                        catch
                        {
                            Thread.Sleep(30);
                        }
                    }

                    if (!clipSet)
                    {
                        localResult.Status = "failed";
                        localResult.Success = false;
                        localResult.ErrorMessage = "Clipboard locked by another process";
                        return;
                    }

                    // 4. REVALIDATE FOREGROUND WINDOW IMMEDIATELY BEFORE SendCtrlV() (Requirement 4 & 5)
                    IntPtr fgRightBeforePaste = NativeMethods.GetForegroundWindow();
                    if (!IsMatchingForeground(targetPtr, fgRightBeforePaste))
                    {
                        // ABORT! Foreground window switched away from target before keystroke
                        // Restore original clipboard immediately to prevent data leakage (Requirement 8 & 9)
                        localResult.ClipboardRestored = RestoreClipboard(previousData, previousText, hadPreviousContent, text);
                        localResult.Status = "aborted";
                        localResult.Success = false;
                        localResult.ErrorMessage = string.Format("Foreground window switched away from target (active: 0x{0:X}) immediately before keystroke", fgRightBeforePaste.ToInt64());
                        return;
                    }

                    // 5. Send keystrokes
                    SendCtrlV();
                    localResult.Success = true;
                    localResult.Strategy = "clipboard_paste";

                    // Allow target application to consume clipboard
                    Thread.Sleep(CLIPBOARD_CONSUMPTION_WAIT_MS);

                    // 6. Post-paste verification via UI Automation or focus check (Requirement 10)
                    VerifyInsertion(text, targetPtr, targetPid, ref localResult);

                    // 7. Safe Clipboard Restoration (Requirements 8 & 9)
                    localResult.ClipboardRestored = RestoreClipboard(previousData, previousText, hadPreviousContent, text);
                }
                catch (Exception ex)
                {
                    // On failure, ALWAYS restore original clipboard!
                    localResult.ClipboardRestored = RestoreClipboard(previousData, previousText, hadPreviousContent, text);
                    localResult.Status = "failed";
                    localResult.Success = false;
                    localResult.ErrorMessage = ex.Message;
                }
            });

            pasteThread.SetApartmentState(ApartmentState.STA);
            pasteThread.IsBackground = true;
            pasteThread.Start();
            pasteThread.Join(5000);

            result = localResult;
        }

        private static void ExecuteDirectKeystrokeInjection(string text, IntPtr targetPtr, uint targetPid, ref InjectionResult result)
        {
            // Revalidate foreground window before sending keystrokes
            IntPtr fg = NativeMethods.GetForegroundWindow();
            if (!IsMatchingForeground(targetPtr, fg))
            {
                result.Status = "aborted";
                result.Success = false;
                result.ErrorMessage = "Foreground window changed before direct keystroke injection";
                return;
            }

            SendDirectText(text);
            result.Success = true;
            result.Strategy = "send_input_unicode";
            Thread.Sleep(100);
            VerifyInsertion(text, targetPtr, targetPid, ref result);
        }

        private static bool RestoreClipboard(IDataObject previousData, string previousText, bool hadPreviousContent, string temporaryPayload)
        {
            for (int retry = 0; retry < 10; retry++)
            {
                try
                {
                    string currentText = null;
                    if (Clipboard.ContainsText())
                    {
                        currentText = Clipboard.GetText();
                    }

                    // Only restore if the clipboard still contains our temporary payload.
                    // If user or external process copied new content, preserve that external data!
                    if (currentText == temporaryPayload)
                    {
                        if (hadPreviousContent)
                        {
                            if (!string.IsNullOrEmpty(previousText))
                            {
                                Clipboard.SetText(previousText);
                                return true;
                            }
                            else if (previousData != null)
                            {
                                Clipboard.SetDataObject(previousData, true);
                                return true;
                            }
                        }

                        // Previous clipboard was empty: clear temporary payload to ensure it is not retained!
                        Clipboard.Clear();
                        return true;
                    }
                    else
                    {
                        // External data has modified clipboard; preserve it!
                        return false;
                    }
                }
                catch
                {
                    Thread.Sleep(50);
                }
            }
            return false;
        }

        private static void VerifyInsertion(string text, IntPtr targetPtr, uint targetPid, ref InjectionResult result)
        {
            try
            {
                FocusContextData focus = UIAutomationReader.InspectFocusedElement(150);
                if (!string.IsNullOrEmpty(focus.Contents) && focus.Contents.Contains(text))
                {
                    result.Verified = true;
                    result.Status = "verified";
                    return;
                }
            }
            catch { }

            // If verification could not read text directly, report unverified (Requirement 10)
            result.Verified = false;
            result.Status = "unverified";
        }

        private static void SendCtrlV()
        {
            NativeMethods.INPUT[] inputs = new NativeMethods.INPUT[4];
            int size = Marshal.SizeOf(typeof(NativeMethods.INPUT));

            // Ctrl Down
            inputs[0].type = NativeMethods.INPUT_KEYBOARD;
            inputs[0].u.ki.wVk = NativeMethods.VK_CONTROL;

            // V Down
            inputs[1].type = NativeMethods.INPUT_KEYBOARD;
            inputs[1].u.ki.wVk = NativeMethods.VK_V;

            // V Up
            inputs[2].type = NativeMethods.INPUT_KEYBOARD;
            inputs[2].u.ki.wVk = NativeMethods.VK_V;
            inputs[2].u.ki.dwFlags = NativeMethods.KEYEVENTF_KEYUP;

            // Ctrl Up
            inputs[3].type = NativeMethods.INPUT_KEYBOARD;
            inputs[3].u.ki.wVk = NativeMethods.VK_CONTROL;
            inputs[3].u.ki.dwFlags = NativeMethods.KEYEVENTF_KEYUP;

            NativeMethods.SendInput((uint)inputs.Length, inputs, size);
        }

        public static void SendDirectText(string text)
        {
            if (string.IsNullOrEmpty(text)) return;
            NativeMethods.INPUT[] inputs = new NativeMethods.INPUT[text.Length * 2];
            int size = Marshal.SizeOf(typeof(NativeMethods.INPUT));
            int idx = 0;

            foreach (char c in text)
            {
                // Key Down
                inputs[idx].type = NativeMethods.INPUT_KEYBOARD;
                inputs[idx].u.ki.wVk = 0;
                inputs[idx].u.ki.wScan = (ushort)c;
                inputs[idx].u.ki.dwFlags = NativeMethods.KEYEVENTF_UNICODE;
                idx++;

                // Key Up
                inputs[idx].type = NativeMethods.INPUT_KEYBOARD;
                inputs[idx].u.ki.wVk = 0;
                inputs[idx].u.ki.wScan = (ushort)c;
                inputs[idx].u.ki.dwFlags = NativeMethods.KEYEVENTF_UNICODE | NativeMethods.KEYEVENTF_KEYUP;
                idx++;
            }

            NativeMethods.SendInput((uint)inputs.Length, inputs, size);
        }
    }
}
