using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading;
using System.Windows.Automation;

namespace VeoFlow.Helper
{
    public class WindowContextResult
    {
        public string Hwnd { get; set; }
        public string AppName { get; set; }
        public string ProcessPath { get; set; }
        public int ProcessId { get; set; }
        public string WindowTitle { get; set; }
        public string Url { get; set; }
        public TextboxData Textbox { get; set; }

        public WindowContextResult()
        {
            Hwnd = "0x0";
            AppName = "Unknown";
            ProcessPath = "";
            ProcessId = 0;
            WindowTitle = "";
            Url = "";
            Textbox = new TextboxData();
        }
    }

    public class TextboxData
    {
        public string Contents { get; set; }
        public string BeforeText { get; set; }
        public string SelectedText { get; set; }
        public string AfterText { get; set; }
        public string ControlType { get; set; }

        public TextboxData()
        {
            Contents = "";
            BeforeText = "";
            SelectedText = "";
            AfterText = "";
            ControlType = "";
        }
    }

    public static class WindowContext
    {
        public static WindowContextResult GetCurrentContext()
        {
            WindowContextResult result = new WindowContextResult();

            try
            {
                NativeMethods.EnsureAttachedToInputDesktop();
                IntPtr hWnd = NativeMethods.GetForegroundWindow();
                if (hWnd != IntPtr.Zero)
                {
                    result.Hwnd = "0x" + hWnd.ToInt64().ToString("X");

                    // 1. Thread and Process Identification
                    uint pid = 0;
                    NativeMethods.GetWindowThreadProcessId(hWnd, out pid);
                    result.ProcessId = (int)pid;

                    if (pid > 0)
                    {
                        try
                        {
                            using (Process p = Process.GetProcessById((int)pid))
                            {
                                result.AppName = p.ProcessName + ".exe";
                                try
                                {
                                    result.ProcessPath = p.MainModule.FileName;
                                }
                                catch
                                {
                                    // Fallback for elevated processes where MainModule throws Access Denied
                                    result.ProcessPath = TryGetProcessPathViaWin32(pid);
                                }
                            }
                        }
                        catch
                        {
                            result.AppName = "Unknown.exe";
                        }
                    }

                    // 2. Window Title
                    StringBuilder sb = new StringBuilder(512);
                    NativeMethods.GetWindowText(hWnd, sb, sb.Capacity);
                    result.WindowTitle = sb.ToString();

                    // 3. UI Automation Context (bounded to 200ms)
                    FocusContextData uia = UIAutomationReader.InspectFocusedElement(200);
                    result.Textbox.Contents = uia.Contents;
                    result.Textbox.SelectedText = uia.SelectedText;
                    result.Textbox.BeforeText = uia.BeforeText;
                    result.Textbox.AfterText = uia.AfterText;
                    result.Textbox.ControlType = uia.ControlType;

                    // 4. Browser URL Detection (Chrome, Edge, Brave, Firefox)
                    string lowerApp = result.AppName.ToLower();
                    if (lowerApp.Contains("chrome") || lowerApp.Contains("msedge") || lowerApp.Contains("brave") || lowerApp.Contains("firefox"))
                    {
                        result.Url = TryExtractBrowserUrl(hWnd, 150);
                    }
                }
            }
            catch { }

            return result;
        }

        private static string TryGetProcessPathViaWin32(uint pid)
        {
            IntPtr hProcess = NativeMethods.OpenProcess(NativeMethods.PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
            if (hProcess == IntPtr.Zero) return "";

            try
            {
                StringBuilder sb = new StringBuilder(1024);
                int size = sb.Capacity;
                if (NativeMethods.QueryFullProcessImageName(hProcess, 0, sb, ref size))
                {
                    return sb.ToString();
                }
            }
            catch { }
            finally
            {
                NativeMethods.CloseHandle(hProcess);
            }
            return "";
        }

        private static string TryExtractBrowserUrl(IntPtr hWnd, int timeoutMs)
        {
            string urlResult = "";
            Thread urlThread = new Thread(() =>
            {
                try
                {
                    AutomationElement root = AutomationElement.FromHandle(hWnd);
                    if (root == null) return;

                    Condition editCond = new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Edit);
                    AutomationElementCollection edits = root.FindAll(TreeScope.Descendants, editCond);

                    foreach (AutomationElement edit in edits)
                    {
                        try
                        {
                            string name = edit.Current.Name ?? "";
                            string autoId = edit.Current.AutomationId ?? "";
                            if (name.IndexOf("Address", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                name.IndexOf("search", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                autoId.IndexOf("url", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                autoId.IndexOf("address", StringComparison.OrdinalIgnoreCase) >= 0)
                            {
                                object valPatternObj;
                                if (edit.TryGetCurrentPattern(ValuePattern.Pattern, out valPatternObj))
                                {
                                    string urlVal = ((ValuePattern)valPatternObj).Current.Value;
                                    if (!string.IsNullOrEmpty(urlVal))
                                    {
                                        urlResult = urlVal;
                                        return;
                                    }
                                }
                            }
                        }
                        catch { }
                    }
                }
                catch { }
            });

            urlThread.SetApartmentState(ApartmentState.STA);
            urlThread.IsBackground = true;
            urlThread.Start();
            urlThread.Join(timeoutMs);

            return urlResult;
        }
    }
}

