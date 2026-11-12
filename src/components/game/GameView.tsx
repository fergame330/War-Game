"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CONTINENTS, CONTINENT_IDS, TERRITORIES, TERRITORY_IDS, cName, tName, territoriesOfContinent, type TerritoryId } from "@/lib/game/data";
import { Game, STAGE_NAMES, type Action, type ActionResult, type BattleResult, type GameState } from "@/lib/game/engine";
import { aiPromptFileName, buildAiPrompt, canBuildAiPrompt, type AiPromptContext } from "@/lib/game/aiPrompt";
import { dissolveDeadline, type RoomPlayerView } from "@/lib/online/types";
import { NumberPicker, Modal, ModalActions, ModalText, ModalTitle } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toasts";
import { WorldMap, type TerritoryVisual } from "./WorldMap";
import { CardsModal, OrderModal, RulesModal, TeamModal, TradeModal, WinnerModal, winnerText } from "./GameModals";
import { Chip, Swatch, formatClock } from "./bits";

export interface OnlineInfo {
  code: string;
  players: RoomPlayerView[];
  reconnectTimer: boolean;
  /** serverNow - Date.now() no momento em que o estado chegou */
  serverOffset: number;
}

interface GameViewProps {
  state: GameState;
  /** Assento do usuário (online) ou null no jogo local (quem estiver na vez joga). */
  me: number | null;
  act: (action: Action) => Promise<ActionResult>;
  online?: OnlineInfo;
  onExit: () => void;
  exitLabel?: string;
  showOrderOnStart?: boolean;
}

type ModalState =
  | { kind: "none" }
  | { kind: "order" }
  | { kind: "cards" }
  | { kind: "rules" }
  | { kind: "team" }
  | { kind: "occupy"; to: TerritoryId }
  | { kind: "move"; from: TerritoryId; to: TerritoryId }
  | { kind: "surrender" };

type Step = 1 | 5 | 10 | "all" | "remove";
type Tab = "turn" | "players" | "continents" | "log";

