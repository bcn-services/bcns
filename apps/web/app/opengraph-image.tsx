import { ImageResponse } from "next/og";
import { siteConfig } from "@/lib/site";

// Satori can't read the site's woff2 faces, so this uses next/og's built-in font.
// ponytail: built-in font; commit TTF copies of app/fonts/* if the card should match the site type.
export const alt = `${siteConfig.name} — ${siteConfig.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Colors are the light-theme tokens in globals.css (--background, --foreground, --primary).
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          background: "#FBFCFE",
          color: "#2f3440",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: "#4a86d7" }} />
          <div style={{ fontSize: 44, fontWeight: 700 }}>{siteConfig.name}</div>
        </div>
        <div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.1, maxWidth: 980 }}>
          {siteConfig.tagline}
        </div>
        <div style={{ fontSize: 30, color: "#4a86d7" }}>{siteConfig.domain}</div>
      </div>
    ),
    size,
  );
}
