import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const metadataBase = host ? new URL(`${protocol}://${host}`) : undefined;

  return {
    metadataBase,
    title: "我们的星球日记",
    description: "把两个人走过的亲密城市，收藏在一颗会发光的星球上。",
    openGraph: {
      title: "我们的星球日记",
      description: "每一次相见，都让这颗星球更亮一点。",
      images: metadataBase ? [{ url: new URL("/og.png", metadataBase) }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: "我们的星球日记",
      description: "每一次相见，都让这颗星球更亮一点。",
      images: metadataBase ? [new URL("/og.png", metadataBase)] : undefined,
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
