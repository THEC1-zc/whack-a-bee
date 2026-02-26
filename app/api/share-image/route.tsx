import { ImageResponse } from "next/og";

export const runtime = "edge";

function readNumber(value: string | null, fallback: number) {
  if (!value) return fallback;
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return num;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const score = Math.max(0, Math.floor(readNumber(searchParams.get("score"), 0)));
  const pct = Math.max(0, Math.min(100, Math.floor(readNumber(searchParams.get("pct"), 0))));
  const prizeBf = Math.max(0, Math.floor(readNumber(searchParams.get("prizeBf"), 0)));
  const fee = readNumber(searchParams.get("fee"), 0.0);
  const difficulty = (searchParams.get("difficulty") || "Battle").slice(0, 16);
  const tickets = Math.max(0, Math.floor(readNumber(searchParams.get("tickets"), 0)));

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(180deg, #1a0a00 0%, #2a1200 100%)",
          color: "#fff",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div
          style={{
            width: "1040px",
            height: "520px",
            borderRadius: "36px",
            border: "3px solid #92400e",
            background: "rgba(20, 9, 0, 0.9)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "44px",
          }}
        >
          <div
            style={{
              width: "360px",
              height: "430px",
              borderRadius: "28px",
              border: "2px solid #f59e0b",
              background: "linear-gradient(180deg, rgba(251,191,36,0.16), rgba(251,191,36,0.04))",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: "20px",
            }}
          >
            <div style={{ display: "flex", fontSize: "34px", color: "#fbbf24", fontWeight: 900 }}>
              GAME OVER
            </div>
            <div style={{ display: "flex", fontSize: "110px", lineHeight: 1, color: "#fbbf24", fontWeight: 900 }}>
              {score}
            </div>
            <div style={{ display: "flex", fontSize: "24px", color: "#f3f4f6", fontWeight: 700 }}>
              {pct}% performance
            </div>
            <div style={{ display: "flex", fontSize: "24px", color: "#22c55e", fontWeight: 900 }}>
              {prizeBf.toLocaleString()} BF
            </div>
          </div>
          <div
            style={{
              width: "590px",
              display: "flex",
              flexDirection: "column",
              gap: "18px",
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: "58px",
                fontWeight: 900,
                letterSpacing: "-1px",
              }}
            >
              Whack-a-Butterfly
            </div>
            <div style={{ display: "flex", fontSize: "30px", color: "#fbbf24", fontWeight: 800 }}>
              {difficulty} mode recap
            </div>
            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              <div
                style={{
                  display: "flex",
                  padding: "10px 16px",
                  borderRadius: "16px",
                  background: "rgba(251,191,36,0.15)",
                  border: "2px solid #f59e0b",
                  fontSize: "20px",
                  fontWeight: 800,
                }}
              >
                Fee {fee} USDC
              </div>
              <div
                style={{
                  display: "flex",
                  padding: "10px 16px",
                  borderRadius: "16px",
                  background: "rgba(16,185,129,0.15)",
                  border: "2px solid #34d399",
                  fontSize: "20px",
                  fontWeight: 800,
                }}
              >
                Tickets {tickets}
              </div>
            </div>
            <div style={{ display: "flex", fontSize: "30px", color: "#f3f4f6", fontWeight: 700 }}>
              Tap to play on Farcaster miniapp
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
