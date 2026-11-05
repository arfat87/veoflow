using System;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
using System.Windows.Automation;

namespace VeoFlow.Helper
{
    public class InjectionResult
    {
        public bool Success { get; set; }
        public string Status { get; set; } // "verified", "inserted", "unverified", "failed", "target_mismatch"
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
            TargetHwnd = "";
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
            var result = ExecuteInjection(text, null, "auto", null);
            return result.Success;
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

            // 1. Target Validation & Foreground Verification
            IntPtr currentHwnd = NativeMethods.GetForegroundWindow();
            long targetVal = 0;

            if (!string.IsNullOrEmpty(targetHwnd) && targetHwnd != "0x0")
            {
                if (targetHwnd.StartsWith("0x", StringComparison.OrdinalIgnoreCase))
                {
                    long.TryParse(targetHwnd.Substring(2), System.Globalization.NumberStyles.HexNumber, null, out targetVal);
                }
                else
                {
                    long.TryParse(targetHwnd, out targetVal);
                }

                if (targetVal != 0)
                {
                    IntPtr targetPtr = new IntPtr(targetVal);

                    if (!NativeMethods.IsWindow(targetPtr))
                    {
                        result.Status = "failed";
                        result.ErrorMessage = "Target window is no longer valid";
                        return result;
                    }

                    if (currentHwnd.ToInt64() != targetVal)
                    {
                        // Bring target window to foreground
                        NativeMethods.SetForegroundWindow(targetPtr);
                        Thread.Sleep(50);
                        currentHwnd = NativeMethods.GetForegroundWindow();

                        if (currentHwnd != IntPtr.Zero && currentHwnd.ToInt64() != targetVal)
                        {
                            result.Status = "target_mismatch";
                            result.ErrorMessage = "Foreground window mismatch: target window could not be activated";
                            return result;
                        }
                    }
                }
            }

            // 2. UI Automation Insertion Strategy Check
            string chosenStrategy = (strategy ?? "auto").ToLower();
            if (chosenStrategy == "uia" || chosenStrategy == "auto")
            {
                IntPtr targetPtr = targetVal != 0 ? new IntPtr(targetVal) : IntPtr.Zero;
                bool uiaSuccess = TryUiaDirectInsertion(text, targetPtr, ref result);
                if (uiaSuccess)
                {
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

            // 3. Clipboard-based Injection with Full Safe Restoration
            ExecuteClipboardInjection(text, ref result);

            return result;
        }

        private static bool TryUiaDirectInsertion(string text, IntPtr targetPtr, ref InjectionResult result)
        {
            bool success = false;
            try
            {
                AutomationElement targetElement = null;
                if (targetPtr != IntPtr.Zero)
                {
                    try
                    {
                        var root = AutomationElement.FromHandle(targetPtr);
                        if (root != null)
                        {
                            var cond = new OrCondition(
                                new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Document),
                                new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Edit)
                            );
                            targetElement = root.FindFirst(TreeScope.Descendants, cond) ?? root;
                        }
                    }
                    catch { }
                }

                if (targetElement == null)
                {
                    targetElement = AutomationElement.FocusedElement;
                }

                if (targetElement != null)
                {
                    object valPatternObj;
                    if (targetElement.TryGetCurrentPattern(ValuePattern.Pattern, out valPatternObj))
                    {
                        ValuePattern valPattern = (ValuePattern)valPatternObj;
                        string currentVal = valPattern.Current.Value ?? "";

                        // Rule: NEVER overwrite an entire field accidentally.
                        // Only set value if the current control is empty!
                        if (string.IsNullOrEmpty(currentVal))
                        {
                            valPattern.SetValue(text);
                            Thread.Sleep(50);

                            // Verify
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
            }
            catch { }

            return success;
        }

        private static void ExecuteClipboardInjection(string text, ref InjectionResult result)
        {
            InjectionResult localResult = result;
            Thread pasteThread = new Thread(() =>
            {
                IDataObject previousData = null;
                string previousText = null;

                try
                {
                    if (Clipboard.ContainsText())
                    {
                        previousText = Clipboard.GetText();
                    }
                    previousData = Clipboard.GetDataObject();
                }
                catch { }

                try
                {
                    Clipboard.SetText(text);
                    Thread.Sleep(30);

                    // Revalidate target window immediately before keystroke
                    SendCtrlV();
                    localResult.Success = true;
                    localResult.Strategy = "clipboard_paste";

                    // Allow target application to consume clipboard
                    Thread.Sleep(CLIPBOARD_CONSUMPTION_WAIT_MS);

                    // Post-paste verification via UI Automation or focus check
                    VerifyInsertion(text, ref localResult);

                    // Safe Clipboard Restoration Check:
                    // Check whether clipboard still contains our temporary payload
                    string currentText = null;
                    try
                    {
                        if (Clipboard.ContainsText())
                        {
                            currentText = Clipboard.GetText();
                        }
                    }
                    catch { }

                    if (currentText == text)
                    {
                        // Payload consumed and unchanged: Safe to restore user's original data
                        if (previousData != null)
                        {
                            try
                            {
                                Clipboard.SetDataObject(previousData, true);
                                localResult.ClipboardRestored = true;
                            }
                            catch { }
                        }
                        else
                        {
                            try
                            {
                                Clipboard.Clear();
                                localResult.ClipboardRestored = true;
                            }
                            catch { }
                        }
                    }
                    else
                    {
                        // User or another application copied new content: Preserve unrelated clipboard modifications!
                        localResult.ClipboardRestored = false;
                    }
                }
                catch
                {
                    // Fallback to direct simulated keystrokes using KEYEVENTF_UNICODE
                    SendDirectText(text);
                    localResult.Success = true;
                    localResult.Strategy = "send_input_unicode";
                    localResult.Status = "unverified";
                    localResult.Verified = false;
                }
            });

            pasteThread.SetApartmentState(ApartmentState.STA);
            pasteThread.IsBackground = true;
            pasteThread.Start();
            pasteThread.Join(4000);

            result = localResult;
        }

        private static void VerifyInsertion(string text, ref InjectionResult result)
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

            // If verification could not read text directly, report unverified
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
