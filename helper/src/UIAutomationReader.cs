using System;
using System.Threading;
using System.Windows.Automation;
using System.Windows.Automation.Text;

namespace VeoFlow.Helper
{
    public class FocusContextData
    {
        public string ControlType { get; set; }
        public string Contents { get; set; }
        public string SelectedText { get; set; }
        public string BeforeText { get; set; }
        public string AfterText { get; set; }

        public FocusContextData()
        {
            ControlType = "";
            Contents = "";
            SelectedText = "";
            BeforeText = "";
            AfterText = "";
        }
    }

    public static class UIAutomationReader
    {
        public static FocusContextData InspectFocusedElement(int timeoutMs)
        {
            FocusContextData result = new FocusContextData();

            Thread uiaThread = new Thread(() =>
            {
                try
                {
                    AutomationElement focusedElement = AutomationElement.FocusedElement;
                    if (focusedElement == null) return;

                    try
                    {
                        result.ControlType = focusedElement.Current.ControlType.ProgrammaticName ?? "";
                    }
                    catch { }

                    // 1. TextPattern (Word, VS Code, WordPad, modern editors)
                    object textPatternObj;
                    if (focusedElement.TryGetCurrentPattern(TextPattern.Pattern, out textPatternObj))
                    {
                        TextPattern textPattern = (TextPattern)textPatternObj;
                        try
                        {
                            TextPatternRange[] selections = textPattern.GetSelection();
                            if (selections != null && selections.Length > 0)
                            {
                                result.SelectedText = selections[0].GetText(300) ?? "";
                            }
                        }
                        catch { }

                        try
                        {
                            TextPatternRange docRange = textPattern.DocumentRange;
                            if (docRange != null)
                            {
                                string fullText = docRange.GetText(300) ?? "";
                                result.Contents = fullText;
                            }
                        }
                        catch { }
                        return;
                    }

                    // 2. ValuePattern (Standard text boxes, search inputs, single-line edits)
                    object valuePatternObj;
                    if (focusedElement.TryGetCurrentPattern(ValuePattern.Pattern, out valuePatternObj))
                    {
                        ValuePattern valPattern = (ValuePattern)valuePatternObj;
                        string val = valPattern.Current.Value ?? "";
                        if (val.Length > 300)
                        {
                            val = val.Substring(val.Length - 300);
                        }
                        result.Contents = val;
                        return;
                    }
                }
                catch { }
            });

            uiaThread.SetApartmentState(ApartmentState.STA);
            uiaThread.IsBackground = true;
            uiaThread.Start();
            uiaThread.Join(timeoutMs);

            return result;
        }
    }
}

