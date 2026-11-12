"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Game, MODES, cloneState, type Action, type ActionResult, type GameState, type ModeKey } from "@/lib/game/engine";
import { botAction, botDelay, fallbackAction, isBotTurn } from "@/lib/game/bot";
import { Box, Screen } from "@/components/ui/Screen";
import { GameView } from "./GameView";

/** Partida no mesmo aparelho: o motor roda no navegador, cada um joga na sua vez e os bots jogam sozinhos. */
export function LocalGame() {
  const [state, setState] = useState<GameState | null>(null);
  const [mode, setMode] = useState<ModeKey>("solo");
  const [count, setCount] = useState(0);
  const [bots, setBots] = useState(0);
  const [together, setTogether] = useState(true);
  /** Bots esperam enquanto uma janela (ordem, regras, cartas...) está aberta. */
  const [paused, setPaused] = useState(false);

  // vez de um bot: calcula a jogada e aplica depois de uma pausa, para dar para acompanhar
  useEffect(() => {
    if (!state || paused) return;
    const g = Game.load(cloneState(state));
    if (!isBotTurn(g)) return;
    const action = botAction(g);
    const humansAlive = state.players.some((p) => p.alive && !p.bot);
    const timer = setTimeout(
      () => {
        const me = g.current;
        if (!g.apply(action, me).ok) g.apply(fallbackAction(g), me);
        setState(g.toState());
      },
      humansAlive ? botDelay(action) : 80
    );
    return () => clearTimeout(timer);
  }, [state, paused]);

  if (!state) {
    const m = MODES[mode];
    const teamMode = m.teamSize > 1;
    const humans = count - bots;
    const start = () => {
      // humanos primeiro; com "juntos", eles preenchem as primeiras equipes
      const flags = Array.from({ length: count }, (_, i) => i >= humans);
      const teams = teamMode && together && bots > 0 && humans > 1 ? flags.map((_, i) => Math.floor(i / m.teamSize)) : undefined;
      setPaused(true); // a janela da ordem abre primeiro
      setState(Game.create(count, { mode, bots: flags, teams }).toState());
    };
    return (
      <Screen>
        <Box>
          <Title>Modo de jogo</Title>
          <div className="flex flex-wrap justify-center gap-2">
            {(Object.keys(MODES) as ModeKey[]).map((k) => (
              <button
                key={k}
                onClick={() => {
                  setMode(k);
                  if (!MODES[k].counts.includes(count)) {
                    setCount(0);
                    setBots(0);
                  }
                }}
                className={`cursor-pointer rounded-[10px] border-2 px-4 py-2.5 font-bold ${k === mode ? "border-accent bg-accent text-[#1b1300]" : "border-line bg-panel-2 hover:border-accent"}`}
              >
                {MODES[k].name}
              </button>
            ))}
          </div>
          <Title className="mt-6">Quantos jogadores?</Title>
          <div className="flex flex-wrap justify-center gap-2.5">
            {m.counts.map((n) => (
              <Choice
                key={n}
                active={n === count}
                onClick={() => {
                  setCount(n);
                  setBots((b) => Math.min(b, n - 1));
                }}
              >
                {n}
                {teamMode && <small className="mt-0.5 text-[11px] font-semibold opacity-75">{`${n / m.teamSize} × ${m.teamSize}`}</small>}
              </Choice>
            ))}
          </div>
          {count > 0 && (
            <>
              <Title className="mt-6">Quantos são bots?</Title>
              <div className="flex flex-wrap justify-center gap-2">
                {Array.from({ length: count }, (_, b) => (
                  <Choice key={b} small active={b === bots} onClick={() => setBots(b)}>
                    {b}
                  </Choice>
                ))}
              </div>
              <p className="mt-2 text-[13px] text-muted">
                {humans} {humans === 1 ? "humano" : "humanos"} e {bots} {bots === 1 ? "bot" : "bots"}.{" "}
                {bots > 0 && "Os bots jogam sozinhos: dominam continentes, reforçam fronteiras e caçam cartas."}
              </p>
              {teamMode && bots > 0 && humans > 1 && (
                <div className="mt-3 inline-flex rounded-lg border border-line p-0.5 text-[13px]">
                  {(
                    [
                      [true, "Humanos na mesma equipe"],
                      [false, "Equipes aleatórias"],
                    ] as const
                  ).map(([v, label]) => (
                    <button
                      key={label}
                      onClick={() => setTogether(v)}
                      className={`cursor-pointer rounded-md px-3 py-1 font-semibold ${together === v ? "bg-accent text-[#1b1300]" : "text-muted"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          <p className="mx-auto mt-3.5 min-h-[2.8em] max-w-[380px] leading-snug text-muted">
            {teamMode
              ? `Equipes de ${m.teamSize} jogadores. Aliados não se atacam, podem trocar exércitos, cartas e territórios (vassalagem).`
              : "Cada um por si."}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <Link href="/" className="btn btn-ghost">
              Voltar
            </Link>
            <button className="btn btn-big" disabled={!count} onClick={start}>
              Iniciar partida
            </button>
          </div>
        </Box>
      </Screen>
    );
  }

  const act = async (action: Action): Promise<ActionResult> => {
    const g = Game.load(cloneState(state));
    if (isBotTurn(g)) return { ok: false, reason: "É a vez de um bot." };
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
      onModalChange={setPaused}
      exitLabel="Sair"
      onExit={() => {
        if (state.stage === "over" || window.confirm("Sair da partida? Ela não fica salva.")) {
          setState(null);
          setCount(0);
          setBots(0);
          setPaused(false);
        }
      }}
    />
  );
}

function Title({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <h2 className={`mb-3 text-2xl font-bold ${className}`}>{children}</h2>;
}

function Choice({ active, small, onClick, children }: { active: boolean; small?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 leading-none font-bold ${small ? "size-12 text-xl" : "size-16 text-2xl"} ${active ? "border-accent bg-accent text-[#1b1300]" : "border-line bg-panel-2 hover:border-accent"}`}
    >
      {children}
    </button>
  );
}
