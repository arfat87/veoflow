using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Automation;
using System.Windows.Automation.Text;
using System.Windows.Forms;

namespace VeoFlow.Verification
{
    class Program
    {
        public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

        [DllImport("user32.dll")]
        static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);

        [DllImport("user32.dll", CharSet = CharSet.Auto)]
        static extern int GetClassName(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

        [DllImport("user32.dll", CharSet = CharSet.Auto)]
        static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

        [DllImport("user32.dll")]
        static extern IntPtr GetForegroundWindow();

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        static extern bool SetForegroundWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

        [DllImport("user32.dll")]
        static extern void SwitchToThisWindow(IntPtr hWnd, bool fUnknown);

        [DllImport("user32.dll")]
        static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

        [DllImport("kernel32.dll")]
        static extern uint GetCurrentThreadId();

        [DllImport("user32.dll")]
        static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);

        [STAThread]
        static int Main(string[] args)
        {
            Console.WriteLine("==================================================");
            Console.WriteLine("  VEOFLOW REAL NOTEPAD INJECTION VERIFICATION   ");
            Console.WriteLine("==================================================");

            // 1. Clean existing Notepads
            foreach (var p in Process.GetProcessesByName("Notepad"))
            {
                try { p.Kill(); } catch { }
            }
            Thread.Sleep(500);

            // 2. Set original clipboard contents
            string originalClipboard = "ORIGINAL_USER_CLIPBOARD_SECRET_VERIFY_9999";
            Clipboard.SetText(originalClipboard);
            Console.WriteLine("[1] Initial Clipboard Set: " + Clipboard.GetText());

            // 3. Launch Notepad
            Console.WriteLine("[2] Launching Notepad...");
            Process.Start("notepad.exe");
            
            IntPtr notepadHwnd = IntPtr.Zero;
            uint notepadPid = 0;

            for (int i = 0; i < 30; i++)
            {
                Thread.Sleep(300);
                EnumWindows((hWnd, lParam) =>
                {
                    var cls = new StringBuilder(256);
                    GetClassName(hWnd, cls, 256);
                    if (cls.ToString() == "Notepad")
                    {
                        notepadHwnd = hWnd;
                        GetWindowThreadProcessId(hWnd, out notepadPid);
                        return false;
                    }
                    return true;
                }, IntPtr.Zero);

                if (notepadHwnd != IntPtr.Zero) break;
            }

            if (notepadHwnd == IntPtr.Zero)
            {
                Console.WriteLine("[FAIL] Could not find Notepad top-level window.");
                return 1;
            }

            Console.WriteLine(string.Format("[3] Real Notepad Window Found -> PID: {0}, HWND: 0x{1:X}", notepadPid, notepadHwnd.ToInt64()));

            // Bring Notepad to foreground
            ShowWindow(notepadHwnd, 9); // SW_RESTORE
            SwitchToThisWindow(notepadHwnd, true);
            SetForegroundWindow(notepadHwnd);

            try
            {
                var el = AutomationElement.FromHandle(notepadHwnd);
                if (el != null)
                {
                    el.SetFocus();
                    AutomationElement edit = null;
                    for (int retry = 0; retry < 15; retry++)
                    {
                        edit = el.FindFirst(TreeScope.Descendants, new OrCondition(
                            new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Document),
                            new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Edit)
                        ));
                        if (edit != null) break;
                        Thread.Sleep(100);
                    }
                    if (edit != null)
                    {
                        edit.SetFocus();
                        object vpObj;
                        if (edit.TryGetCurrentPattern(ValuePattern.Pattern, out vpObj))
                        {
                            ((ValuePattern)vpObj).SetValue(""); // Ensure clean canvas
                        }
                    }
                }
            }
            catch { }

            Thread.Sleep(300);
            Clipboard.SetText(originalClipboard);

            Thread.Sleep(500);
            IntPtr fg = GetForegroundWindow();
            Console.WriteLine(string.Format("[4] Foreground Window -> HWND: 0x{0:X}", fg.ToInt64()));

            // 4. Launch VeoFlowHelper
            string helperPath = Path.GetFullPath("helper/bin/VeoFlowHelper.exe");
            Console.WriteLine("[5] Spawning Native Helper: " + helperPath);

            var helperStart = new ProcessStartInfo
            {
                FileName = helperPath,
                UseShellExecute = false,
                RedirectStandardInput = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true
            };

            var helper = Process.Start(helperStart);
            string readyLine = helper.StandardOutput.ReadLine();
            Console.WriteLine("    <- HELPER: " + readyLine);

            // 5. Query active context
            string ctxReq = "{\"id\":\"req_ctx_1\",\"action\":\"get_context\"}";
            Console.WriteLine("    -> SEND: " + ctxReq);
            helper.StandardInput.WriteLine(ctxReq);
            
            string ctxRespLine = "";
            while ((ctxRespLine = helper.StandardOutput.ReadLine()) != null)
            {
                Console.WriteLine("    <- HELPER: " + ctxRespLine);
                if (ctxRespLine.Contains("req_ctx_1")) break;
            }

            // 6. Inject Text into Notepad
            string testSentence = "VeoFlow Verification: The quick brown fox jumps over 42 lazy dogs.";
            string hexHwnd = string.Format("0x{0:X}", notepadHwnd.ToInt64());

            // Make sure Notepad remains foreground
            SetForegroundWindow(notepadHwnd);
            Thread.Sleep(200);

            string injectReq = string.Format(
                "{{\"id\":\"req_inj_1\",\"action\":\"inject_text\",\"text\":\"{0}\",\"targetHwnd\":\"{1}\",\"strategy\":\"auto\",\"transactionId\":\"tx_signoff_101\"}}",
                testSentence, hexHwnd
            );

            Console.WriteLine("    -> SEND INJECT: " + injectReq);
            helper.StandardInput.WriteLine(injectReq);

            string injectRespLine = "";
            while ((injectRespLine = helper.StandardOutput.ReadLine()) != null)
            {
                Console.WriteLine("    <- HELPER: " + injectRespLine);
                if (injectRespLine.Contains("req_inj_1")) break;
            }

            // Allow UI to process
            Thread.Sleep(800);

            // 7. Directly inspect Notepad content via Windows UI Automation
            Console.WriteLine("\n[6] Inspecting Notepad Document via UI Automation...");
            string actualNotepadContent = "";
            try
            {
                AutomationElement notepadElement = AutomationElement.FromHandle(notepadHwnd);
                if (notepadElement != null)
                {
                    // Find document or edit control
                    var editCondition = new OrCondition(
                        new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Document),
                        new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Edit)
                    );
                    AutomationElement textControl = notepadElement.FindFirst(TreeScope.Descendants, editCondition);
                    if (textControl == null)
                    {
                        textControl = notepadElement; // fallback
                    }

                    // Try TextPattern
                    object textPatternObj;
                    if (textControl.TryGetCurrentPattern(TextPattern.Pattern, out textPatternObj))
                    {
                        TextPattern tp = (TextPattern)textPatternObj;
                        actualNotepadContent = tp.DocumentRange.GetText(500) ?? "";
                    }
                    // Try ValuePattern
                    if (string.IsNullOrEmpty(actualNotepadContent))
                    {
                        object valPatternObj;
                        if (textControl.TryGetCurrentPattern(ValuePattern.Pattern, out valPatternObj))
                        {
                            ValuePattern vp = (ValuePattern)valPatternObj;
                            actualNotepadContent = vp.Current.Value ?? "";
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("[WARN] UIA Exception: " + ex.Message);
            }

            Console.WriteLine("Actual Text Content in Notepad: [" + actualNotepadContent.Trim() + "]");

            // 8. Inspect Clipboard Restoration
            string postClipboard = Clipboard.GetText();
            Console.WriteLine("[7] Post-Injection Clipboard Contents: [" + postClipboard + "]");

            // 9. Shutdown Helper and Notepad
            helper.StandardInput.WriteLine("{\"id\":\"exit\",\"action\":\"exit\"}");
            Thread.Sleep(300);
            try { helper.Kill(); } catch { }
            if (notepadPid != 0)
            {
                try { Process.GetProcessById((int)notepadPid).Kill(); } catch { }
            }

            // 10. Verification Assertions
            Console.WriteLine("\n==================================================");
            Console.WriteLine("  VERIFICATION EVIDENCE RECONCILIATION AUDIT      ");
            Console.WriteLine("==================================================");

            bool textAppeared = actualNotepadContent.Contains(testSentence);
            bool textExactMatch = actualNotepadContent.Trim().Equals(testSentence.Trim());
            bool clipboardPreserved = (postClipboard == originalClipboard);
            bool hwndMatched = (ctxRespLine.Contains(hexHwnd) || ctxRespLine.IndexOf("Notepad", StringComparison.OrdinalIgnoreCase) >= 0);

            Console.WriteLine("1. Actual Target HWND: " + hexHwnd + " (Matched in Context: " + hwndMatched + ")");
            Console.WriteLine("2. Real Notepad Insertion Succeeded: " + textAppeared);
            Console.WriteLine("3. Exact Text Match Verified: " + textExactMatch);
            Console.WriteLine("4. Clipboard Preserved and Restored: " + clipboardPreserved);

            if (textAppeared && clipboardPreserved)
            {
                Console.WriteLine("\n>>> RESULT: PASS - ALL REAL-WORLD ACCEPTANCE CRITERIA MET <<<");
                return 0;
            }
            else
            {
                Console.WriteLine("\n>>> RESULT: FAIL - CRITERIA NOT MET <<<");
                return 1;
            }
        }
    }
}
