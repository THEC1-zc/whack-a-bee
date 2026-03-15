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
  const prizeBf = Math.max(0, Math.floor(readNumber(searchParams.get("prizeBf"), 0)));
  const difficulty = (searchParams.get("difficulty") || "Battle").slice(0, 16);
  const type = (searchParams.get("type") || "Run").slice(0, 16);
  const waves = Math.max(0, Math.floor(readNumber(searchParams.get("waves"), 0)));

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          overflow: "hidden",
          background:
            "radial-gradient(circle at top, rgba(221,255,205,0.18) 0%, rgba(221,255,205,0) 24%), linear-gradient(180deg, rgba(4,24,13,0.18) 0%, rgba(4,24,13,0.36) 100%), linear-gradient(145deg, #195235 0%, #2f7c4b 44%, #133a27 100%)",
          color: "#f4fff5",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: "0",
            display: "flex",
            background: "linear-gradient(180deg, rgba(20,10,0,0.12) 0%, rgba(20,10,0,0.3) 100%)",
          }}
        />

        <div
          style={{
            width: "840px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            gap: "20px",
          }}
        >
          <div
            style={{
              display: "flex",
              width: "150px",
              height: "150px",
              borderRadius: "38px",
              background: "linear-gradient(180deg, rgba(221,255,205,0.16) 0%, rgba(221,255,205,0.06) 100%)",
              border: "1px solid rgba(167,243,208,0.18)",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 20px 46px rgba(3,19,11,0.18)",
            }}
          >
            <img
              src={`${process.env.NEXT_PUBLIC_APP_URL || "https://whack-a-bee.vercel.app"}/icon.png`}
              alt=""
              width="108"
              height="108"
              style={{ objectFit: "contain" }}
            />
          </div>

          <div
            style={{
              display: "flex",
              fontSize: "22px",
              fontWeight: 900,
              letterSpacing: "0.24em",
              textTransform: "uppercase",
              color: "#d9f46b",
              textShadow: "0 3px 14px rgba(3,19,11,0.26)",
            }}
          >
            Payout Summary
          </div>

          <div
            style={{
              display: "flex",
              marginTop: "-8px",
              fontSize: "24px",
              fontWeight: 800,
              color: "rgba(244,255,245,0.82)",
            }}
          >
            Net player payout
          </div>

          <div
            style={{
              display: "flex",
              fontSize: "88px",
              fontWeight: 900,
              lineHeight: 0.92,
              letterSpacing: "-0.06em",
              textShadow: "0 6px 20px rgba(20,10,0,0.28)",
            }}
          >
            {prizeBf.toLocaleString()} BF
          </div>

          <div
            style={{
              display: "flex",
              gap: "18px",
            }}
          >
            <div
              style={{
                display: "flex",
                borderRadius: "999px",
                padding: "14px 26px",
                background: "rgba(10,44,26,0.22)",
                border: "1px solid rgba(167,243,208,0.18)",
                color: "#f4fff5",
                fontSize: "28px",
                fontWeight: 800,
              }}
            >
              {type} {difficulty}
            </div>
            <div
              style={{
                display: "flex",
                borderRadius: "999px",
                padding: "14px 26px",
                background: "rgba(10,44,26,0.22)",
                border: "1px solid rgba(167,243,208,0.18)",
                color: "#f4fff5",
                fontSize: "28px",
                fontWeight: 800,
              }}
            >
              {score} points{waves > 0 ? ` • ${waves} waves` : ""}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              maxWidth: "760px",
              fontSize: "28px",
              lineHeight: 1.28,
              color: "rgba(244,255,245,0.96)",
              textShadow: "0 3px 14px rgba(3,19,11,0.24)",
            }}
          >
            Cleared a {type.toLowerCase()} {difficulty.toLowerCase()} run on Farcaster and claimed a live BF net payout on-chain.
          </div>

          <div
            style={{
              display: "flex",
              marginTop: "4px",
              borderRadius: "999px",
              padding: "16px 28px",
              background: "linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)",
              color: "#ffffff",
              fontSize: "26px",
              fontWeight: 900,
              boxShadow: "0 16px 32px rgba(76,29,149,0.24)",
            }}
          >
            Play in Farcaster
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
