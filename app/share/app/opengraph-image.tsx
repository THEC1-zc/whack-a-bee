import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function AppShareOpenGraphImage() {
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
            "radial-gradient(circle at top, rgba(255,245,191,0.22) 0%, rgba(255,245,191,0) 24%), linear-gradient(180deg, rgba(30,14,2,0.16) 0%, rgba(30,14,2,0.36) 100%), linear-gradient(140deg, #b7a21f 0%, #d3bc44 48%, #ae8d12 100%)",
          color: "#fff9eb",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: "0",
            display: "flex",
            background:
              "linear-gradient(180deg, rgba(22,10,0,0.08) 0%, rgba(22,10,0,0.22) 100%)",
          }}
        />

        <div
          style={{
            width: "840px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            gap: "18px",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: "22px",
              fontWeight: 900,
              letterSpacing: "0.28em",
              textTransform: "uppercase",
              color: "#ffdd76",
              textShadow: "0 3px 14px rgba(20,10,0,0.26)",
            }}
          >
            Farcaster Mini App
          </div>

          <div
            style={{
              display: "flex",
              width: "168px",
              height: "168px",
              borderRadius: "42px",
              background: "linear-gradient(180deg, rgba(255,214,73,0.98) 0%, rgba(247,189,43,0.92) 100%)",
              boxShadow: "0 20px 48px rgba(20,10,0,0.18)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <img
              src={`${process.env.NEXT_PUBLIC_APP_URL || "https://whack-a-bee.vercel.app"}/icon.png`}
              alt=""
              width="120"
              height="120"
              style={{ objectFit: "contain" }}
            />
          </div>

          <div
            style={{
              display: "flex",
              fontSize: "78px",
              fontWeight: 900,
              lineHeight: 0.92,
              letterSpacing: "-0.06em",
              textShadow: "0 6px 20px rgba(20,10,0,0.26)",
            }}
          >
            Whack-a-Butterfly
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
            Tap fast. Dodge Bombfly. Win BF. Climb the weekly pot on Farcaster.
          </div>

          <div
            style={{
              display: "flex",
              gap: "14px",
              marginTop: "8px",
            }}
          >
            {["Easy to Hard", "On-chain BF payouts", "Weekly pot rewards"].map((label) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  borderRadius: "999px",
                  padding: "14px 22px",
                  fontSize: "20px",
                  fontWeight: 800,
                  background: "rgba(43,20,3,0.22)",
                  color: "#fff4d4",
                  border: "1px solid rgba(255,222,114,0.18)",
                }}
              >
                {label}
              </div>
            ))}
          </div>

          <div
            style={{
              display: "flex",
              marginTop: "6px",
              borderRadius: "999px",
              padding: "16px 28px",
              background: "linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)",
              color: "#ffffff",
              fontSize: "26px",
              fontWeight: 900,
              boxShadow: "0 16px 32px rgba(76,29,149,0.24)",
            }}
          >
            Open in Farcaster
          </div>
        </div>
      </div>
    ),
    size
  );
}
