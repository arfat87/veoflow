using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace VeoFlow.Helper
{
    class Program
    {
        private static readonly object _stdoutLock = new object();
        private static KeyboardHook _keyboardHook;

        [STAThread]
        static void Main(string[] args)
        {
            Console.InputEncoding = Encoding.UTF8;
            Console.OutputEncoding = Encoding.UTF8;

            int pid = Process.GetCurrentProcess().Id;
            SendJson(new { type = "status", status = "ready", version = Protocol.VERSION, pid = pid });

            _keyboardHook = new KeyboardHook();

            _keyboardHook.HotkeyDown += () =>
            {
                SendJson(new
                {
                    type = "event",
                    @event = "hotkey_down",
                    timestamp = DateTime.UtcNow.ToString("o")
                });
            };

            _keyboardHook.HotkeyUp += () =>
            {
                SendJson(new
                {
                    type = "event",
                    @event = "hotkey_up",
                    timestamp = DateTime.UtcNow.ToString("o")
                });
            };

            _keyboardHook.HotkeyCanceled += (reason) =>
            {
                SendJson(new
                {
                    type = "event",
                    @event = "cancel",
                    reason = reason,
                    timestamp = DateTime.UtcNow.ToString("o")
                });
            };

            _keyboardHook.DiagnosticLog += (logMsg) =>
            {
                SendJson(new
                {
                    type = "log",
                    message = logMsg,
                    timestamp = DateTime.UtcNow.ToString("o")
                });
            };

            // Start hook
            _keyboardHook.Start();

            // Background IPC listener loop on stdin
            Thread ipcThread = new Thread(IpcListenerLoop);
            ipcThread.IsBackground = true;
            ipcThread.SetApartmentState(ApartmentState.STA);
            ipcThread.Start();

            // Run main Windows Message Loop
            Application.Run();

            // Cleanup when message loop exits
            if (_keyboardHook != null)
            {
                _keyboardHook.Dispose();
                _keyboardHook = null;
            }
        }

        private static void IpcListenerLoop()
        {
            string line;
            while ((line = Console.ReadLine()) != null)
            {
                line = line.Trim();
                if (string.IsNullOrEmpty(line)) continue;

                try
                {
                    ProcessIpcCommand(line);
                }
                catch (Exception ex)
                {
                    SendJson(new { type = "error", message = ex.Message });
                }
            }

            // Stdin closed -> parent Electron process exited or terminated -> exit cleanly
            Shutdown();
        }

        private static void ProcessIpcCommand(string jsonLine)
        {
            string action = Protocol.ExtractJsonField(jsonLine, "action");
            string id = Protocol.ExtractJsonField(jsonLine, "id");

            if (string.IsNullOrEmpty(action))
            {
                action = Protocol.ExtractJsonField(jsonLine, "cmd");
            }

            string act = (action != null) ? action.ToLower() : "";
            switch (act)
            {
                case "ping":
                    SendJson(new
                    {
                        type = "response",
                        id = id,
                        status = "pong",
                        version = Protocol.VERSION,
                        pid = Process.GetCurrentProcess().Id
                    });
                    break;

                case "get_context":
                    var context = WindowContext.GetCurrentContext();
                    SendJson(new
                    {
                        type = "response",
                        id = id,
                        context = new
                        {
                            hwnd = context.Hwnd,
                            appName = context.AppName,
                            processPath = context.ProcessPath,
                            processId = context.ProcessId,
                            windowTitle = context.WindowTitle,
                            url = context.Url,
                            textbox = new
                            {
                                contents = context.Textbox.Contents,
                                beforeText = context.Textbox.BeforeText,
                                selectedText = context.Textbox.SelectedText,
                                afterText = context.Textbox.AfterText,
                                controlType = context.Textbox.ControlType
                            }
                        }
                    });
                    break;

                case "inject_text":
                case "paste_text":
                    string textToPaste = Protocol.ExtractJsonField(jsonLine, "text");
                    string targetHwnd = Protocol.ExtractJsonField(jsonLine, "targetHwnd");
                    string strategy = Protocol.ExtractJsonField(jsonLine, "strategy");
                    string txId = Protocol.ExtractJsonField(jsonLine, "transactionId");

                    var injectRes = TextInjector.ExecuteInjection(textToPaste, targetHwnd, strategy, txId);
                    SendJson(new
                    {
                        type = "response",
                        id = id,
                        success = injectRes.Success,
                        status = injectRes.Status,
                        strategy = injectRes.Strategy,
                        verified = injectRes.Verified,
                        targetHwnd = injectRes.TargetHwnd,
                        clipboardRestored = injectRes.ClipboardRestored,
                        transactionId = injectRes.TransactionId,
                        error = injectRes.ErrorMessage
                    });
                    break;

                case "set_hotkey":
                    string key = Protocol.ExtractJsonField(jsonLine, "key");
                    string mods = Protocol.ExtractJsonField(jsonLine, "modifiers");
                    if (_keyboardHook != null)
                    {
                        _keyboardHook.ConfigureHotkey(mods, key);
                    }
                    SendJson(new
                    {
                        type = "response",
                        id = id,
                        status = "updated",
                        modifiers = mods,
                        key = key
                    });
                    break;

                case "exit":
                    SendJson(new
                    {
                        type = "response",
                        id = id,
                        status = "exiting"
                    });
                    Shutdown();
                    break;

                default:
                    SendJson(new
                    {
                        type = "error",
                        id = id,
                        code = -32601,
                        message = "Method not found: " + action
                    });
                    break;
            }
        }

        private static void Shutdown()
        {
            try
            {
                if (_keyboardHook != null)
                {
                    _keyboardHook.Dispose();
                    _keyboardHook = null;
                }
            }
            catch { }

            try
            {
                Application.Exit();
            }
            catch { }

            Environment.Exit(0);
        }

        private static void SendJson(object obj)
        {
            lock (_stdoutLock)
            {
                string json = Protocol.SerializeJson(obj);
                Console.WriteLine(json);
                Console.Out.Flush();
            }
        }
    }
}
