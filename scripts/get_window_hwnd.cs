using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

class Program
{
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    static extern int GetClassName(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

    [DllImport("user32.dll")]
    static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll", SetLastError = true)]
    static extern IntPtr OpenInputDesktop(uint dwFlags, bool fInherit, uint dwDesiredAccess);

    [DllImport("user32.dll", SetLastError = true)]
    static extern bool SetThreadDesktop(IntPtr hDesktop);

    [DllImport("user32.dll")]
    static extern IntPtr GetForegroundWindow();

    static void Main(string[] args)
    {
        IntPtr hDesk = OpenInputDesktop(0, false, 0x01FF);
        if (hDesk != IntPtr.Zero) SetThreadDesktop(hDesk);

        if (args.Length >= 2 && args[0] == "--find")
        {
            string targetName = args[1].ToLower();
            IntPtr found = IntPtr.Zero;

            for (int retry = 0; retry < 30; retry++)
            {
                EnumWindows((hWnd, lParam) =>
                {
                    var cls = new StringBuilder(256);
                    GetClassName(hWnd, cls, 256);

                    var title = new StringBuilder(256);
                    GetWindowText(hWnd, title, 256);

                    if (cls.ToString().Equals("Notepad", StringComparison.OrdinalIgnoreCase) ||
                        cls.ToString().ToLower().Contains(targetName) ||
                        title.ToString().ToLower().Contains(targetName))
                    {
                        found = hWnd;
                        return false; // Found match
                    }

                    uint pid = 0;
                    GetWindowThreadProcessId(hWnd, out pid);
                    try
                    {
                        string procName = Process.GetProcessById((int)pid).ProcessName.ToLower();
                        if (procName.Contains(targetName))
                        {
                            found = hWnd;
                            return false;
                        }
                    }
                    catch { }

                    return true;
                }, IntPtr.Zero);

                if (found != IntPtr.Zero) break;
                Thread.Sleep(200);
            }

            if (found != IntPtr.Zero)
            {
                Console.WriteLine("0x" + found.ToInt64().ToString("X"));
            }
            return;
        }

        IntPtr fg = GetForegroundWindow();
        IntPtr backgroundHwnd = IntPtr.Zero;

        EnumWindows((hWnd, lParam) =>
        {
            if (hWnd == fg) return true;
            if (!IsWindowVisible(hWnd)) return true;

            var title = new StringBuilder(256);
            GetWindowText(hWnd, title, 256);

            if (title.Length > 0 && !title.ToString().Contains("Default IME") && !title.ToString().Contains("MSCTFIME UI"))
            {
                backgroundHwnd = hWnd;
                return false; // Stop at first valid visible background window
            }
            return true;
        }, IntPtr.Zero);

        if (backgroundHwnd != IntPtr.Zero)
        {
            Console.WriteLine("0x" + backgroundHwnd.ToInt64().ToString("X"));
        }
        else
        {
            // Fallback to Shell Program Manager
            Console.WriteLine("0x1020A");
        }
    }
}
