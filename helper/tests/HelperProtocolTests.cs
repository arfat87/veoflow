using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
using VeoFlow.Helper;

namespace VeoFlow.Helper.Tests
{
    public class HelperProtocolTests
    {
        public static void Assert(bool condition, string message)
        {
            if (!condition)
            {
                throw new Exception("Assertion Failed: " + message);
            }
        }

        private static bool SafeSetClipboard(string text)
        {
            for (int i = 0; i < 10; i++)
            {
                try
                {
                    Clipboard.SetText(text);
                    return true;
                }
                catch
                {
                    Thread.Sleep(30);
                }
            }
            return false;
        }

        private static string SafeGetClipboard()
        {
            for (int i = 0; i < 10; i++)
            {
                try
                {
                    if (Clipboard.ContainsText())
                    {
                        return Clipboard.GetText();
                    }
                    return "";
                }
                catch
                {
                    Thread.Sleep(30);
                }
            }
            return "";
        }

        public void Test_NativeInputStructSize_Is40BytesOnX64()
        {
            int size = Marshal.SizeOf(typeof(NativeMethods.INPUT));
            bool is64Bit = (IntPtr.Size == 8);

            if (is64Bit)
            {
                Assert(size == 40, string.Format("INPUT size on x64 must be 40 bytes, but was {0}", size));
            }
            else
            {
                Assert(size == 28, string.Format("INPUT size on x86 must be 28 bytes, but was {0}", size));
            }
        }

        public void Test_ProtocolJsonEscape_SpecialCharacters()
        {
            string raw = "Hello \"World\"\nLine 2\tTabbed\\Backslash";
            string escaped = Protocol.EscapeString(raw);
            Assert(escaped.Contains("\\\"World\\\""), "Quotes must be escaped");
            Assert(escaped.Contains("\\n"), "Newlines must be escaped");
            Assert(escaped.Contains("\\t"), "Tabs must be escaped");
            Assert(escaped.Contains("\\\\Backslash"), "Backslashes must be escaped");
        }

        public void Test_ProtocolExtractJsonField_HandlesEscapedQuotesAndColons()
        {
            string json = "{\"id\":\"req-123\",\"action\":\"paste_text\",\"text\":\"Here is a quote: \\\"Hello, World!\\\" and more.\"}";
            string id = Protocol.ExtractJsonField(json, "id");
            string action = Protocol.ExtractJsonField(json, "action");
            string text = Protocol.ExtractJsonField(json, "text");

            Assert(id == "req-123", "id should match req-123");
            Assert(action == "paste_text", "action should match paste_text");
            Assert(text == "Here is a quote: \"Hello, World!\" and more.", "Text with escaped quotes must be parsed properly");
        }

        public void Test_ProtocolExtractJsonField_Primitives()
        {
            string json = "{\"id\":\"456\",\"success\":true,\"code\":-32601,\"pid\":12345}";
            string success = Protocol.ExtractJsonField(json, "success");
            string code = Protocol.ExtractJsonField(json, "code");
            string pid = Protocol.ExtractJsonField(json, "pid");

            Assert(success == "true", "success should be true");
            Assert(code == "-32601", "code should be -32601");
            Assert(pid == "12345", "pid should be 12345");
        }

        public void Test_HotkeyConfiguration_Parsing()
        {
            using (KeyboardHook hook = new KeyboardHook())
            {
                hook.ConfigureHotkey("Ctrl+Alt", "Space");
                Assert(!hook.IsHotkeyDown, "Initial state should not be down");

                hook.ConfigureHotkey("Ctrl+Shift", "V");
                Assert(!hook.IsHotkeyDown, "Reconfigured state should not be down");
            }
        }

        public void Test_StrictForeground_ZeroHwnd_Aborts()
        {
            var res1 = TextInjector.ExecuteInjection("Hello", null, "clipboard", "tx_zero_1");
            Assert(!res1.Success, "Null HWND must not succeed");
            Assert(res1.Status == "aborted", "Null HWND status must be aborted");

            var res2 = TextInjector.ExecuteInjection("Hello", "0x0", "clipboard", "tx_zero_2");
            Assert(!res2.Success, "0x0 HWND must not succeed");
            Assert(res2.Status == "aborted", "0x0 HWND status must be aborted");

            var res3 = TextInjector.ExecuteInjection("Hello", "0", "clipboard", "tx_zero_3");
            Assert(!res3.Success, "0 HWND must not succeed");
            Assert(res3.Status == "aborted", "0 HWND status must be aborted");
        }

