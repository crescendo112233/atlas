import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://our-planet-diary-sz-sg.quzheping112233.chatgpt.site"),
  title: "我们的地球",
  description: "在真实的三维地球上记录两个人共同去过的地点与照片。",
  openGraph: {
    title: "我们的地球",
    description: "一张可以旋转的共同足迹地图。",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
