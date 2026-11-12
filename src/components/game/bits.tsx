import type { Player } from "@/lib/game/engine";

export function Swatch({ color, className = "" }: { color: string; className?: string }) {
  return <span className={`swatch ${className}`} style={{ background: color }} />;
}

export function Chip({ player }: { player: Pick<Player, "color" | "name"> }) {
  return (
    <span className="chip">
      <Swatch color={player.color} />
      {player.name}
    </span>
  );
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
