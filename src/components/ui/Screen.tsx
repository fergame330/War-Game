import type { ReactNode } from "react";

/** Fundo das telas fora do jogo (início, configuração, salas). */
export function Screen({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[radial-gradient(ellipse_at_50%_30%,rgba(240,180,41,.12),transparent_60%),linear-gradient(160deg,#13263a,#0b131d)] p-4">
      {children}
    </div>
  );
}

export function Box({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className={`w-full rounded-[18px] border border-line bg-panel/85 px-12 py-10 text-center shadow-[0_20px_60px_rgba(0,0,0,.45)] compact:px-5 compact:py-7 ${wide ? "max-w-[620px]" : "max-w-[520px]"}`}>
      {children}
    </div>
  );
}

export function Title() {
  return (
    <h1 className="mb-2 text-[52px] font-black tracking-[2px] text-accent uppercase [text-shadow:0_3px_0_#7a5400] compact:text-4xl">
      Guerra Mundial
    </h1>
  );
}
