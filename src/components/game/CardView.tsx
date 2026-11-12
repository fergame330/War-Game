"use client";

import { CONTINENTS, TERRITORIES } from "@/lib/game/data";
import { SHAPE_NAMES, type Card, type Shape } from "@/lib/game/engine";

const SHAPE_COLORS: Record<Exclude<Shape, "coringa">, string> = {
  circulo: "#2e6fd8",
  quadrado: "#27ae60",
  triangulo: "#d63031",
  estrela: "#e0a100",
};

function ShapeGlyph({ shape }: { shape: Exclude<Shape, "coringa"> }) {
  const c = SHAPE_COLORS[shape];
  switch (shape) {
    case "circulo":
      return <circle cx="50" cy="50" r="36" fill={c} />;
    case "quadrado":
      return <rect x="16" y="16" width="68" height="68" rx="4" fill={c} />;
    case "triangulo":
      return <polygon points="50,12 90,84 10,84" fill={c} />;
    case "estrela":
      return <polygon points="50,8 61,38 93,38 67,57 77,89 50,70 23,89 33,57 7,38 39,38" fill={c} />;
  }
}

export function ShapeIcon({ shape, size = 56 }: { shape: Shape; size?: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden>
      {shape === "coringa" ? (
        <>
          <g transform="translate(4,4) scale(.44)"><ShapeGlyph shape="circulo" /></g>
          <g transform="translate(52,4) scale(.44)"><ShapeGlyph shape="quadrado" /></g>
          <g transform="translate(4,52) scale(.44)"><ShapeGlyph shape="triangulo" /></g>
          <g transform="translate(52,52) scale(.44)"><ShapeGlyph shape="estrela" /></g>
        </>
      ) : (
        <ShapeGlyph shape={shape} />
      )}
    </svg>
  );
}

interface CardViewProps {
  card: Card;
  owned?: boolean;
  selected?: boolean;
  onClick?: () => void;
}

export function CardView({ card, owned, selected, onClick }: CardViewProps) {
  const t = TERRITORIES[card.territory];
  return (
    <div
      onClick={onClick}
      className={`relative flex min-h-[150px] flex-col items-center gap-1.5 rounded-[10px] border-[3px] bg-gradient-to-b from-[#f8f4e8] to-[#e9e1cb] p-2 text-[#222] shadow-[0_4px_10px_rgba(0,0,0,.35)] select-none compact:min-h-[128px] ${
        onClick ? "cursor-pointer hover:-translate-y-0.5" : ""
      } ${selected ? "border-accent ring-[3px] ring-accent/45" : "border-transparent"}`}
    >
      <div className="h-1.5 self-stretch rounded" style={{ background: CONTINENTS[t.continent].color }} />
      <div className="grid size-[60px] place-items-center compact:size-12">
        <ShapeIcon shape={card.shape} size={56} />
      </div>
      <div className="text-[11px] font-bold tracking-wider text-[#6b5a33] uppercase">{SHAPE_NAMES[card.shape]}</div>
      <div className="text-center text-[13px] font-bold">{t.name}</div>
      {owned && (
        <div className="absolute top-3.5 right-2 rounded-md bg-ok px-1.5 py-px text-[10px] font-bold text-white" title="Território seu: +3 exércitos nele na troca">
          SEU
        </div>
      )}
    </div>
  );
}

export function CardsGrid({ children }: { children: React.ReactNode }) {
  return <div className="my-3 grid grid-cols-[repeat(auto-fill,minmax(118px,1fr))] gap-2.5 compact:grid-cols-[repeat(auto-fill,minmax(96px,1fr))]">{children}</div>;
}
