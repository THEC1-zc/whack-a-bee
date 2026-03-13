import { ImageResponse } from "next/og";
import { getRunWaveCount } from "@/lib/gameRules";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  const waveLine = [
    `Easy ${getRunWaveCount("easy", "low")}-${getRunWaveCount("easy", "mega")}`,
    `Medium ${getRunWaveCount("medium", "low")}-${getRunWaveCount("medium", "mega")}`,
    `Hard ${getRunWaveCount("hard", "low")}-${getRunWaveCount("hard", "mega")}`,
  ].join(" / ");

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          position: "relative",
          background:
            "radial-gradient(circle at 18% 18%, rgba(255,224,102,0.28), transparent 28%), radial-gradient(circle at 82% 18%, rgba(109,40,217,0.25), transparent 26%), linear-gradient(145deg, #120600 0%, #2d1200 55%, #5b2600 100%)",
          color: "#fff8d6",
          fontFamily: "Arial, sans-serif",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: "36px",
            display: "flex",
            borderRadius: "40px",
            border: "3px solid rgba(251,191,36,0.35)",
            background: "linear-gradient(180deg, rgba(22,8,0,0.86) 0%, rgba(30,12,0,0.7) 100%)",
            boxShadow: "0 25px 70px rgba(0,0,0,0.28)",
            padding: "42px 46px",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              width: "100%",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "14px", maxWidth: "700px" }}>
                <div style={{ display: "flex", fontSize: "22px", fontWeight: 800, letterSpacing: "0.24em", color: "#fbbf24", textTransform: "uppercase" }}>
                  Farcaster Mini App
                </div>
                <div style={{ display: "flex", fontSize: "78px", lineHeight: 0.96, fontWeight: 900, letterSpacing: "-0.05em" }}>
                  Whack-a-Butterfly
                </div>
                <div style={{ display: "flex", fontSize: "30px", lineHeight: 1.35, color: "#fde68a", maxWidth: "640px" }}>
                  Tap fast, dodge Bombfly, stack points, and win BF directly on Farcaster.
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "220px",
                  height: "220px",
                  borderRadius: "32px",
                  background: "linear-gradient(160deg, rgba(109,40,217,0.96) 0%, rgba(124,58,237,0.9) 100%)",
                  border: "3px solid rgba(255,255,255,0.14)",
                  boxShadow: "0 18px 40px rgba(76,29,149,0.35)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    width: "112px",
                    height: "112px",
                    background: "#ffffff",
                    clipPath: "polygon(8% 0%, 92% 0%, 92% 18%, 82% 18%, 82% 100%, 62% 100%, 62% 56%, 38% 56%, 38% 100%, 18% 100%, 18% 18%, 8% 18%)",
                  }}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: "18px" }}>
              {[
                { label: "3 difficulties", value: waveLine + " waves" },
                { label: "On-chain payouts", value: "BF rewards + weekly pot" },
                { label: "Shareable runs", value: "Post your score to Farcaster" },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                    flex: 1,
                    borderRadius: "24px",
                    padding: "18px 22px",
                    background: "rgba(251,191,36,0.08)",
                    border: "2px solid rgba(251,191,36,0.22)",
                  }}
                >
                  <div style={{ display: "flex", fontSize: "18px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.14em", color: "#fbbf24" }}>
                    {item.label}
                  </div>
                  <div style={{ display: "flex", fontSize: "26px", lineHeight: 1.2, fontWeight: 800, color: "#fff8d6" }}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "22px" }}>
              <div style={{ display: "flex", fontSize: "24px", color: "#fde68a", fontWeight: 700 }}>
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
                Open in Farcaster
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    size
  );
}
