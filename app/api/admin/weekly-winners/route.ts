import { NextRequest, NextResponse } from "next/server";
import { getAdminWallet, getWeeklyPayoutHistory } from "@/lib/weekly";

const ADMIN_WALLET = getAdminWallet();
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

function isAuthorized(req: NextRequest) {
  const token = req.headers.get("x-admin-token");
  if (ADMIN_API_KEY && token === ADMIN_API_KEY) return true;
  const addr = req.headers.get("x-admin-wallet") || "";
  return addr.toLowerCase() === ADMIN_WALLET;
}

function unique<T>(arr: T[]) {
  return [...new Set(arr)];
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const weekId = req.nextUrl.searchParams.get("weekId") || undefined;
  const logs = await getWeeklyPayoutHistory(200, weekId);
  const latestPaid = logs.find((l) => l.status === "paid");
  if (!latestPaid) {
    return NextResponse.json({ error: "No paid weekly payout found" }, { status: 404 });
  }

  const top3 = latestPaid.results.filter((r) => r.group === "top3");
  const lottery = latestPaid.results.filter((r) => r.group === "lottery");

  const tag = (r: (typeof top3)[number]) => {
    if (r.playerUsername) return `@${r.playerUsername}`;
    if (r.playerName) return r.playerName;
    return `${r.to.slice(0, 6)}...${r.to.slice(-4)}`;
  };

  const topTags = unique(top3.map(tag));
  const lotteryTags = unique(lottery.map(tag));

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://whack-a-bee.vercel.app").replace(/\/$/, "");
  const reportUrl = `${appUrl}/admin/payouts?week=${encodeURIComponent(latestPaid.weekId)}`;

  const castText = [
    `Weekly winners (${latestPaid.weekId}) on Whack-a-Butterfly by @Thec1`,
    topTags.length ? `Top 3: ${topTags.join(" · ")}` : "Top 3: n/a",
    lotteryTags.length ? `Lottery: ${lotteryTags.join(" · ")}` : "Lottery: n/a",
    `Pot: ${Math.round(Number(latestPaid.potBf || 0)).toLocaleString()} BF`,
    "Congrats to all winners!",
  ].join("\n");

  return NextResponse.json({
    ok: true,
    weekId: latestPaid.weekId,
    castText,
    embeds: [reportUrl, appUrl],
    top3,
    lottery,
  });
}
