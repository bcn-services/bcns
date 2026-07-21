/**
 * Branded signature motif — a slow-orbiting node cluster that echoes the bcns
 * atomic mark (connections + systems). The software-studio answer to L2's
 * rotating seal. Pure CSS animation (no JS); respects prefers-reduced-motion via
 * the global reduce-motion rule. Size/speed are easy to tune here.
 */

function Node({ className }: { className: string }) {
  return (
    <span
      className={`absolute size-2.5 rounded-full bg-primary shadow-[0_0_12px_hsl(var(--primary)/0.7)] ${className}`}
    />
  );
}

export function SignatureMotif() {
  return (
    <div aria-hidden className="relative size-40">
      {/* faint concentric rings */}
      <div className="absolute inset-0 rounded-full border border-primary/15" />
      <div className="absolute inset-[18%] rounded-full border border-primary/20" />
      <div className="absolute inset-[36%] rounded-full border border-primary/25" />

      {/* outer orbit — 3 nodes, clockwise */}
      <div className="absolute inset-0 animate-[spin_18s_linear_infinite]">
        <Node className="left-1/2 top-0 -translate-x-1/2" />
        <Node className="bottom-[8%] left-[12%]" />
        <Node className="bottom-[8%] right-[12%]" />
      </div>

      {/* inner orbit — 2 nodes, counter-clockwise, faster */}
      <div className="absolute inset-[18%] animate-[spin_11s_linear_infinite_reverse]">
        <Node className="left-1/2 top-0 size-2 -translate-x-1/2" />
        <Node className="bottom-0 left-1/2 size-2 -translate-x-1/2" />
      </div>

      {/* core */}
      <span className="absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_18px_hsl(var(--primary)/0.8)]" />
      <span className="absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full bg-primary/40" />
    </div>
  );
}
