using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

class Program
{
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

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
