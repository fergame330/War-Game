"use client";

import { useState } from "react";
import Link from "next/link";
import { Game, MODES, cloneState, type Action, type ActionResult, type GameState, type ModeKey } from "@/lib/game/engine";
import { Box, Screen } from "@/components/ui/Screen";
import { GameView } from "./GameView";

/** Partida no mesmo aparelho: o motor roda no navegador e cada um joga na sua vez. */
export function LocalGame() {
  const [state, setState] = useState<GameState | null>(null);
  const [mode, setMode] = useState<ModeKey>("solo");
  const [count, setCount] = useState(0);

  if (!state) {
    const m = MODES[mode];
    return (
      <Screen>
        <Box>
          <h2 className="mb-3 text-2xl font-bold">Modo de jogo</h2>
          <div className="flex flex-wrap justify-center gap-2">
            {(Object.keys(MODES) as ModeKey[]).map((k) => (
              <button
                key={k}
                onClick={() => {
                  setMode(k);
                  if (!MODES[k].counts.includes(count)) setCount(0);
                }}
                className={`cursor-pointer rounded-[10px] border-2 px-4 py-2.5 font-bold ${k === mode ? "border-accent bg-accent text-[#1b1300]" : "border-line bg-panel-2 hover:border-accent"}`}
              >
                {MODES[k].name}
              </button>
            ))}
          </div>
          <h2 className="mt-6 mb-3 text-2xl font-bold">Quantos jogadores?</h2>
          <div className="flex flex-wrap justify-center gap-2.5">
            {m.counts.map((n) => (
              <button
                key={n}
                onClick={() => setCount(n)}
                className={`flex size-16 cursor-pointer flex-col items-center justify-center rounded-xl border-2 text-2xl leading-none font-bold ${n === count ? "border-accent bg-accent text-[#1b1300]" : "border-line bg-panel-2 hover:border-accent"}`}
              >
                {n}
                {m.teamSize > 1 && <small className="mt-0.5 text-[11px] font-semibold opacity-75">{`${n / m.teamSize} × ${m.teamSize}`}</small>}
              </button>
            ))}
          </div>
          <p className="mx-auto mt-3.5 min-h-[2.8em] max-w-[380px] leading-snug text-muted">
            {m.teamSize > 1
              ? `Equipes de ${m.teamSize} jogadores. Aliados não se atacam, podem trocar exércitos, cartas e territórios (vassalagem).`
              : "Cada um por si."}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/" className="btn btn-ghost">
              Voltar
            </Link>
            <button className="btn btn-big" disabled={!count} onClick={() => setState(Game.create(count, { mode }).toState())}>
              Iniciar partida
            </button>
          </div>
        </Box>
      </Screen>
    );
  }

  const act = async (action: Action): Promise<ActionResult> => {
    const g = Game.load(cloneState(state));
    const r = g.apply(action, g.current);
    if (r.ok) setState(g.toState());
    return r;
  };

  return (
    <GameView
      state={state}
      me={null}
      act={act}
      showOrderOnStart
      exitLabel="Sair"
      onExit={() => {
        if (state.stage === "over" || window.confirm("Sair da partida? Ela não fica salva.")) {
          setState(null);
          setCount(0);
        }
      }}
    />
  );
}
