import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ThemeProvider } from "@/components/ui/theme-provider";

const googleSansFlex = localFont({
  src: "./fonts/GoogleSansFlex-VariableFont.ttf",
  variable: "--font-google-sans-flex",
  display: "swap",
});

const windowsCommandPrompt = localFont({
  src: "./fonts/windows_command_prompt.ttf",
  variable: "--font-windows-command-prompt",
  className: "--font-windows-command-prompt-class",
  display: "swap",
  fallback: ['monospace'],
});

export const metadata: Metadata = {
  title: "Email System",
  description: "AI-powered email generation system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <body className={`${googleSansFlex.variable} ${windowsCommandPrompt.variable} antialiased font-sans`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}

