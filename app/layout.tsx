import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://our-planet-diary-sz-sg.quzheping112233.chatgpt.site"),
  title: "TOOP & PP'S ATLAS",
  description: "A shared, interactive 3D atlas for places and memories.",
  openGraph: {
    title: "TOOP & PP'S ATLAS",
    description: "A shared, interactive 3D atlas for places and memories.",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
