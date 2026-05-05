import { ImageResponse } from "next/og";

export const alt = "DealFlow OS command center for real estate inbound dealflow";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "#030712",
          color: "#f8fafc",
          display: "flex",
          height: "100%",
          overflow: "hidden",
          position: "relative",
          width: "100%",
        }}
      >
        <div
          style={{
            background:
              "radial-gradient(circle at 18% 8%, rgba(34,211,238,0.34), transparent 30%), radial-gradient(circle at 76% 18%, rgba(129,140,248,0.38), transparent 34%), radial-gradient(circle at 90% 90%, rgba(192,132,252,0.26), transparent 34%)",
            inset: 0,
            position: "absolute",
          }}
        />
        <div
          style={{
            background:
              "linear-gradient(90deg, rgba(34,211,238,0.22) 1px, transparent 1px), linear-gradient(0deg, rgba(129,140,248,0.14) 1px, transparent 1px)",
            backgroundSize: "80px 80px",
            inset: 0,
            opacity: 0.35,
            position: "absolute",
          }}
        />
        <div
          style={{
            border: "1px solid rgba(148,163,184,0.18)",
            borderRadius: 32,
            display: "flex",
            flexDirection: "column",
            height: 510,
            justifyContent: "space-between",
            margin: 60,
            padding: 52,
            position: "relative",
            width: 1080,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div
              style={{
                alignItems: "center",
                background: "rgba(34,211,238,0.10)",
                border: "1px solid rgba(103,232,249,0.35)",
                borderRadius: 16,
                color: "#a5f3fc",
                display: "flex",
                fontSize: 28,
                fontWeight: 800,
                height: 64,
                justifyContent: "center",
                width: 64,
              }}
            >
              D
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontSize: 34, fontWeight: 800 }}>DealFlow OS</div>
              <div style={{ color: "#a5f3fc", fontSize: 20, fontWeight: 700 }}>
                Inbound dealflow command center
              </div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 26, maxWidth: 840 }}>
            <div style={{ color: "#67e8f9", fontSize: 24, fontWeight: 800, letterSpacing: 2 }}>
              BUILT BY EX-AGENCY OPERATORS
            </div>
            <div style={{ fontSize: 76, fontWeight: 850, letterSpacing: -2, lineHeight: 0.95 }}>
              Stop buying agency promises. Launch the system into dealflow.
            </div>
            <div style={{ color: "#cbd5e1", fontSize: 28, lineHeight: 1.35, maxWidth: 860 }}>
              Funnel, creative direction, lead capture, routing, reporting, and optimization loop in one owned software layer.
            </div>
          </div>
          <div style={{ display: "flex", gap: 14 }}>
            {["No sales-call gate", "No rented dashboard", "Human oversight"].map((label) => (
              <div
                key={label}
                style={{
                  background: "rgba(15,23,42,0.72)",
                  border: "1px solid rgba(148,163,184,0.22)",
                  borderRadius: 999,
                  color: "#e0f2fe",
                  fontSize: 20,
                  fontWeight: 700,
                  padding: "14px 20px",
                }}
              >
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
