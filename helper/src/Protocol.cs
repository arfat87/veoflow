using System;
using System.Text;

namespace VeoFlow.Helper
{
    public static class Protocol
    {
        public const string VERSION = "1.0.0";

        public static string SerializeJson(object obj)
        {
            if (obj == null) return "null";
            Type t = obj.GetType();

            if (t == typeof(string)) return "\"" + EscapeString((string)obj) + "\"";
            if (t == typeof(bool)) return ((bool)obj) ? "true" : "false";
            if (t.IsPrimitive) return obj.ToString();

            StringBuilder sb = new StringBuilder("{");
            bool first = true;
            foreach (var prop in t.GetProperties())
            {
                if (!first) sb.Append(",");
                first = false;
                sb.Append("\"").Append(prop.Name).Append("\":");
                sb.Append(SerializeJson(prop.GetValue(obj, null)));
            }
            sb.Append("}");
            return sb.ToString();
        }

        public static string EscapeString(string s)
        {
            if (string.IsNullOrEmpty(s)) return "";
            StringBuilder sb = new StringBuilder();
            foreach (char c in s)
            {
                switch (c)
                {
                    case '\\': sb.Append("\\\\"); break;
                    case '"': sb.Append("\\\""); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\t': sb.Append("\\t"); break;
                    case '\b': sb.Append("\\b"); break;
                    case '\f': sb.Append("\\f"); break;
                    default:
                        if (c < 32)
                        {
                            sb.AppendFormat("\\u{0:x4}", (int)c);
                        }
                        else
                        {
                            sb.Append(c);
                        }
                        break;
                }
            }
            return sb.ToString();
        }

        public static string ExtractJsonField(string json, string field)
        {
            if (string.IsNullOrEmpty(json) || string.IsNullOrEmpty(field)) return null;

            string searchKey = "\"" + field + "\"";
            int keyIdx = json.IndexOf(searchKey, StringComparison.OrdinalIgnoreCase);
            if (keyIdx < 0) return null;

            int colonIdx = json.IndexOf(':', keyIdx + searchKey.Length);
            if (colonIdx < 0) return null;

            int startIdx = colonIdx + 1;
            while (startIdx < json.Length && char.IsWhiteSpace(json[startIdx]))
            {
                startIdx++;
            }
            if (startIdx >= json.Length) return null;

            if (json[startIdx] == '"')
            {
                StringBuilder sb = new StringBuilder();
                int i = startIdx + 1;
                while (i < json.Length)
                {
                    char c = json[i];
                    if (c == '\\')
                    {
                        if (i + 1 < json.Length)
                        {
                            char next = json[i + 1];
                            switch (next)
                            {
                                case '"': sb.Append('"'); i += 2; continue;
                                case '\\': sb.Append('\\'); i += 2; continue;
                                case '/': sb.Append('/'); i += 2; continue;
                                case 'b': sb.Append('\b'); i += 2; continue;
                                case 'f': sb.Append('\f'); i += 2; continue;
                                case 'n': sb.Append('\n'); i += 2; continue;
                                case 'r': sb.Append('\r'); i += 2; continue;
                                case 't': sb.Append('\t'); i += 2; continue;
                                case 'u':
                                    if (i + 5 < json.Length)
                                    {
                                        string hex = json.Substring(i + 2, 4);
                                        int codePoint;
                                        if (int.TryParse(hex, System.Globalization.NumberStyles.HexNumber, null, out codePoint))
                                        {
                                            sb.Append((char)codePoint);
                                            i += 6;
                                            continue;
                                        }
                                    }
                                    break;
                            }
                            sb.Append(next);
                            i += 2;
                            continue;
                        }
                    }
                    else if (c == '"')
                    {
                        return sb.ToString();
                    }
                    else
                    {
                        sb.Append(c);
                        i++;
                    }
                }
                return sb.ToString();
            }
            else
            {
                int endIdx = startIdx;
                while (endIdx < json.Length && json[endIdx] != ',' && json[endIdx] != '}' && json[endIdx] != ']' && !char.IsWhiteSpace(json[endIdx]))
                {
                    endIdx++;
                }
                return json.Substring(startIdx, endIdx - startIdx).Trim();
            }
        }
    }
}

