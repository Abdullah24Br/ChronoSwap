import type { Metadata, Viewport } from "next";
import { Alexandria, IBM_Plex_Mono, IBM_Plex_Sans_Arabic } from "next/font/google";
import { AppShell } from "@/components/shell/app-shell";
import { THEME_INIT_SCRIPT } from "@/components/shell/theme";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

// Headings: Alexandria (geometric, distinctive Arabic display face).
const display = Alexandria({ variable: "--font-alexandria", subsets: ["arabic", "latin"], display: "swap" });
// Body: IBM Plex Sans Arabic (very readable at small sizes).
const body = IBM_Plex_Sans_Arabic({
  variable: "--font-plex-arabic",
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});
// Numbers / balances / times: IBM Plex Mono (tabular, precise).
const mono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500", "600"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "ChronoSwap — بنك الوقت", template: "%s · ChronoSwap" },
  description: "منصة تبادل المهارات بنظام بنك الوقت والمقايضة الذكية: علّم ساعة، وتعلّم ساعة.",
};

export const viewport: Viewport = {
  themeColor: "#07070A",
  viewportFit: "cover",
};

export const instant = false;

// NFR-4: Arabic, right-to-left, responsive.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ar"
      dir="rtl"
      data-theme="dark"
      suppressHydrationWarning
      className={`${display.variable} ${body.variable} ${mono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <ToastProvider>
          <AppShell>{children}</AppShell>
        </ToastProvider>
      </body>
    </html>
  );
}