export function GameView({ state, me, act, online, onExit, exitLabel = "Sair", showOrderOnStart }: GameViewProps) {
  const toast = useToast();
  const g = useMemo(() => Game.load(state), [state]);
  const s = g.s;
  const cur = s.current;
  const player = cur >= 0 ? s.players[cur] : null;
  const isOver = s.stage === "over";
  const canAct = !isOver && cur >= 0 && (me === null || me === cur);
  const viewer = me ?? cur; // de quem são as cartas mostradas

  // seleção e rascunho "presos" ao turno: mudam de turno -> zeram sem precisar de efeito
  const turnKey = `${s.round}|${s.stage}|${cur}|${s.poolIndex}|${s.tradeCount}|${s.pools.length}|${s.tradeSub}`;
  const [sel, setSel] = useState<{ key: string; source: TerritoryId | null; target: TerritoryId | null; moveSource: TerritoryId | null }>({
    key: turnKey,
    source: null,
    target: null,
    moveSource: null,
  });
  const selection = sel.key === turnKey ? sel : { key: turnKey, source: null, target: null, moveSource: null };
  const setSelection = (patch: Partial<Omit<typeof sel, "key">>) => setSel({ ...selection, ...patch, key: turnKey });

  const [draftState, setDraftState] = useState<{ key: string; draft: Partial<Record<TerritoryId, number>> }>({ key: turnKey, draft: {} });
  const draft = useMemo(() => (canAct && draftState.key === turnKey ? draftState.draft : {}), [canAct, draftState, turnKey]);
  const setDraft = (d: Partial<Record<TerritoryId, number>>) => setDraftState({ key: turnKey, draft: d });

  const [step, setStep] = useState<Step>(1);
  const [showNames, setShowNames] = useState(true);
  const [tab, setTab] = useState<Tab>("turn");
  const [modal, setModal] = useState<ModalState>(showOrderOnStart ? { kind: "order" } : { kind: "none" });
  const [winnerDismissed, setWinnerDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [flashIds, setFlashIds] = useState<TerritoryId[]>([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!online) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [online]);

  // ---------- avisos: mudança de vez e eventos ----------
  const lastTurn = useRef<string | null>(null);
  const lastSeq = useRef<number | null>(null);
  useEffect(() => {
    const key = `${s.stage}|${cur}`;
    if (lastTurn.current !== null && lastTurn.current !== key && cur >= 0 && s.stage !== "over") {
      const p = s.players[cur];
      toast(`Vez de ${p.name}${me === cur ? " (você)" : ""} — ${stageLabel(g)}`, p.color);
    }
    lastTurn.current = key;
  }, [s.stage, cur, s.players, toast, me, g]);
  useEffect(() => {
    if (lastSeq.current !== null) {
      for (const e of s.events) {
        if (e.seq <= lastSeq.current) continue;
        if (e.kind === "conquest" && e.player === me && online) continue; // o próprio atacante já viu
        if (e.kind === "trade" && e.player === viewer) continue;
        toast(e.text, e.player !== null ? s.players[e.player].color : undefined, 3800);
      }
    }
    lastSeq.current = s.eventSeq;
  }, [s.eventSeq, s.events, s.players, toast, me, online, viewer]);

  // ---------- ações ----------
  const run = async (action: Action): Promise<ActionResult> => {
    setBusy(true);
    try {
      const r = await act(action);
      if (!r.ok && r.reason) toast(r.reason, player?.color, 4000);
      return r;
    } finally {
      setBusy(false);
    }
  };

  const flash = (ids: TerritoryId[]) => {
    setFlashIds(ids);
    setTimeout(() => setFlashIds([]), 700);
  };

  // ---------- colocação ----------
  const placing = canAct && g.isPlacing();
  const pool = g.pool;
  const draftTotal = Object.values(draft).reduce((a, b) => a + (b ?? 0), 0);
  const remaining = pool ? pool.amount - draftTotal : 0;

  const addDraft = (id: TerritoryId, n: number) => {
    const next = { ...draft, [id]: (draft[id] ?? 0) + n };
    if (!next[id]) delete next[id];
    setDraft(next);
  };

  const placeClick = (id: TerritoryId) => {
    if (step === "remove") {
      if (draft[id]) addDraft(id, -1);
      else toast("Só dá para tirar exércitos colocados agora.", player!.color);
      return;
    }
    if (!g.canPlaceOn(id)) {
      if (s.owner[id] !== cur) {
        toast(g.isAlly(cur, s.owner[id]) ? "Esse território é do seu aliado (use vassalagem para trocar territórios)." : "Esse território não é seu.", player!.color);
      } else toast(`Esses exércitos só podem ir para o continente ${cName(pool!.continent!)}.`, player!.color);
      return;
    }
    if (remaining <= 0) {
      toast("Todos os exércitos já foram colocados. Clique em Confirmar.", player!.color);
      return;
    }
    addDraft(id, step === "all" ? remaining : Math.min(step, remaining));
  };

  const confirmPlacement = async () => {
    const r = await run({ type: "place", placements: draft });
    if (r.ok) setDraft({});
  };

  // ---------- ataque ----------
  const attackSource = selection.source && g.canAttackFrom(selection.source) ? selection.source : null;
  const attackTarget = attackSource && selection.target && g.isEnemyTerritory(selection.target) && g.isNeighbor(attackSource, selection.target) ? selection.target : null;

  const attackClick = (id: TerritoryId) => {
    if (s.pending[id]) {
      setModal({ kind: "occupy", to: id });
      return;
    }
    if (s.owner[id] === cur) {
      if (attackSource === id) setSelection({ source: null, target: null });
      else if (g.canAttackFrom(id)) setSelection({ source: id, target: attackTarget && g.isNeighbor(id, attackTarget) ? attackTarget : null });
      else if (s.armies[id] < 2) toast("É preciso ter mais de 1 exército para atacar.", player!.color);
      else toast(`${tName(id)} não faz fronteira com nenhum inimigo.`, player!.color);
      return;
    }
    if (g.isAlly(cur, s.owner[id])) {
      toast(`${tName(id)} é do seu aliado ${s.players[s.owner[id]].name}: aliados não se atacam.`, player!.color);
      return;
    }
    if (attackSource && g.isNeighbor(attackSource, id)) {
      setSelection({ target: id });
      return;
    }
    // escolhe automaticamente o território vizinho mais forte como origem
    const options = TERRITORIES[id].neighbors.filter((n) => s.owner[n] === cur && g.canAttackFrom(n)).sort((a, b) => s.armies[b] - s.armies[a]);
    if (!options.length) {
      toast(`Você não tem território com mais de 1 exército vizinho a ${tName(id)}.`, player!.color);
      return;
    }
    setSelection({ source: options[0], target: id });
  };

  const doAttack = async (blitz: boolean) => {
    if (!attackSource || !attackTarget) return;
    const r = await run({ type: "attack", from: attackSource, to: attackTarget, blitz });
    if (r.ok && r.battle?.conquered) {
      flash([attackTarget]);
      setSelection({ source: attackSource, target: null });
      toast(`${player!.name} conquistou ${tName(attackTarget)}! Clique nele quando quiser enviar exércitos.`, player!.color, 3500);
    }
  };

  // ---------- passagem ----------
  const moveSource = selection.moveSource && g.moveTargets(selection.moveSource).length ? selection.moveSource : null;

  const moveClick = (id: TerritoryId) => {
    if (moveSource && moveSource !== id && g.maxMove(moveSource, id) > 0) {
      setModal({ kind: "move", from: moveSource, to: id });
      return;
    }
    if (s.owner[id] !== cur) {
      toast(
        g.isAlly(cur, s.owner[id])
          ? "Para enviar a um aliado, selecione antes um território seu vizinho (chega metade)."
          : "Só é possível passar exércitos entre seus territórios ou para aliados.",
        player!.color
      );
      return;
    }
    if (moveSource === id) setSelection({ moveSource: null });
    else if (g.moveTargets(id).length) setSelection({ moveSource: id });
    else {
      setSelection({ moveSource: null });
      toast(`Não há exércitos que possam sair de ${tName(id)}.`, player!.color);
    }
  };

  const onTerritoryClick = (id: TerritoryId) => {
    if (!canAct || modal.kind !== "none" || busy) return;
    setTab("turn");
    if (placing) return placeClick(id);
    if (s.stage === "attack") return attackClick(id);
    if (s.stage === "move") return moveClick(id);
  };

  const onTerritoryContext = (id: TerritoryId) => {
    if (placing && draft[id]) addDraft(id, -1);
    else setSelection({ source: null, target: null, moveSource: null });
  };

  // ---------- visual do mapa ----------
  const visuals = useMemo(() => {
    const out = {} as Record<TerritoryId, TerritoryVisual>;
    const aTargets = s.stage === "attack" && canAct && attackSource ? new Set(g.attackTargets(attackSource)) : null;
    const mTargets = s.stage === "move" && canAct && moveSource ? new Set(g.moveTargets(moveSource)) : null;
    for (const id of TERRITORY_IDS) {
      const o = s.owner[id];
      const pl = s.players[o];
      const cls: string[] = [];
      const bcls: string[] = [];
      if (placing) {
        cls.push(g.canPlaceOn(id) ? "placeable" : "dim");
        if (draft[id]) bcls.push("placed");
      } else if (s.stage === "attack") {
        if (s.pending[id]) {
          cls.push("pending");
          bcls.push("pending");
        }
        if (canAct) {
          if (attackSource === id) {
            cls.push("selected");
            bcls.push("selected");
          }
          if (attackTarget === id) {
            cls.push("target");
            bcls.push("target");
          }
          if (aTargets) {
            if (aTargets.has(id)) {
              if (attackTarget !== id) cls.push("target");
            } else if (attackSource !== id) cls.push("dim");
          }
        }
      } else if (s.stage === "move" && canAct) {
        if (moveSource === id) {
          cls.push("selected");
          bcls.push("selected");
        }
        if (mTargets) {
          if (mTargets.has(id)) cls.push("target");
          else if (moveSource !== id) cls.push("dim");
        } else if (o !== cur) cls.push("dim");
      }
      const v = s.vassalOf[id];
      out[id] = {
        fill: pl.color,
        classes: cls.join(" "),
        armies: s.armies[id] + (draft[id] ?? 0),
        badgeFill: pl.color,
        badgeText: pl.textColor,
        badgeClass: bcls.join(" "),
        ring: v !== undefined ? s.players[v].color : null,
      };
    }
    return out;
  }, [s, g, canAct, placing, draft, attackSource, attackTarget, moveSource, cur]);

  const tooltip = (id: TerritoryId): ReactNode => {
    const t = TERRITORIES[id];
    const o = s.owner[id];
    const v = s.vassalOf[id];
    return (
      <>
        <div className="text-[13px] font-bold">{t.name}</div>
        <div className="text-muted">{CONTINENTS[t.continent].name}</div>
        <div>
          <Swatch color={s.players[o].color} className="!size-3 align-middle" /> {s.players[o].name} · {s.armies[id]} exército(s)
        </div>
        {s.teamMode && <div className="text-muted">{g.teamName(s.players[o].team)}</div>}
        {v !== undefined && (
          <div>
            Vassalo — dono original: <Swatch color={s.players[v].color} className="!size-3 align-middle" /> {s.players[v].name}
          </div>
        )}
        {s.pending[id] && <div className="text-[#ffb4a8]">Conquistado — aguardando exércitos de {tName(s.pending[id]!)}</div>}
        {s.stage === "move" && o === cur && canAct && <div>Podem cruzar fronteira: {Math.max(0, Math.min(s.movable[id] ?? 0, s.armies[id] - 1))}</div>}
        <div className="text-muted">Fronteiras: {t.neighbors.map(tName).join(", ")}</div>
      </>
    );
  };

  // ---------- prompt para IA ----------
  const aiRow = canAct && canBuildAiPrompt(s) ? (
    <AiRow
      state={s}
      ctx={online ? { online: true, reconnectTimer: online.reconnectTimer } : {}}
      teamButton={s.teamMode ? () => setModal({ kind: "team" }) : undefined}
      onDone={(msg) => toast(msg, player?.color)}
    />
  ) : null;

  // ---------- online: desconexões e desistência ----------
  const serverNow = now + (online?.serverOffset ?? 0);
  const disconnected = online
    ? online.players
        .filter((p) => p.seat !== null && s.players[p.seat]?.alive && !p.online)
        .map((p) => ({ ...p, deadline: dissolveDeadline(p, serverNow) }))
    : [];
  const presenceOf = (seat: number) => online?.players.find((p) => p.seat === seat);

  const myTeam = me !== null ? s.players[me].team : null;
  const myVotes = myTeam !== null ? (s.surrenderVotes[myTeam] ?? []) : [];
  const iVoted = me !== null && myVotes.includes(me);

  const tradeOpen = canAct && s.stage === "trade" && s.tradeSub === "choose" && modal.kind === "none";
  const showWinner = isOver && !winnerDismissed && modal.kind === "none";

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      {/* barra superior */}
      <header className="flex items-center gap-3.5 border-b border-line bg-panel px-3.5 py-2 compact:gap-2 compact:px-2.5 compact:py-1.5">
        <div className="font-extrabold tracking-wider text-accent uppercase compact:hidden">Guerra Mundial</div>
        <div className="min-w-0 truncate text-muted compact:flex-1 compact:text-xs">
          {online && <span className="mr-2 font-mono font-bold text-ink">{online.code}</span>}
          Rodada {s.round} · {isOver ? "Fim de jogo" : stageLabel(g)}
        </div>
        {player && !isOver && <span className="flex-none compact:text-xs"><Chip player={player} /></span>}
        <div className="flex-1 compact:hidden" />
        <button className={`btn btn-sm btn-ghost portrait-compact:hidden ${showNames ? "btn-active" : ""}`} onClick={() => setShowNames((v) => !v)} title="Mostrar/ocultar nomes dos territórios">
          Nomes
        </button>
        {viewer >= 0 && (
          <button className="btn btn-sm btn-ghost" onClick={() => setModal({ kind: "cards" })}>
            Cartas ({s.players[viewer].cards.length})
          </button>
        )}
        <button className="btn btn-sm btn-ghost" onClick={() => setModal({ kind: "rules" })}>
          Regras
        </button>
        <button className="btn btn-sm btn-ghost" onClick={onExit}>
          {exitLabel}
        </button>
      </header>

      {disconnected.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-[#7a3b36] bg-[#3a1d1b] px-3.5 py-1.5 text-[13px]">
          {disconnected.map((p) => {
            const sp = s.players[p.seat!];
            return (
              <span key={p.userId} className="inline-flex items-center gap-1.5">
                <Swatch color={sp.color} className="!size-3" />
                <b>{sp.name}</b> desconectado
                {online!.reconnectTimer && p.deadline !== null ? (
                  <>
                    {" "}— volta em <b className="font-mono text-accent">{formatClock(p.deadline - serverNow)}</b> ou há dissolução
                  </>
                ) : (
                  " — aguardando"
                )}
              </span>
            );
          })}
        </div>
      )}

      <main className="flex min-h-0 flex-1 portrait-compact:flex-col">
        <WorldMap
          visuals={visuals}
          showNames={showNames}
          flashIds={flashIds}
          onTerritoryClick={onTerritoryClick}
          onTerritoryContext={onTerritoryContext}
          onBackgroundClick={() => setSelection({ source: null, target: null, moveSource: null })}
          tooltip={tooltip}
        />

        <aside className="flex w-[340px] flex-none flex-col gap-2.5 overflow-y-auto border-l border-line bg-panel p-2.5 compact:w-[270px] compact:gap-2 compact:p-2 portrait-compact:max-h-[44%] portrait-compact:w-full portrait-compact:border-t portrait-compact:border-l-0 portrait-compact:shadow-[0_-8px_24px_rgba(0,0,0,.35)]">
          <nav className="sticky -top-2 z-[2] -mx-2 -mt-2 hidden gap-1 bg-panel px-2 pt-2 compact:flex">
            {(
              [
                ["turn", "Turno"],
                ["players", "Jogadores"],
                ["continents", "Continentes"],
                ["log", "Histórico"],
              ] as [Tab, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`flex-1 cursor-pointer border-b-2 px-1 py-1.5 text-xs font-semibold ${tab === k ? "border-accent text-accent" : "border-transparent text-muted"}`}
              >
                {label}
              </button>
            ))}
          </nav>

          {/* turno */}
          <section
            className={`panel border-2 ${tab === "turn" ? "" : "compact:hidden"}`}
            style={{ borderColor: isOver ? s.players[s.winner!].color : player?.color }}
          >
            {isOver ? (
              <>
                <div className="text-xs font-bold tracking-wider text-accent uppercase">Fim de jogo</div>
                <div className="mt-1 flex items-center gap-2 text-base font-bold">
                  <Swatch color={s.players[s.winner!].color} className="!size-5" /> {winnerText(g)} dominou o mundo!
                </div>
                <div className="mt-2 flex gap-2 [&>.btn]:flex-1">
                  <button className="btn" onClick={onExit}>
                    {online ? "Voltar às salas" : "Nova partida"}
                  </button>
                </div>
              </>
            ) : player ? (
              <>
                <div className="text-xs font-bold tracking-wider text-accent uppercase">{stageLabel(g)}</div>
                <div className="mt-0.5 mb-1 flex items-center gap-2 text-base font-bold compact:text-[15px]">
                  <Swatch color={player.color} className="!size-5" />
                  {me === cur ? "Sua vez" : `Vez de ${player.name}`}
                </div>
                {aiRow}
                {!canAct ? (
                  <WaitingInfo g={g} />
                ) : placing ? (
                  <PlacementPanel
                    g={g}
                    remaining={remaining}
                    step={step}
                    setStep={setStep}
                    hasDraft={draftTotal > 0}
                    busy={busy}
                    onUndo={() => setDraft({})}
                    onConfirm={confirmPlacement}
                  />
                ) : s.stage === "attack" ? (
                  <AttackPanel
                    g={g}
                    source={attackSource}
                    target={attackTarget}
                    busy={busy}
                    onAttack={doAttack}
                    onOccupy={(to) => setModal({ kind: "occupy", to })}
                    onEnd={() => run({ type: "endAttack" })}
                  />
                ) : s.stage === "move" ? (
                  <MovePanel g={g} busy={busy} onEnd={() => run({ type: "endMove" })} />
                ) : s.stage === "trade" ? (
                  <p className="my-2 text-muted">Você tem cartas para trocar.</p>
                ) : null}
                {s.stage === "attack" && s.lastBattle && s.lastBattle.attacker === cur && (
                  <BattleBox battle={s.lastBattle} g={g} />
                )}
              </>
            ) : null}
          </section>

          {/* jogadores */}
          <section className={`panel ${tab === "players" ? "" : "compact:hidden"}`}>
            <h3 className="panel-title compact:hidden">Jogadores</h3>
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="text-[11px] text-muted [&>th]:px-0.5 [&>th]:py-1 [&>th]:text-left [&>th]:font-medium">
                  <th />
                  <th>Jogador</th>
                  <th className="!text-right">Terr.</th>
                  <th className="!text-right">Exérc.</th>
                  <th className="!text-right">Cartas</th>
                </tr>
              </thead>
              <tbody>
                {s.players.map((p) => {
                  const terrs = g.territoryCount(p.index);
                  const ctrl = g.territoriesOf(p.index).length;
                  const pres = presenceOf(p.index);
                  const deadline = pres && !pres.online ? dissolveDeadline(pres, serverNow) : null;
                  return (
                    <tr
                      key={p.index}
                      className={`[&>td]:px-0.5 [&>td]:py-1 ${p.index === cur && !isOver ? "bg-accent/10" : ""} ${p.alive ? "" : "line-through opacity-40"}`}
                    >
                      <td className="text-muted">{p.index + 1}º</td>
                      <td>
                        <span className="flex items-center gap-1.5">
                          <Swatch color={p.color} />
                          <span className="truncate">{p.name}</span>
                          {s.teamMode && <span className="team-tag">{"ABCDEFGHI"[p.team]}</span>}
                          {pres && p.alive && (
                            <span
                              className={`size-2 flex-none rounded-full ${pres.online ? "bg-ok" : "bg-danger"}`}
                              title={pres.online ? "Conectado" : "Desconectado"}
                            />
                          )}
                          {deadline !== null && p.alive && online?.reconnectTimer && (
                            <span className="font-mono text-[11px] text-accent">{formatClock(deadline - serverNow)}</span>
                          )}
                          {!p.alive && p.status !== "eliminated" && (
                            <span className="text-[10px] text-muted no-underline">({p.status === "dissolved" ? "dissolvido" : "desistiu"})</span>
                          )}
                        </span>
                      </td>
                      <td className="text-right" title={ctrl !== terrs ? `Controla ${ctrl} (vassalos contam para o dono original)` : undefined}>
                        {terrs}
                        {ctrl !== terrs ? "*" : ""}
                      </td>
                      <td className="text-right">{g.totalArmies(p.index)}</td>
                      <td className="text-right">{g.cardCount(p.index)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {online && me !== null && s.players[me].alive && !isOver && (
              <div className="mt-2 flex items-center gap-2 border-t border-line pt-2 text-[13px]">
                <span className="flex-1 text-muted">
                  {s.teamMode ? "Desistência da equipe" : "Desistência"}: {myVotes.length}/{g.surrenderThreshold(myTeam!)} votos
                </span>
                {iVoted ? (
                  <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => run({ type: "surrenderVote", vote: false })}>
                    Retirar voto
                  </button>
                ) : (
                  <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => setModal({ kind: "surrender" })}>
                    Desistir
                  </button>
                )}
              </div>
            )}
          </section>

          {/* continentes */}
          <section className={`panel ${tab === "continents" ? "" : "compact:hidden"}`}>
            <h3 className="panel-title compact:hidden">Continentes</h3>
            {CONTINENT_IDS.map((c) => {
              const owner = s.players.find((p) => p.alive && g.ownsContinent(p.index, c));
              return (
                <div key={c} className="flex items-center gap-1.5 py-0.5 text-[13px]">
                  <span className="size-2.5 flex-none rounded-sm" style={{ background: CONTINENTS[c].color }} />
                  <span className="flex-1">
                    {CONTINENTS[c].name} <span className="text-[11px] text-muted">({territoriesOfContinent(c).length})</span>
                  </span>
                  <span className="flex w-4 justify-center" title={owner ? `Dominado por ${owner.name}` : ""}>
                    {owner && <Swatch color={owner.color} className="!size-3" />}
                  </span>
                  <span className="w-6 text-right font-bold text-accent">+{CONTINENTS[c].bonus}</span>
                </div>
              );
            })}
          </section>

          {/* histórico */}
          <section className={`panel ${tab === "log" ? "" : "compact:hidden"}`}>
            <h3 className="panel-title compact:hidden">Histórico</h3>
            <div className="max-h-[220px] overflow-y-auto text-xs text-muted compact:max-h-none">
              {s.logs
                .slice()
                .reverse()
                .map((l, i) => (
                  <div key={s.logs.length - i} className="border-l-[3px] py-0.5 pl-2 leading-snug" style={{ borderLeftColor: l.player !== null ? s.players[l.player].color : "transparent" }}>
                    {l.text}
                  </div>
                ))}
            </div>
          </section>
        </aside>
      </main>

      {/* modais */}
      {modal.kind === "order" && <OrderModal g={g} onClose={() => setModal({ kind: "none" })} />}
      {modal.kind === "cards" && viewer >= 0 && <CardsModal g={g} viewer={viewer} onClose={() => setModal({ kind: "none" })} />}
      {modal.kind === "rules" && <RulesModal onClose={() => setModal({ kind: "none" })} />}
      {modal.kind === "team" && canAct && (
        <TeamModal g={g} act={run} excluded={Object.keys(draft) as TerritoryId[]} toast={toast} onClose={() => setModal({ kind: "none" })} />
      )}
      {modal.kind === "occupy" && canAct && s.pending[modal.to] && (
        <NumberPicker
          title={`Ocupar ${tName(modal.to)}`}
          text={
            <>
              Quantos exércitos enviar de <b className="text-ink">{tName(s.pending[modal.to]!)}</b> ({s.armies[s.pending[modal.to]!]} exércitos)? Máximo de 3 por território conquistado.
            </>
          }
          min={1}
          max={g.maxOccupy(modal.to)}
          confirmLabel="Enviar"
          onClose={() => setModal({ kind: "none" })}
          onConfirm={(n) => run({ type: "occupy", to: modal.to, n })}
        />
      )}
      {modal.kind === "move" && canAct && g.maxMove(modal.from, modal.to) > 0 && (
        <NumberPicker
          title={g.isAllyMove(modal.from, modal.to) ? "Enviar para aliado" : "Passar exércitos"}
          text={
            <>
              De <b className="text-ink">{tName(modal.from)}</b> para <b className="text-ink">{tName(modal.to)}</b>
              {g.isAllyMove(modal.from, modal.to)
                ? ` (${s.players[s.owner[modal.to]].name}). Chega só a metade dos exércitos enviados, arredondando para baixo.`
                : g.freeMove(modal.from, modal.to)
                  ? ". Movimento livre dentro do seu continente."
                  : "."}
            </>
          }
          min={g.isAllyMove(modal.from, modal.to) ? 2 : 1}
          max={g.maxMove(modal.from, modal.to)}
          confirmLabel={g.isAllyMove(modal.from, modal.to) ? "Enviar" : "Passar"}
          note={g.isAllyMove(modal.from, modal.to) ? (v) => `Saem ${v}, chegam ${Math.floor(v / 2)}.` : undefined}
          onClose={() => setModal({ kind: "none" })}
          onConfirm={async (n) => {
            const from = modal.from;
            const r = await run({ type: "move", from, to: modal.to, n });
            if (r.ok) setSelection({ moveSource: from });
          }}
        />
      )}
      {modal.kind === "surrender" && (
        <Modal onClose={() => setModal({ kind: "none" })}>
          <ModalTitle>Desistir?</ModalTitle>
          <ModalText>
            {s.teamMode
              ? `Quando ${g.surrenderThreshold(myTeam!)} jogador(es) da sua equipe votarem, a equipe desiste e os territórios e cartas vão para a equipe inimiga com menos territórios.`
              : "Seus territórios e cartas vão para o adversário com menos territórios."}{" "}
            Você pode retirar o voto enquanto a desistência não acontecer.
          </ModalText>
          <ModalActions>
            <button className="btn btn-ghost" onClick={() => setModal({ kind: "none" })}>
              Cancelar
            </button>
            <button
              className="btn btn-danger"
              onClick={async () => {
                setModal({ kind: "none" });
                await run({ type: "surrenderVote", vote: true });
              }}
            >
              Votar pela desistência
            </button>
          </ModalActions>
        </Modal>
      )}
      {tradeOpen && (
        <TradeModal
          key={turnKey}
          g={g}
          act={run}
          aiRow={aiRow}
          onTeam={s.teamMode ? () => setModal({ kind: "team" }) : undefined}
          onTraded={(r) => {
            if (r.trade?.bonuses.length) flash(r.trade.bonuses);
            toast(`${player!.name} recebeu ${r.trade?.value} exércitos pela troca.`, player!.color, 4000);
          }}
        />
      )}
      {showWinner && (
        <WinnerModal g={g} onClose={() => setWinnerDismissed(true)} onNewGame={onExit} newGameLabel={online ? "Voltar às salas" : "Nova partida"} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- partes do painel do turno

function stageLabel(g: Game): string {
  if (g.stage === "trade" && g.s.tradeSub === "place") return "Colocar exércitos da troca";
  return STAGE_NAMES[g.stage];
}

function Instructions({ children, hint }: { children: ReactNode; hint?: boolean }) {
  return <p className={`my-2 leading-snug text-muted compact:my-1.5 compact:text-[12.5px] [&_b]:text-ink ${hint ? "compact:hidden" : ""}`}>{children}</p>;
}

function Actions({ children }: { children: ReactNode }) {
  return (
    <div className="mt-2 flex flex-wrap gap-2 [&>.btn]:flex-1 compact:sticky compact:-bottom-2 compact:-mx-2.5 compact:-mb-2 compact:border-t compact:border-line compact:bg-panel-2 compact:px-2.5 compact:py-2">
      {children}
    </div>
  );
}

function WaitingInfo({ g }: { g: Game }) {
  const p = g.player;
  let what = "";
  if (g.isPlacing()) what = `colocando ${g.pool!.amount} exército(s) (${g.pool!.label})`;
  else if (g.stage === "attack") what = "atacando";
  else if (g.stage === "move") what = "passando exércitos";
  else if (g.stage === "trade") what = "trocando cartas";
  return (
    <Instructions>
      Aguardando <b>{p.name}</b>
      {what ? ` — ${what}` : ""}. As jogadas aparecem aqui em tempo real.
    </Instructions>
  );
}

interface PlacementPanelProps {
  g: Game;
  remaining: number;
  step: Step;
  setStep: (s: Step) => void;
  hasDraft: boolean;
  busy: boolean;
  onUndo: () => void;
  onConfirm: () => void;
}

function PlacementPanel({ g, remaining, step, setStep, hasDraft, busy, onUndo, onConfirm }: PlacementPanelProps) {
  const pool = g.pool!;
  const steps: [Step, string][] = [
    [1, "+1"],
    [5, "+5"],
    [10, "+10"],
    ["all", "Todos"],
    ["remove", "−1"],
  ];
  return (
    <>
      <Instructions>
        Coloque <b>{pool.amount}</b> {pool.amount === 1 ? "exército" : "exércitos"} ({pool.label}){" "}
        {pool.continent ? (
          <>
            somente no continente <b>{cName(pool.continent)}</b>
          </>
        ) : (
          "em qualquer território seu"
        )}
        .{g.s.pools.length > 1 ? ` Etapa ${g.s.poolIndex + 1} de ${g.s.pools.length}.` : ""}
      </Instructions>
      <div>
        <span className="text-3xl font-extrabold text-accent compact:text-2xl">{remaining}</span>{" "}
        <span className="text-muted">{remaining === 1 ? "restante" : "restantes"}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted">Por clique:</span>
        {steps.map(([k, label]) => (
          <button key={label} className={`btn btn-sm btn-ghost ${step === k ? "btn-active" : ""}`} onClick={() => setStep(k)}>
            {label}
          </button>
        ))}
      </div>
      <Instructions hint>Toque/clique em um território destacado para adicionar. Para tirar, use −1 (ou o botão direito do mouse).</Instructions>
      <Actions>
        <button className="btn btn-ghost" disabled={!hasDraft || busy} onClick={onUndo}>
          Desfazer
        </button>
        <button className="btn btn-ok" disabled={remaining !== 0 || busy} onClick={onConfirm}>
          Confirmar
        </button>
      </Actions>
    </>
  );
}

interface AttackPanelProps {
  g: Game;
  source: TerritoryId | null;
  target: TerritoryId | null;
  busy: boolean;
  onAttack: (blitz: boolean) => void;
  onOccupy: (to: TerritoryId) => void;
  onEnd: () => void;
}

function AttackPanel({ g, source, target, busy, onAttack, onOccupy, onEnd }: AttackPanelProps) {
  const s = g.s;
  const pendings = Object.entries(s.pending) as [TerritoryId, TerritoryId][];
  const chk = source && target ? g.checkAttack(source, target) : null;
  return (
    <>
      <Instructions hint>
        Selecione um território seu com mais de 1 exército e depois um inimigo vizinho. Clicar direto em um inimigo escolhe seu vizinho mais forte.
      </Instructions>
      {pendings.length > 0 && (
        <div className="my-1.5 text-[13px] leading-snug text-[#ffb4a8]">
          Conquistados aguardando exércitos:{" "}
          {pendings.map(([t, src], i) => (
            <span key={t}>
              {i ? ", " : ""}
              <button className="cursor-pointer underline" onClick={() => onOccupy(t)}>
                {tName(t)}
              </button>{" "}
              (de {tName(src)})
            </span>
          ))}
          . Clique neles para ocupar.
        </div>
      )}
      {source && (
        <div className="mt-2.5 rounded-lg bg-black/20 p-2">
          <div className="flex items-center justify-between gap-1.5 font-semibold">
            <span>
              <Swatch color={g.player.color} className="!size-3" /> {tName(source)} ({s.armies[source]})
            </span>
            <span className="text-xs text-muted">{target ? "ataca" : ""}</span>
            {target ? (
              <span>
                {tName(target)} ({s.armies[target]}) <Swatch color={s.players[s.owner[target]].color} className="!size-3" />
              </span>
            ) : (
              <span className="text-xs text-muted">escolha o alvo</span>
            )}
          </div>
          {chk?.attDice && (
            <div className="mt-1 text-xs text-muted">
              Dados: {chk.attDice} de ataque × {chk.defDice} de defesa
            </div>
          )}
          {chk && !chk.ok && <div className="my-1.5 text-[13px] text-[#ffb4a8]">{chk.reason}</div>}
          {target && (
            <div className="mt-2 flex gap-2 [&>.btn]:flex-1">
              <button className="btn btn-danger" disabled={!chk?.ok || busy} onClick={() => onAttack(false)}>
                Atacar
              </button>
              <button className="btn btn-ghost" disabled={!chk?.ok || busy} onClick={() => onAttack(true)}>
                Atacar até conquistar
              </button>
            </div>
          )}
        </div>
      )}
      <Actions>
        <button className="btn" disabled={pendings.length > 0 || busy} title={pendings.length ? "Ocupe primeiro os territórios conquistados" : ""} onClick={onEnd}>
          Encerrar ataques
        </button>
      </Actions>
    </>
  );
}

function BattleBox({ battle: r, g }: { battle: BattleResult; g: Game }) {
  const dice = (arr: number[], kind: "att" | "def", loser: "att" | "def") => (
    <div className="flex gap-1.5">
      {arr.map((v, i) => (
        <div
          key={`${r.rolls}-${i}-${v}-${kind}`}
          className={`die grid size-8 place-items-center rounded-[7px] text-lg font-extrabold shadow-[inset_0_-3px_0_rgba(0,0,0,.25)] compact:size-7 compact:text-base ${
            kind === "att" ? "bg-[#d83a34] text-white" : "bg-[#f2c94c] text-[#222]"
          } ${r.pairs[i] === loser ? "opacity-35" : ""}`}
        >
          {v}
        </div>
      ))}
    </div>
  );
  return (
    <div className="mt-2.5 rounded-lg bg-black/20 p-2">
      <div className="text-xs text-muted">
        {tName(r.from)} → {tName(r.to)} ({g.s.players[r.defender].name})
      </div>
      <div className="mt-2 grid grid-cols-[auto_1fr] items-center gap-x-2.5 gap-y-1.5">
        <span className="text-xs text-muted">Ataque</span>
        {dice(r.att, "att", "def")}
        <span className="text-xs text-muted">Defesa</span>
        {dice(r.def, "def", "att")}
      </div>
      <div className="mt-1.5 text-[13px]">
        {r.rolls > 1 && `${r.rolls} batalhas · `}
        <span className="text-[#ffa198]">Ataque perdeu {r.totalAttLoss}</span> · <span className="text-[#7ee787]">Defesa perdeu {r.totalDefLoss}</span>
        {r.conquered && <div className="text-[#7ee787]">{tName(r.to)} conquistado!</div>}
      </div>
    </div>
  );
}

function MovePanel({ g, busy, onEnd }: { g: Game; busy: boolean; onEnd: () => void }) {
  const owned = g.continentsOf(g.current).filter((c) => territoriesOfContinent(c).length > 1);
  return (
    <>
      <Instructions hint>
        Clique no território de origem e depois no destino (vizinho). Só os exércitos que já estavam no território no início da passagem podem cruzar uma fronteira, e sempre fica pelo menos 1.
      </Instructions>
      {g.s.teamMode && g.alliesOf(g.current).length > 0 && (
        <Instructions>Para um aliado: selecione seu território e clique no território vizinho do aliado (chega metade).</Instructions>
      )}
      {owned.length > 0 && (
        <Instructions>
          Movimento livre dentro de: <b>{owned.map(cName).join(", ")}</b>.
        </Instructions>
      )}
      {g.conqueredThisTurn && <Instructions>Você conquistou território nesta rodada: ganhará 1 carta quando todos terminarem a passagem.</Instructions>}
      <Actions>
        <button className="btn" disabled={busy} onClick={onEnd}>
          Encerrar passagem
        </button>
      </Actions>
    </>
  );
}

function AiRow({ state, ctx, teamButton, onDone }: { state: GameState; ctx: AiPromptContext; teamButton?: () => void; onDone: (msg: string) => void }) {
  const download = () => {
    const text = buildAiPrompt(state, ctx);
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = aiPromptFileName(state);
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    onDone("Prompt baixado. Envie para a IA e aplique a ação que ela responder.");
  };
  const copy = async () => {
    const text = buildAiPrompt(state, ctx);
    try {
      await navigator.clipboard.writeText(text);
      onDone("Prompt copiado.");
    } catch {
      onDone("Não foi possível copiar; use o botão de baixar.");
    }
  };
  return (
    <div className="mt-1.5 mb-0.5 flex gap-1.5">
      {teamButton && (
        <button className="btn btn-sm btn-ghost" onClick={teamButton} title="Vassalagem, retomar territórios e enviar cartas para aliados">
          👥 Equipe
        </button>
      )}
      <button className="btn btn-sm btn-ghost flex-1" onClick={download} title="Baixa um arquivo com as regras, o estado do jogo e a ação da vez para enviar a uma IA">
        🤖 Baixar prompt p/ IA
      </button>
      <button className="btn btn-sm btn-ghost" onClick={copy} title="Copiar o prompt">
        Copiar
      </button>
    </div>
  );
}
