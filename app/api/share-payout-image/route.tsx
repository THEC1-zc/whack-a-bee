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
            "radial-gradient(circle at top, rgba(255,245,191,0.18) 0%, rgba(255,245,191,0) 24%), linear-gradient(180deg, rgba(24,11,1,0.1) 0%, rgba(24,11,1,0.24) 100%), linear-gradient(145deg, #b69f1f 0%, #d8c14d 44%, #b38e0d 100%)",
          color: "#fff9eb",
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
              background: "linear-gradient(180deg, rgba(255,214,73,0.98) 0%, rgba(247,189,43,0.92) 100%)",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 20px 46px rgba(20,10,0,0.18)",
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
              color: "#ffe08a",
              textShadow: "0 3px 14px rgba(20,10,0,0.26)",
            }}
          >
            Payout Summary
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
                background: "rgba(42,20,3,0.2)",
                border: "1px solid rgba(255,222,114,0.18)",
                color: "#fff4d4",
                fontSize: "28px",
                fontWeight: 800,
              }}
            >
              {difficulty}
            </div>
            <div
              style={{
                display: "flex",
                borderRadius: "999px",
                padding: "14px 26px",
                background: "rgba(42,20,3,0.2)",
                border: "1px solid rgba(255,222,114,0.18)",
                color: "#fff4d4",
                fontSize: "28px",
                fontWeight: 800,
              }}
            >
              {score} points
            </div>
          </div>

          <div
            style={{
              display: "flex",
              maxWidth: "760px",
              fontSize: "28px",
              lineHeight: 1.28,
              color: "rgba(255,244,212,0.96)",
              textShadow: "0 3px 14px rgba(20,10,0,0.24)",
            }}
          >
            Cleared a run on Farcaster and claimed a live BF payout on-chain.
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
