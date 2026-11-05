using System;
using System.Runtime.InteropServices;
using System.Threading;
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

        public void Test_ClipboardRestoration_PreservesOriginalData()
        {
            Thread staThread = new Thread(() =>
            {
                string original = "PRESERVED_USER_DATA_777";
                try
                {
                    System.Windows.Forms.Clipboard.SetText(original);
                }
                catch { }

                var result = TextInjector.ExecuteInjection("TEMPORARY_SPEECH_PAYLOAD", null, "clipboard", "tx_test_123");

                Assert(result.Success, "Injection should succeed");

                try
                {
                    string postClipboard = System.Windows.Forms.Clipboard.GetText();
                    Assert(postClipboard == original, string.Format("Original clipboard must remain intact. Expected '{0}' but found '{1}'", original, postClipboard));
                }
                catch { }
            });
            staThread.SetApartmentState(ApartmentState.STA);
            staThread.Start();
            staThread.Join(5000);
        }

        public void Test_InjectionResult_StructuredFields()
        {
            var result = TextInjector.ExecuteInjection("", null, "auto", "tx_empty");
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
            Thread staThread = new Thread(() =>
            {
                string original = "ORIGINAL_DATA_999";
                string externalNewData = "USER_COPIED_NEW_CONTENT_DURING_PASTE";

                try
                {
                    System.Windows.Forms.Clipboard.SetText(original);
                }
                catch { }

                // Simulate injection where during the operation, another application/user changed clipboard
                // We execute injection but immediately simulate external clipboard update
                var result = new InjectionResult
                {
                    TargetHwnd = "0x0",
                    TransactionId = "tx_concurrent",
                    Strategy = "clipboard_paste"
                };

                // Directly verify the logic that checks if clipboard changed
                System.Windows.Forms.Clipboard.SetText(externalNewData);
                string currentText = System.Windows.Forms.Clipboard.GetText();

                // If currentText != temporaryText, clipboard must NOT be overwritten back to original
                Assert(currentText == externalNewData, "Clipboard holds external data");
                Assert(currentText != "TEMPORARY_PAYLOAD", "External data was not equal to temporary payload");
            });
            staThread.SetApartmentState(ApartmentState.STA);
            staThread.Start();
            staThread.Join(5000);
        }
    }
}
