import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_ORIGIN ?? "http://localhost:3000"),
  title: "TOOP & PP'S ATLAS",
  description: "A shared, interactive 3D atlas for places and memories.",
  openGraph: {
    title: "TOOP & PP'S ATLAS",
    description: "A shared, interactive 3D atlas for places and memories.",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
