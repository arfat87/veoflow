using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;

class IconGenerator
{
    static void Main()
    {
        string buildDir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "..", "build");
        if (!Directory.Exists(buildDir))
        {
            Directory.CreateDirectory(buildDir);
        }

        int size = 256;
        using (Bitmap bmp = new Bitmap(size, size, PixelFormat.Format32bppArgb))
        {
            using (Graphics g = Graphics.FromImage(bmp))
            {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.PixelOffsetMode = PixelOffsetMode.HighQuality;
                g.Clear(Color.Transparent);

                // 1. Dark obsidian rounded background
                int padding = 12;
                Rectangle rect = new Rectangle(padding, padding, size - 2 * padding, size - 2 * padding);
                int radius = 56;
                using (GraphicsPath path = GetRoundedRect(rect, radius))
                {
                    // Gradient fill: Obsidian to deep slate
                    using (LinearGradientBrush bgBrush = new LinearGradientBrush(
                        new Point(0, 0),
                        new Point(size, size),
                        Color.FromArgb(255, 15, 23, 42),
                        Color.FromArgb(255, 3, 7, 18)))
                    {
                        g.FillPath(bgBrush, path);
                    }

                    // Subtle cyan glow border
                    using (Pen borderPen = new Pen(Color.FromArgb(160, 6, 182, 212), 4f))
                    {
                        g.DrawPath(borderPen, path);
                    }
                }

                // 2. Glowing Cyan Audio Waveform / "V" glyph
                // Cyan color palette
                Color cyanGlow = Color.FromArgb(200, 34, 211, 238);
                Color cyanCore = Color.FromArgb(255, 6, 182, 212);
                Color cyanAccent = Color.FromArgb(255, 103, 232, 249);

                // Draw vertical waveform bars creating a dynamic "V" soundwave
                int[] heights = { 32, 54, 82, 120, 156, 110, 75, 48, 28 };
                int barWidth = 12;
                int gap = 8;
                int totalWidth = heights.Length * barWidth + (heights.Length - 1) * gap;
                int startX = (size - totalWidth) / 2;
                int centerY = size / 2;

                for (int i = 0; i < heights.Length; i++)
                {
                    int h = heights[i];
                    int x = startX + i * (barWidth + gap);
                    int y = centerY - h / 2;
                    Rectangle barRect = new Rectangle(x, y, barWidth, h);

                    using (GraphicsPath barPath = GetRoundedRect(barRect, 6))
                    {
                        // Outer glow for center bars
                        if (i >= 2 && i <= 6)
                        {
                            using (Pen glowPen = new Pen(Color.FromArgb(80, cyanGlow), 4f))
                            {
                                g.DrawPath(glowPen, barPath);
                            }
                        }

                        using (LinearGradientBrush barBrush = new LinearGradientBrush(
                            new Point(x, y),
                            new Point(x, y + h),
                            cyanAccent,
                            cyanCore))
                        {
                            g.FillPath(barBrush, barPath);
                        }
                    }
                }
            }

            // Save PNG
            string pngPath = Path.Combine(buildDir, "icon.png");
            bmp.Save(pngPath, ImageFormat.Png);
            Console.WriteLine("Saved PNG: " + pngPath);

            // Save multi-resolution Windows ICO
            string icoPath = Path.Combine(buildDir, "icon.ico");
            SaveAsIco(bmp, icoPath);
            Console.WriteLine("Saved ICO: " + icoPath);

            // Also copy to assets/icon.png
            string assetsDir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "..", "assets");
            if (Directory.Exists(assetsDir))
            {
                bmp.Save(Path.Combine(assetsDir, "icon.png"), ImageFormat.Png);
            }
        }
    }

    static GraphicsPath GetRoundedRect(Rectangle bounds, int radius)
    {
        int diameter = radius * 2;
        Size size = new Size(diameter, diameter);
        Rectangle arc = new Rectangle(bounds.Location, size);
        GraphicsPath path = new GraphicsPath();

        if (radius == 0)
        {
            path.AddRectangle(bounds);
            return path;
        }

        path.AddArc(arc, 180, 90);
        arc.X = bounds.Right - diameter;
        path.AddArc(arc, 270, 90);
        arc.Y = bounds.Bottom - diameter;
        path.AddArc(arc, 0, 90);
        arc.X = bounds.Left;
        path.AddArc(arc, 90, 90);
        path.CloseFigure();
        return path;
    }

    static void SaveAsIco(Bitmap srcBitmap, string outputPath)
    {
        int[] iconSizes = new int[] { 16, 32, 48, 64, 128, 256 };
        using (FileStream fs = new FileStream(outputPath, FileMode.Create))
        {
            using (BinaryWriter bw = new BinaryWriter(fs))
            {
                // ICONDIR header
                bw.Write((short)0); // Reserved (must be 0)
                bw.Write((short)1); // Resource type (1 for icons)
                bw.Write((short)iconSizes.Length); // Image count

                int offset = 6 + 16 * iconSizes.Length;
                byte[][] pngBuffers = new byte[iconSizes.Length][];

                for (int i = 0; i < iconSizes.Length; i++)
                {
                    int sz = iconSizes[i];
                    using (Bitmap resized = new Bitmap(srcBitmap, new Size(sz, sz)))
                    {
                        using (MemoryStream ms = new MemoryStream())
                        {
                            resized.Save(ms, ImageFormat.Png);
                            pngBuffers[i] = ms.ToArray();
                        }
                    }
                }

                // Write directory entries
                for (int i = 0; i < iconSizes.Length; i++)
                {
                    int sz = iconSizes[i];
                    byte bSz = (sz >= 256) ? (byte)0 : (byte)sz;

                    bw.Write(bSz); // Width
                    bw.Write(bSz); // Height
                    bw.Write((byte)0); // Color count
                    bw.Write((byte)0); // Reserved
                    bw.Write((short)1); // Color planes
                    bw.Write((short)32); // Bits per pixel
                    bw.Write(pngBuffers[i].Length); // Image size in bytes
                    bw.Write(offset); // Image offset

                    offset += pngBuffers[i].Length;
                }

                // Write image data
                for (int i = 0; i < iconSizes.Length; i++)
                {
                    bw.Write(pngBuffers[i]);
                }
            }
        }
    }
}

