import type { Metadata } from "next";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://whack-a-bee.vercel.app";

function readParam(value: string | string[] | undefined, fallback: string) {
  if (Array.isArray(value)) return value[0] || fallback;
  return value || fallback;
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const params = await searchParams;
  const score = readParam(params.score, "0");
  const prizeBf = readParam(params.prizeBf, "0");
  const difficulty = readParam(params.difficulty, "Battle");
  const type = readParam(params.type, "Run");
  const waves = readParam(params.waves, "?");
  const shareQuery = new URLSearchParams({
    score,
    prizeBf,
    difficulty,
    type,
    waves,
  });
  const shareUrl = `${APP_URL}/share/payout?${shareQuery.toString()}`;
  const imageUrl = `${APP_URL}/api/share-payout-image?${shareQuery.toString()}`;

  return {
    title: `${prizeBf} BF net won on Whack-a-Butterfly`,
    description: `${type} ${difficulty} run cleared on Farcaster in ${waves} waves with ${score} points and ${prizeBf} BF net won.`,
    openGraph: {
      title: "Whack-a-Butterfly Payout",
      description: `${type} ${difficulty} run cleared in ${waves} waves with ${score} points and ${prizeBf} BF net won.`,
      images: [imageUrl],
      url: shareUrl,
    },
    other: {
      "fc:frame": JSON.stringify({
        version: "next",
        imageUrl,
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
}

export default function PayoutSharePage() {
  return null;
}
