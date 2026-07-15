import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Radius — Say the site. Watch it appear.",
  description:
    "Radius is the easiest way to use the world’s best AIs. Describe a website, watch agents build it live, then Keep, Undo, or Tweak.",
  icons: {
    icon: [{ url: "/favicon.png", type: "image/png" }],
    shortcut: "/favicon.png",
    apple: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