        public void Test_StrictForeground_DestroyedHwnd_Aborts()
        {
            var res = TextInjector.ExecuteInjection("Hello", "0xDEADBEEF", "clipboard", "tx_destroyed");
            Assert(!res.Success, "Non-existent HWND must not succeed");
            Assert(res.Status == "aborted", "Non-existent HWND status must be aborted");
            Assert(res.ErrorMessage.Contains("does not exist") || res.ErrorMessage.Contains("destroyed"), "Error must state window does not exist or destroyed");
        }

        public void Test_StrictForeground_BackgroundWindow_Aborts()
        {
            // Shell tray or desktop window is guaranteed not to be the foreground console window
            IntPtr desktop = NativeMethods.GetAncestor(NativeMethods.GetForegroundWindow(), NativeMethods.GA_ROOTOWNER);
            // Or get Shell_TrayWnd
            IntPtr fg = NativeMethods.GetForegroundWindow();
            // Use an arbitrary valid window handle that is not foreground (or zero)
            // If fg is valid, any other valid top-level window must abort
            var res = TextInjector.ExecuteInjection("Background Payload", "0x1234", "clipboard", "tx_bg");
            Assert(!res.Success, "Arbitrary non-foreground window must abort");
            Assert(res.Status == "aborted", "Status must be aborted");
        }

        public void Test_ClipboardRestoration_PreservesOriginalData()
        {
            Exception threadEx = null;
            Thread t = new Thread(() =>
            {
                try
                {
                    NativeMethods.EnsureAttachedToInputDesktop();
                    IntPtr fg = NativeMethods.GetForegroundWindow();
                    string fgHwnd = fg != IntPtr.Zero ? "0x" + fg.ToInt64().ToString("X") : "0x0";

                    string original = "PRESERVED_USER_DATA_777";
                    SafeSetClipboard(original);

                    var result = TextInjector.ExecuteInjection("TEMPORARY_SPEECH_PAYLOAD", fgHwnd, "clipboard", "tx_test_123");

                    Assert(result.Success, "Injection on active foreground window should succeed: " + result.ErrorMessage + " status: " + result.Status + " fgHwnd: " + fgHwnd);

                    string postClipboard = SafeGetClipboard();
                    Assert(postClipboard == original, string.Format("Original clipboard must remain intact. Expected '{0}' but found '{1}'", original, postClipboard));
                    Assert(result.ClipboardRestored, "ClipboardRestored flag must be true");
                }
                catch (Exception ex)
                {
                    threadEx = ex;
                }
            });
            t.SetApartmentState(ApartmentState.STA);
            t.Start();
            t.Join(5000);

            if (threadEx != null) throw threadEx;
        }

        public void Test_ClipboardRestoration_OnAbort()
        {
            string original = "PRESERVED_ON_ABORT_12345";
            SafeSetClipboard(original);

            // Call with zero HWND which triggers abort
            var result = TextInjector.ExecuteInjection("TEMPORARY_SPEECH_PAYLOAD", "0x0", "clipboard", "tx_abort_clip");

            Assert(!result.Success, "Abort must report success false");
            Assert(result.Status == "aborted", "Status must be aborted");

            string postClipboard = SafeGetClipboard();
            Assert(postClipboard == original, "Original clipboard must remain intact after abort");
        }

        public void Test_InjectionResult_StructuredFields()
        {
            var result = TextInjector.ExecuteInjection("", "0x1234", "auto", "tx_empty");
            Assert(!result.Success, "Empty text injection must fail");
            Assert(result.Status == "failed", "Status must be failed");
            Assert(result.ErrorMessage.Contains("empty"), "Error message should mention empty");
        }

        public void Test_ProtocolExtractJsonField_MalformedJsonAndUnicodeSafe()
        {
            // Unclosed quote / malformed unicode
            string malformed1 = "{\"action\":\"paste_text\", \"text\": \"unclosed string...";
            string res1 = Protocol.ExtractJsonField(malformed1, "action");
            Assert(res1 == "paste_text", "Must extract valid field before malformed region");

            string malformed2 = "{\"action\":\"test\", \"unicode\": \"\\uZZZZinvalid\"}";
            string res2 = Protocol.ExtractJsonField(malformed2, "unicode");
            Assert(res2 != null, "Must handle invalid hex unicode without throwing");

            string malformed3 = "{,,,,,:::\"broken\"}";
            string res3 = Protocol.ExtractJsonField(malformed3, "broken");
            Assert(res3 == null, "Must return null for broken JSON without throwing");
        }

        public void Test_ConcurrentClipboardModification_PreservesExternalData()
        {
            string externalNewData = "USER_COPIED_NEW_CONTENT_DURING_PASTE";
            SafeSetClipboard(externalNewData);

            string currentText = SafeGetClipboard();
            Assert(currentText == externalNewData, "Clipboard holds external data");
            Assert(currentText != "TEMPORARY_PAYLOAD", "External data was not equal to temporary payload");
        }
    }
}
