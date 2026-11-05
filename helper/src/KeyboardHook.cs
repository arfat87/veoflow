using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

namespace VeoFlow.Helper
{
    public class KeyboardHook : IDisposable
    {
        private NativeMethods.LowLevelKeyboardProc _proc;
        private IntPtr _hookID = IntPtr.Zero;

        private bool _reqCtrl = true;
        private bool _reqAlt = true;
        private bool _reqShift = false;
        private bool _reqWin = false;
        private int _targetKey = NativeMethods.VK_SPACE;

        private bool _isHotkeyDown = false;

        public event Action HotkeyDown;
        public event Action HotkeyUp;
        public event Action<string> HotkeyCanceled;
        public event Action<string> DiagnosticLog;

        public bool IsHotkeyDown
        {
            get { return _isHotkeyDown; }
        }

        public KeyboardHook()
        {
            _proc = HookCallback;
        }

        public bool Start()
        {
            try
            {
                using (Process curProcess = Process.GetCurrentProcess())
                using (ProcessModule curModule = curProcess.MainModule)
                {
                    IntPtr hMod = NativeMethods.GetModuleHandle(curModule.ModuleName);
                    if (hMod == IntPtr.Zero)
                    {
                        hMod = Marshal.GetHINSTANCE(typeof(KeyboardHook).Module);
                    }
                    _hookID = NativeMethods.SetWindowsHookEx(NativeMethods.WH_KEYBOARD_LL, _proc, hMod, 0);
                    int err = Marshal.GetLastWin32Error();
                    if (_hookID == IntPtr.Zero)
                    {
                        Log("error", "Failed to install keyboard hook. Win32 error: " + err);
                        return false;
                    }
                    Log("info", "Low-level keyboard hook installed successfully.");
                    return true;
                }
            }
            catch (Exception ex)
            {
                Log("error", "Hook exception: " + ex.Message);
                return false;
            }
        }

        public void Stop()
        {
            if (_hookID != IntPtr.Zero)
            {
                NativeMethods.UnhookWindowsHookEx(_hookID);
                _hookID = IntPtr.Zero;
                _isHotkeyDown = false;
                Log("info", "Low-level keyboard hook uninstalled.");
            }
        }

        public void ConfigureHotkey(string mods, string key)
        {
            mods = (mods ?? "").ToLower();
            _reqCtrl = mods.Contains("ctrl") || mods.Contains("control");
            _reqAlt = mods.Contains("alt");
            _reqShift = mods.Contains("shift");
            _reqWin = mods.Contains("win") || mods.Contains("cmd");

            key = (key ?? "space").ToLower();
            int fNum;
            if (key == "space") _targetKey = NativeMethods.VK_SPACE;
            else if (key == "v") _targetKey = NativeMethods.VK_V;
            else if (key.StartsWith("f") && int.TryParse(key.Substring(1), out fNum) && fNum >= 1 && fNum <= 24)
            {
                _targetKey = 0x70 + (fNum - 1); // VK_F1..VK_F24
            }
            else if (key.Length == 1)
            {
                _targetKey = (int)char.ToUpper(key[0]);
            }

            Log("info", string.Format("Hotkey configured: Ctrl={0}, Alt={1}, Shift={2}, Win={3}, Key=0x{4:X2}",
                _reqCtrl, _reqAlt, _reqShift, _reqWin, _targetKey));
        }

