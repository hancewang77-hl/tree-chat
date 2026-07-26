import type { Metadata } from "next";
import "katex/dist/katex.min.css";
import "./globals.css";

// 字体：本文件不加载任何网络字体。globals.css 中的 --font-lora /
// --font-geist-* 只是系统回退字体栈（Georgia、Inter/system-ui 等），
// Lora 与 Geist 字体文件并未随应用分发。

export const metadata: Metadata = {
  title: "智构树语",
  description: "树状思维探索平台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased" suppressHydrationWarning>
      <head>
        {/* 深色主题必须在首帧前落到 data-theme 上（避免 FOUC），故用内联脚本读 localStorage */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                var theme = localStorage.getItem('theme');
                if (theme === 'dark') {
                  document.documentElement.setAttribute('data-theme', 'dark');
                }
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
