import type { Metadata } from "next";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://whack-a-bee.vercel.app";
const SHARE_URL = `${APP_URL}/share/app`;

export const metadata: Metadata = {
  title: "Whack-a-Butterfly on Farcaster",
  description: "Tap butterflies, dodge Bombfly, win BF, and launch the miniapp directly from Farcaster.",
  openGraph: {
    title: "Whack-a-Butterfly",
    description: "Play the Farcaster miniapp, win BF, and chase the weekly pot.",
    images: [`${SHARE_URL}/opengraph-image`],
  },
  other: {
    "fc:frame": JSON.stringify({
      version: "next",
      imageUrl: `${SHARE_URL}/opengraph-image`,
      button: {
        title: "🦋 Play Whack-a-Butterfly",
        action: {
          type: "launch_frame",
          name: "Whack-a-Butterfly",
          url: APP_URL,
          splashImageUrl: `${APP_URL}/splash.png`,
          splashBackgroundColor: "#f7bd2b",
        },
      },
    }),
  },
};

export default function AppSharePage() {
  return null;
}
