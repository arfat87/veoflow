using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Automation;
using System.Windows.Automation.Text;

class Program
{
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    static extern int GetClassName(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll", SetLastError = true)]
    static extern IntPtr OpenInputDesktop(uint dwFlags, bool fInherit, uint dwDesiredAccess);

    [DllImport("user32.dll", SetLastError = true)]
    static extern bool SetThreadDesktop(IntPtr hDesktop);

    [DllImport("user32.dll")]
    static extern bool IsWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
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

    static int Main(string[] args)
    {
        int exitCode = 0;
        Thread worker = new Thread(() =>
        {
            try
            {
                IntPtr hDesk = OpenInputDesktop(0, false, 0x01FF);
                if (hDesk != IntPtr.Zero)
                {
                    SetThreadDesktop(hDesk);
                }
                exitCode = Run(args);
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("Worker exception: " + ex.Message);
                exitCode = 1;
            }
        });
        worker.SetApartmentState(ApartmentState.STA);
        worker.Start();
        worker.Join();
        return exitCode;
    }

    static int Run(string[] args)
    {
        if (args.Length == 0)
        {
            Console.Error.WriteLine("Error: Missing action argument. Usage: inspect_notepad.exe [--launch|--inspect <hwnd>|--clear <hwnd>|--kill]");
            return 2;
        }

        string action = args[0];

        if (action == "--kill")
        {
            foreach (var p in Process.GetProcessesByName("Notepad"))
            {
                try { p.Kill(); } catch { }
            }
            return 0;
        }

        if (action == "--launch")
        {
            // 1. Clean existing notepads
            foreach (var p in Process.GetProcessesByName("Notepad"))
            {
                try { p.Kill(); } catch { }
            }
            Thread.Sleep(500);

            // 2. Launch Notepad
            Process.Start("notepad.exe");

            IntPtr npHwnd = IntPtr.Zero;
            uint npPid = 0;

            for (int i = 0; i < 30; i++)
            {
                Thread.Sleep(250);
                EnumWindows((hWnd, lParam) =>
                {
                    var cls = new StringBuilder(256);
                    GetClassName(hWnd, cls, 256);
                    if (cls.ToString() == "Notepad")
                    {
                        npHwnd = hWnd;
                        GetWindowThreadProcessId(hWnd, out npPid);
                        return false;
                    }
                    return true;
                }, IntPtr.Zero);

                if (npHwnd != IntPtr.Zero) break;
            }

            if (npHwnd == IntPtr.Zero)
            {
                Console.Error.WriteLine("Error: Could not find Notepad top-level window after launch");
                return 1;
            }

            // Bring Notepad to foreground
            uint fgPid;
            uint fgThread = GetWindowThreadProcessId(GetForegroundWindow(), out fgPid);
            uint curThread = GetCurrentThreadId();
            if (fgThread != 0 && fgThread != curThread)
            {
                AttachThreadInput(curThread, fgThread, true);
            }

            ShowWindow(npHwnd, 9); // SW_RESTORE
            SetForegroundWindow(npHwnd);
            SwitchToThisWindow(npHwnd, true);

            if (fgThread != 0 && fgThread != curThread)
            {
                AttachThreadInput(curThread, fgThread, false);
            }

            Thread.Sleep(300);

            // Clear any default or restored session text
            try
            {
                var el = AutomationElement.FromHandle(npHwnd);
                if (el != null)
                {
                    var edit = el.FindFirst(TreeScope.Descendants, new OrCondition(
                        new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Document),
                        new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Edit)
                    ));
                    if (edit != null)
                    {
                        object vpObj;
                        if (edit.TryGetCurrentPattern(ValuePattern.Pattern, out vpObj))
                        {
                            ((ValuePattern)vpObj).SetValue("");
                        }
                    }
                }
            }
            catch { }

            // Print HWND to stdout
            Console.WriteLine("0x" + npHwnd.ToInt64().ToString("X"));
            return 0;
        }

        // Inspection / Clear of a given HWND
        string hwndStr = (action == "--inspect" || action == "--clear") && args.Length > 1 ? args[1] : action;
        bool isClear = action == "--clear";

        long val = 0;
        bool parsed = hwndStr.StartsWith("0x", StringComparison.OrdinalIgnoreCase)
            ? long.TryParse(hwndStr.Substring(2), System.Globalization.NumberStyles.HexNumber, null, out val)
            : long.TryParse(hwndStr, out val);

        if (!parsed || val == 0)
        {
            Console.Error.WriteLine("Error: Invalid HWND format: " + hwndStr);
            return 2;
        }

        IntPtr hwnd = new IntPtr(val);
        if (!IsWindow(hwnd))
        {
            Console.Error.WriteLine("Error: Target window does not exist or has been destroyed: " + hwndStr);
            return 2;
        }

        try
        {
            AutomationElement root = AutomationElement.FromHandle(hwnd);
            if (root == null)
            {
                Console.Error.WriteLine("Error: Could not obtain AutomationElement for HWND " + hwndStr);
                return 1;
            }

            var condition = new OrCondition(
                new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Document),
                new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Edit)
            );

            AutomationElement edit = null;
            for (int r = 0; r < 10; r++)
            {
                edit = root.FindFirst(TreeScope.Descendants, condition);
                if (edit != null) break;
                Thread.Sleep(100);
            }

            if (edit == null)
            {
                Console.Error.WriteLine("Error: Document or Edit control not found in target window " + hwndStr);
                return 1;
            }

            if (isClear)
            {
                object vpClear;
                if (edit.TryGetCurrentPattern(ValuePattern.Pattern, out vpClear))
                {
                    ((ValuePattern)vpClear).SetValue("");
                    return 0;
                }
                return 0;
            }

            object valPatternObj;
            if (edit.TryGetCurrentPattern(ValuePattern.Pattern, out valPatternObj))
            {
                var vp = (ValuePattern)valPatternObj;
                Console.Write(vp.Current.Value);
                return 0;
            }

            object textPatternObj;
            if (edit.TryGetCurrentPattern(TextPattern.Pattern, out textPatternObj))
            {
                var tp = (TextPattern)textPatternObj;
                Console.Write(tp.DocumentRange.GetText(-1));
                return 0;
            }

            Console.Error.WriteLine("Error: Document control found but neither ValuePattern nor TextPattern supported");
            return 1;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine("Error inspecting document content: " + ex.Message);
            return 1;
        }
    }
}
