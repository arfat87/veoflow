using System;
using System.Reflection;

namespace VeoFlow.Helper.Tests
{
    class TestRunner
    {
        [STAThread]
        static int Main(string[] args)
        {
            NativeMethods.EnsureAttachedToInputDesktop();
            Console.WriteLine("==================================================");
            Console.WriteLine(" VeoFlow Native Helper C# Unit Test Suite");
            Console.WriteLine("==================================================");

            HelperProtocolTests tests = new HelperProtocolTests();
            MethodInfo[] methods = typeof(HelperProtocolTests).GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly);

            int passed = 0;
            int failed = 0;

            foreach (var m in methods)
            {
                if (m.Name.StartsWith("Test_"))
                {
                    try
                    {
                        m.Invoke(tests, null);
                        Console.WriteLine(" [PASS] {0}", m.Name);
                        passed++;
                    }
                    catch (Exception ex)
                    {
                        Exception inner = ex.InnerException ?? ex;
                        Console.WriteLine(" [FAIL] {0}: {1}", m.Name, inner.Message);
                        failed++;
                    }
                }
            }

            Console.WriteLine("--------------------------------------------------");
            Console.WriteLine(" Total: {0} | Passed: {1} | Failed: {2}", passed + failed, passed, failed);
            Console.WriteLine("==================================================");

            return failed == 0 ? 0 : 1;
        }
    }
}

