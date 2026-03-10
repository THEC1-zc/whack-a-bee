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
  const waves = Math.max(0, Math.floor(readNumber(searchParams.get("waves"), 0)));

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          position: "relative",
          background:
            "radial-gradient(circle at 14% 18%, rgba(251,191,36,0.24), transparent 24%), radial-gradient(circle at 86% 22%, rgba(109,40,217,0.24), transparent 24%), linear-gradient(155deg, #100500 0%, #2a1100 55%, #5a2400 100%)",
          color: "#fff7d6",
          fontFamily: "Arial, sans-serif",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: "34px",
            borderRadius: "40px",
            border: "3px solid rgba(251,191,36,0.28)",
            background: "linear-gradient(180deg, rgba(19,8,0,0.88) 0%, rgba(24,10,0,0.72) 100%)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "42px 44px",
            boxShadow: "0 25px 70px rgba(0,0,0,0.26)",
          }}
        >
          <div
            style={{
              display: "flex",
              width: "100%",
              justifyContent: "space-between",
              alignItems: "flex-start",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "14px",
                maxWidth: "760px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  fontSize: "22px",
                  fontWeight: 800,
                  letterSpacing: "0.24em",
                  color: "#fbbf24",
                  textTransform: "uppercase",
                }}
              >
                Payout Summary
              </div>
              <div
                style={{
                  display: "flex",
                  fontSize: "72px",
                  fontWeight: 900,
                  letterSpacing: "-0.05em",
                  lineHeight: 0.95,
                }}
              >
                Whack-a-Butterfly
              </div>
              <div style={{ display: "flex", fontSize: "32px", color: "#fde68a", fontWeight: 800 }}>
                {difficulty} mode • {waves || "?"} waves cleared
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              width: "100%",
              gap: "26px",
              alignItems: "stretch",
            }}
          >
            <div
              style={{
                width: "380px",
                borderRadius: "30px",
                border: "2px solid rgba(251,191,36,0.35)",
                background: "linear-gradient(180deg, rgba(251,191,36,0.14), rgba(251,191,36,0.05))",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                padding: "30px",
                gap: "18px",
              }}
            >
              <div style={{ display: "flex", fontSize: "28px", fontWeight: 800, color: "#fbbf24", textTransform: "uppercase", letterSpacing: "0.18em" }}>
                BF Won
              </div>
              <div style={{ display: "flex", fontSize: "108px", lineHeight: 0.9, fontWeight: 900, color: "#fff8d6" }}>
                {prizeBf.toLocaleString()}
              </div>
              <div style={{ display: "flex", fontSize: "28px", fontWeight: 800, color: "#34d399" }}>
                {score} points made
              </div>
            </div>

            <div
              style={{
                display: "flex",
                flex: 1,
                flexDirection: "column",
                gap: "16px",
                justifyContent: "center",
              }}
            >
              <div style={{ display: "flex", gap: "14px" }}>
                {[
                  { label: "Performance", value: `${pct}%` },
                  { label: "Fee", value: `${fee} USDC` },
                  { label: "Tickets", value: `${tickets}` },
                ].map((item) => (
                  <div
                    key={item.label}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      flex: 1,
                      gap: "8px",
                      borderRadius: "22px",
                      border: "2px solid rgba(251,191,36,0.2)",
                      background: "rgba(251,191,36,0.08)",
                      padding: "18px 20px",
                    }}
                  >
                    <div style={{ display: "flex", fontSize: "18px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "#fbbf24" }}>
                      {item.label}
                    </div>
                    <div style={{ display: "flex", fontSize: "34px", fontWeight: 900, color: "#fff8d6" }}>
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                  borderRadius: "26px",
                  padding: "24px 26px",
                  background: "rgba(109,40,217,0.12)",
                  border: "2px solid rgba(167,139,250,0.22)",
                }}
              >
                <div style={{ display: "flex", fontSize: "18px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.14em", color: "#c4b5fd" }}>
                  Shareable Result
                </div>
                <div style={{ display: "flex", fontSize: "28px", lineHeight: 1.3, fontWeight: 700, color: "#f5f3ff" }}>
                  Cleared a {difficulty.toLowerCase()} run on Farcaster and banked a live BF payout.
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", fontSize: "24px", fontWeight: 700, color: "#fde68a" }}>
              by @thec1
            </div>
            <div
              style={{
                display: "flex",
                padding: "16px 24px",
                borderRadius: "999px",
                background: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)",
                color: "#1a0a00",
                fontSize: "24px",
                fontWeight: 900,
              }}
            >
              Play in Farcaster
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
