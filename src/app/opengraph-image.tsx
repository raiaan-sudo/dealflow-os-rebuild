import { ImageResponse } from "next/og";

export const alt = "DealFlow OS";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "#07111f",
          color: "#f8fafc",
          display: "flex",
          fontFamily: "Inter, Arial, sans-serif",
          height: "100%",
          justifyContent: "center",
          padding: "72px",
          width: "100%",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
          <div style={{ color: "#67e8f9", fontSize: 32, fontWeight: 700, letterSpacing: 2 }}>
            DEALFLOW OS
          </div>
          <div style={{ fontSize: 78, fontWeight: 800, lineHeight: 1.04, maxWidth: 920 }}>
            Build, preview, and launch real estate campaigns.
          </div>
          <div style={{ color: "#cbd5e1", fontSize: 34, lineHeight: 1.3, maxWidth: 900 }}>
            Guided funnels, creatives, Meta readiness, and optimization in one operating system.
          </div>
        </div>
      </div>
    ),
    size,
  );
}
