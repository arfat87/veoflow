using System;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

namespace VeoFlow.Helper
{
    public static class TextInjector
    {
        public const int CLIPBOARD_CONSUMPTION_WAIT_MS = 250;

        public static bool ExecutePaste(string text)
        {
            if (string.IsNullOrEmpty(text)) return false;

            bool pasteOk = false;
            Thread pasteThread = new Thread(() =>
            {
                IDataObject previousData = null;
                try
                {
                    previousData = Clipboard.GetDataObject();
                }
                catch { }

                try
                {
                    Clipboard.SetText(text);
                    Thread.Sleep(30);

                    SendCtrlV();
                    pasteOk = true;

                    // Allow target application to consume clipboard
                    Thread.Sleep(CLIPBOARD_CONSUMPTION_WAIT_MS);

                    if (previousData != null)
                    {
                        try
                        {
                            Clipboard.SetDataObject(previousData, true);
                        }
                        catch { }
                    }
                }
                catch
                {
                    // Fallback to direct simulated keystrokes using KEYEVENTF_UNICODE
                    SendDirectText(text);
                    pasteOk = true;
                }
            });

            pasteThread.SetApartmentState(ApartmentState.STA);
            pasteThread.IsBackground = true;
            pasteThread.Start();
            pasteThread.Join(3000);

            return pasteOk;
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