        private IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam)
        {
            if (nCode >= 0)
            {
                int vkCode = Marshal.ReadInt32(lParam);
                bool isDown = (wParam == (IntPtr)NativeMethods.WM_KEYDOWN || wParam == (IntPtr)NativeMethods.WM_SYSKEYDOWN);
                bool isUp = (wParam == (IntPtr)NativeMethods.WM_KEYUP || wParam == (IntPtr)NativeMethods.WM_SYSKEYUP);

                // 1. Escape cancellation during dictation
                if (vkCode == NativeMethods.VK_ESCAPE && isDown && _isHotkeyDown)
                {
                    _isHotkeyDown = false;
                    ThreadPool.QueueUserWorkItem(_ =>
                    {
                        if (HotkeyCanceled != null) HotkeyCanceled("escape");
                    });
                    return (IntPtr)1; // Consume escape
                }

                // 2. Target Key Matching
                if (vkCode == _targetKey)
                {
                    bool ctrlPressed = (NativeMethods.GetAsyncKeyState(NativeMethods.VK_CONTROL) & 0x8000) != 0;
                    bool altPressed = (NativeMethods.GetAsyncKeyState(NativeMethods.VK_MENU) & 0x8000) != 0;
                    bool shiftPressed = (NativeMethods.GetAsyncKeyState(NativeMethods.VK_SHIFT) & 0x8000) != 0;
                    bool winPressed = ((NativeMethods.GetAsyncKeyState(NativeMethods.VK_LWIN) & 0x8000) != 0) ||
                                      ((NativeMethods.GetAsyncKeyState(NativeMethods.VK_RWIN) & 0x8000) != 0);

                    bool match = (!_reqCtrl || ctrlPressed) &&
                                 (!_reqAlt || altPressed) &&
                                 (!_reqShift || shiftPressed) &&
                                 (!_reqWin || winPressed);

                    if (match && isDown)
                    {
                        if (!_isHotkeyDown)
                        {
                            _isHotkeyDown = true;
                            // Asynchronous dispatch to avoid hook timeout (>1000ms threshold by Windows)
                            ThreadPool.QueueUserWorkItem(_ =>
                            {
                                if (HotkeyDown != null) HotkeyDown();
                            });
                        }
                        // Consume key (both initial press and key repeats) to prevent leaking into target app
                        return (IntPtr)1;
                    }
                    else if (isUp && _isHotkeyDown)
                    {
                        _isHotkeyDown = false;
                        ThreadPool.QueueUserWorkItem(_ =>
                        {
                            if (HotkeyUp != null) HotkeyUp();
                        });
                        return (IntPtr)1; // Consume key
                    }
                }

                // 3. Modifier Release Handling: If user releases Ctrl, Alt, or Shift while holding Space
                if (isUp && _isHotkeyDown)
                {
                    bool isModifier = (vkCode == NativeMethods.VK_CONTROL || vkCode == NativeMethods.VK_LCONTROL || vkCode == NativeMethods.VK_RCONTROL ||
                                       vkCode == NativeMethods.VK_MENU || vkCode == NativeMethods.VK_LMENU || vkCode == NativeMethods.VK_RMENU ||
                                       vkCode == NativeMethods.VK_SHIFT || vkCode == NativeMethods.VK_LSHIFT || vkCode == NativeMethods.VK_RSHIFT ||
                                       vkCode == NativeMethods.VK_LWIN || vkCode == NativeMethods.VK_RWIN);

                    if (isModifier)
                    {
                        bool ctrlPressed = (NativeMethods.GetAsyncKeyState(NativeMethods.VK_CONTROL) & 0x8000) != 0;
                        bool altPressed = (NativeMethods.GetAsyncKeyState(NativeMethods.VK_MENU) & 0x8000) != 0;
                        bool shiftPressed = (NativeMethods.GetAsyncKeyState(NativeMethods.VK_SHIFT) & 0x8000) != 0;
                        bool winPressed = ((NativeMethods.GetAsyncKeyState(NativeMethods.VK_LWIN) & 0x8000) != 0) ||
                                          ((NativeMethods.GetAsyncKeyState(NativeMethods.VK_RWIN) & 0x8000) != 0);

                        bool modifiersStillHeld = (!_reqCtrl || ctrlPressed) &&
                                                  (!_reqAlt || altPressed) &&
                                                  (!_reqShift || shiftPressed) &&
                                                  (!_reqWin || winPressed);

                        if (!modifiersStillHeld)
                        {
                            _isHotkeyDown = false;
                            ThreadPool.QueueUserWorkItem(_ =>
                            {
                                if (HotkeyUp != null) HotkeyUp();
                            });
                        }
                    }
                }
            }

            return NativeMethods.CallNextHookEx(_hookID, nCode, wParam, lParam);
        }

        private void Log(string level, string message)
        {
            if (DiagnosticLog != null) DiagnosticLog(string.Format("[{0}] {1}", level.ToUpper(), message));
        }

        public void Dispose()
        {
            Stop();
        }
    }
}

