/**
 * Presentational-only page atmosphere. Each page gets its OWN pattern geometry
 * (not the same grid everywhere) plus a pastel-blue radial glow, so every tab
 * reads as distinct while staying in the brand's charcoal + hairline + blue
 * language. Drop it as the first child of a `relative overflow-hidden` section.
 */

type AtmosphereVariant = "services" | "about" | "pricing" | "work";

// Distinct background geometry per tab — dots, diagonals, rings, crosshatch.
const patternByVariant: Record<AtmosphereVariant, string> = {
  // dot matrix — soft, less rigid than a line grid
  services:
    "bg-[radial-gradient(hsl(var(--primary)/0.35)_1.3px,transparent_1.9px)] bg-[size:20px_20px]",
  // diagonal hairlines — editorial
  about:
    "bg-[repeating-linear-gradient(-45deg,hsl(var(--border)/0.5)_0px,hsl(var(--border)/0.5)_1px,transparent_1px,transparent_15px)]",
  // concentric rings emanating from the top — premium
  pricing:
    "bg-[repeating-radial-gradient(circle_at_50%_-8%,transparent_0,transparent_47px,hsl(var(--border)/0.45)_47px,hsl(var(--border)/0.45)_48px)]",
  // crosshatch — technical / blueprint
  work:
    "bg-[repeating-linear-gradient(45deg,hsl(var(--border)/0.35)_0_1px,transparent_1px_22px),repeating-linear-gradient(-45deg,hsl(var(--border)/0.35)_0_1px,transparent_1px_22px)]",
};

// Each variant also places the glow differently.
const glowByVariant: Record<AtmosphereVariant, readonly string[]> = {
  services: [
    "bg-[radial-gradient(55%_45%_at_12%_0%,hsl(var(--primary)/0.20),transparent_65%)]",
  ],
  about: [
    "bg-[radial-gradient(52%_45%_at_88%_0%,hsl(var(--primary)/0.18),transparent_65%)]",
  ],
  pricing: [
    "bg-[radial-gradient(60%_50%_at_50%_0%,hsl(var(--primary)/0.16),transparent_70%)]",
  ],
  work: [
    "bg-[radial-gradient(45%_40%_at_22%_4%,hsl(var(--primary)/0.18),transparent_60%)]",
    "bg-[radial-gradient(38%_36%_at_82%_16%,hsl(var(--primary)/0.10),transparent_60%)]",
  ],
};

export function SectionAtmosphere({ variant }: { variant: AtmosphereVariant }) {
  return (
    <>
      {glowByVariant[variant].map((glow, i) => (
        <div
          key={`glow-${i}`}
          aria-hidden
          className={`pointer-events-none absolute inset-0 -z-10 ${glow}`}
        />
      ))}
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 -z-10 [mask-image:linear-gradient(to_bottom,black,transparent_80%)] ${patternByVariant[variant]}`}
      />
    </>
  );
}
