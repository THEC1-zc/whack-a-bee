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
  const difficulty = searchParams.get("difficulty") || "";
  const tickets = Math.max(0, Math.floor(readNumber(searchParams.get("tickets"), 0)));

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://whack-a-bee.vercel.app";
  const bgUrl = new URL("/back-portrait.png", appUrl).toString();
  const bfUrl = new URL("/bf.png", appUrl).toString();

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#120700",
          color: "#fff",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
          }}
        >
          <img
            src={bgUrl}
            style={{
              width: "1200px",
              height: "630px",
              objectFit: "cover",
              filter: "brightness(0.55)",
            }}
          />
        </div>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            background: "linear-gradient(180deg, rgba(10,6,0,0.8), rgba(20,10,0,0.9))",
          }}
        />
        <div
          style={{
            position: "relative",
            width: "1000px",
            display: "flex",
            alignItems: "center",
            gap: "40px",
          }}
        >
          <div
            style={{
              width: "320px",
              height: "320px",
              borderRadius: "32px",
              background: "rgba(26,10,0,0.75)",
              border: "4px solid #f59e0b",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 12px 40px rgba(0,0,0,0.4)",
            }}
          >
            <img
              src={bfUrl}
              style={{ width: "240px", height: "240px", objectFit: "contain" }}
            />
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "18px" }}>
            <div
              style={{
                display: "flex",
                fontSize: "56px",
                fontWeight: 900,
                letterSpacing: "-1px",
              }}
            >
              Whack-a-Butterfly
            </div>
            <div style={{ display: "flex", fontSize: "28px", color: "#fbbf24" }}>
              Game recap · {difficulty || "Battle"}
            </div>
            <div style={{ display: "flex", gap: "24px", alignItems: "center" }}>
              <div
                style={{
                  display: "flex",
                  padding: "12px 18px",
                  borderRadius: "16px",
                  background: "rgba(251,191,36,0.15)",
                  border: "2px solid #f59e0b",
                  fontSize: "26px",
                  fontWeight: 800,
                }}
              >
                Score {score}
              </div>
              <div
                style={{
                  display: "flex",
                  padding: "12px 18px",
                  borderRadius: "16px",
                  background: "rgba(16,185,129,0.15)",
                  border: "2px solid #34d399",
                  fontSize: "26px",
                  fontWeight: 800,
                }}
              >
                Prize {prizeBf.toLocaleString()} BF
              </div>
            </div>
            <div style={{ display: "flex", fontSize: "24px", color: "#f3f4f6" }}>
              Your game was{" "}
              <span style={{ color: "#fbbf24", fontWeight: 800 }}>{pct}%</span>
            </div>
            <div style={{ display: "flex", fontSize: "20px", color: "#fcd34d" }}>
              Fee {fee} USDC · Tickets {tickets}
            </div>
            <div style={{ display: "flex", fontSize: "20px", color: "#f59e0b" }}>
              Play on Farcaster miniapp
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
