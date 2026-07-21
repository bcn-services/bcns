/**
 * Presentational-only page atmosphere: the brand's faint 44px grid + a
 * pastel-blue radial glow, mirroring the hero. Each page passes a distinct
 * `variant` so every tab gets a unique-but-cohesive background. Drop it as the
 * first child of a `relative overflow-hidden` section.
 */

type AtmosphereVariant = "services" | "about" | "pricing" | "work";

// Each variant places the glow differently so no two tabs read the same.
const glowLayers: Record<AtmosphereVariant, readonly string[]> = {
  // top-left anchor
  services: [
    "bg-[radial-gradient(55%_45%_at_12%_0%,hsl(var(--primary)/0.20),transparent_65%)]",
  ],
  // top-right anchor
  about: [
    "bg-[radial-gradient(52%_45%_at_88%_0%,hsl(var(--primary)/0.18),transparent_65%)]",
  ],
  // soft top-center
  pricing: [
    "bg-[radial-gradient(60%_50%_at_50%_0%,hsl(var(--primary)/0.16),transparent_70%)]",
  ],
  // two-point spread, left + right
  work: [
    "bg-[radial-gradient(45%_40%_at_22%_4%,hsl(var(--primary)/0.18),transparent_60%)]",
    "bg-[radial-gradient(38%_36%_at_82%_16%,hsl(var(--primary)/0.10),transparent_60%)]",
  ],
} as const;

export function SectionAtmosphere({ variant }: { variant: AtmosphereVariant }) {
  return (
    <>
      {glowLayers[variant].map((glow, i) => (
        <div
          key={i}
          aria-hidden
          className={`pointer-events-none absolute inset-0 -z-10 ${glow}`}
        />
      ))}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 [mask-image:linear-gradient(to_bottom,black,transparent_80%)] bg-[linear-gradient(to_right,hsl(var(--border)/0.6)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.6)_1px,transparent_1px)] bg-[size:44px_44px]"
      />
    </>
  );
}
