using System;
using System.Runtime.InteropServices;
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
    }
}
