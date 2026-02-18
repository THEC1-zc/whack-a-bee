import type { Metadata } from "next";
import "./globals.css";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://whack-a-bee.vercel.app";

export const metadata: Metadata = {
  title: "🦋 Whack-a-Butterfly",
  description: "Catch butterflies, win prizes! Farcaster Mini App.",
  openGraph: {
    title: "🦋 Whack-a-Butterfly",
    description: "Catch butterflies, win prizes!",
    images: [`${APP_URL}/og-image.png`],
  },
  other: {
    "fc:frame": JSON.stringify({
      version: "next",
      imageUrl: `${APP_URL}/og-image.png`,
      button: {
        title: "🦋 Play Whack-a-Butterfly",
        action: {
          type: "launch_frame",
          name: "Whack-a-Butterfly",
          url: APP_URL,
          splashImageUrl: `${APP_URL}/splash.png`,
          splashBackgroundColor: "#fbbf24",
        },
      },
    }),
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
