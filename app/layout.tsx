import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://paytowin.lol"),
  title: "PayToWin.lol — The best shitpost money can buy.",
  description:
    "Pay a dollar to push a shitpost up the rankings. The money goes to us. That is the entire product.",
  icons: { icon: "/avatar-button.png" },
  openGraph: {
    title: "PayToWin.lol",
    description: "The best shitpost money can buy.",
    images: ["/avatar-button.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "PayToWin.lol",
    description: "The best shitpost money can buy.",
    images: ["/avatar-button.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
