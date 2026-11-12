"use client";

import { useState } from "react";
import { CONTINENTS, CONTINENT_IDS, tName, territoriesOfContinent, type TerritoryId } from "@/lib/game/data";
import { Game, isValidSet, SHAPE_NAMES, type Action, type ActionResult } from "@/lib/game/engine";
import { Modal, ModalActions, ModalText, ModalTitle } from "@/components/ui/Modal";
import { CardsGrid, CardView } from "./CardView";
import { Chip, Swatch } from "./bits";

// ---------------------------------------------------------------- ordem sorteada
export function OrderModal({ g, onClose }: { g: Game; onClose: () => void }) {
  return (
    <Modal onClose={onClose}>
      <ModalTitle>Cores e ordem sorteadas</ModalTitle>
      <ModalText>
        Os territórios foram divididos entre os jogadores e cada um recebeu 1 exército. Quem começou com um continente
        inteiro coloca primeiro o bônus desse continente.
        {g.s.teamMode && " A ordem alterna as equipes: ninguém da mesma equipe joga em seguida."}
      </ModalText>
      <ol className="my-3 grid gap-1.5">
        {g.s.players.map((p) => (
          <li key={p.index} className="flex items-center gap-2.5 rounded-lg bg-panel-2 px-2.5 py-2">
            <span className="w-6 font-bold text-muted">{p.index + 1}º</span>
            <Swatch color={p.color} />
            <b>{p.name}</b>
            {g.s.teamMode && <span className="team-tag">{g.teamName(p.team)}</span>}
            <span className="ml-auto text-xs text-muted">{g.territoriesOf(p.index).length} territórios</span>
          </li>
        ))}
      </ol>
      <ModalActions>
        <button className="btn" onClick={onClose} autoFocus>
          Começar
        </button>
      </ModalActions>
    </Modal>
  );
}

// ---------------------------------------------------------------- cartas (só ver)
export function CardsModal({ g, viewer, onClose }: { g: Game; viewer: number; onClose: () => void }) {
  const cards = g.s.players[viewer].cards;
  return (
    <Modal onClose={onClose} wide>
      <ModalTitle>
        Cartas de <Chip player={g.s.players[viewer]} />
      </ModalTitle>
      {cards.length ? (
        <CardsGrid>
          {cards.map((c) => (
            <CardView key={c.id} card={c} owned={g.s.owner[c.territory] === viewer} />
          ))}
        </CardsGrid>
      ) : (
        <p className="text-muted italic">Nenhuma carta ainda. Conquiste pelo menos 1 território na rodada para ganhar uma carta.</p>
      )}
      <ModalText>
        Junte 4 cartas do mesmo naipe (o coringa vale por qualquer naipe) para trocar na fase de trocas. Próxima troca vale{" "}
        {g.nextTradeValue} exércitos.
      </ModalText>
      <ModalActions>
        <button className="btn" onClick={onClose}>
          Fechar
        </button>
      </ModalActions>
    </Modal>
  );
}

// ---------------------------------------------------------------- troca
interface TradeModalProps {
  g: Game;
  act: (a: Action) => Promise<ActionResult>;
  onTeam?: () => void;
  aiRow?: React.ReactNode;
  onTraded: (r: ActionResult) => void;
}

export function TradeModal({ g, act, onTeam, aiRow, onTraded }: TradeModalProps) {
  const p = g.current;
  const cards = g.s.players[p].cards;
  const [selected, setSelected] = useState<string[]>([]);
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);
  const chosen = cards.filter((c) => selected.includes(c.id));
  const valid = chosen.length === 4 && isValidSet(chosen);

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < 4 ? [...s, id] : s));

  return (
    <Modal wide dismissable={false}>
      <ModalTitle>
        Troca de cartas — <Chip player={g.player} />
      </ModalTitle>
      {aiRow}
      <div className="flex flex-wrap items-center gap-3.5">
        <div>
          Esta troca vale <span className="text-2xl font-extrabold text-accent">{g.nextTradeValue}</span> exércitos
        </div>
        <div className="text-muted">Trocas já feitas: {g.s.tradeCount}</div>
      </div>
      <ModalText>
        Selecione 4 cartas do mesmo naipe (coringa vale por qualquer naipe). Cada carta com um território seu dá +3 exércitos
        nesse território.
      </ModalText>
      <CardsGrid>
        {cards.map((c) => (
          <CardView key={c.id} card={c} owned={g.s.owner[c.territory] === p} selected={selected.includes(c.id)} onClick={() => toggle(c.id)} />
        ))}
      </CardsGrid>
      <div className="min-h-5 text-[13px] text-[#ffb4a8]">
        {hint || (chosen.length === 4 && !valid ? "Essas 4 cartas não formam uma troca válida." : "")}
      </div>
      <ModalActions>
        <button className="btn btn-ghost" disabled={busy} onClick={() => act({ type: "skipTrade" })}>
          Não trocar
        </button>
        {onTeam && (
          <button className="btn btn-ghost" onClick={onTeam}>
            👥 Equipe
          </button>
        )}
        <button className="btn btn-ghost" onClick={() => setSelected(g.findSet(p)?.map((c) => c.id) ?? [])}>
          Sugerir
        </button>
        <button
          className="btn btn-ok"
          disabled={!valid || busy}
          onClick={async () => {
            setBusy(true);
            const r = await act({ type: "trade", cardIds: selected });
            setBusy(false);
            if (!r.ok) setHint(r.reason ?? "Não foi possível trocar.");
            else onTraded(r);
          }}
        >
          Trocar
        </button>
      </ModalActions>
    </Modal>
  );
}

// ---------------------------------------------------------------- equipe
interface TeamModalProps {
  g: Game;
  act: (a: Action) => Promise<ActionResult>;
  excluded: TerritoryId[];
  toast: (text: string, color?: string, ms?: number) => void;
  onClose: () => void;
}

export function TeamModal({ g, act, excluded, toast, onClose }: TeamModalProps) {
  const me = g.current;
  const allies = g.alliesOf(me);
  const color = g.player.color;
  const vassalStage = g.isPlacing() || g.stage === "move";
  const cands = g.vassalCandidates().filter((id) => !excluded.includes(id));
  const [vTerr, setVTerr] = useState<string>("");
  const [vAlly, setVAlly] = useState<string>("");
  const [cardSel, setCardSel] = useState<string | null>(null);
  const [cAlly, setCAlly] = useState<string>("");
  const terrValue = cands.includes(vTerr as TerritoryId) ? vTerr : (cands[0] ?? "");
  const allyValue = allies.includes(Number(vAlly)) ? vAlly : String(allies[0] ?? "");
  const cAllyValue = allies.includes(Number(cAlly)) ? cAlly : String(allies[0] ?? "");
  const cards = g.s.players[me].cards;
  const canSend = g.canSendCard().ok;

  const run = async (a: Action, okText: string | ((r: ActionResult) => string)) => {
    const r = await act(a);
    if (!r.ok) toast(r.reason ?? "Ação inválida.", color, 4000);
    else toast(typeof okText === "function" ? okText(r) : okText, color, 4000);
    return r;
  };

  return (
    <Modal wide onClose={onClose}>
      <ModalTitle>
        {g.teamName(g.player.team)} — <Chip player={g.player} />
      </ModalTitle>
      <p className="text-muted">
        Aliados:{" "}
        {allies.length
          ? allies.map((a, i) => (
              <span key={a}>
                {i ? ", " : ""}
                <Swatch color={g.s.players[a].color} /> {g.s.players[a].name}
              </span>
            ))
          : "nenhum aliado vivo"}
      </p>

      <Section title="Vassalagem">
        {!vassalStage ? (
          <p>Disponível só durante a passagem ou a colocação de exércitos.</p>
        ) : !allies.length ? (
          <p>Sem aliados vivos.</p>
        ) : !cands.length ? (
          <p>Nenhum território pode ser cedido agora (é preciso manter pelo menos 1 território próprio).</p>
        ) : (
          <>
            <p>
              O território passa a ser controlado pelo aliado e perde metade dos exércitos (fica a metade arredondada para cima).
              Continua contando como seu no bônus de territórios.
            </p>
            <div className="my-1.5 flex flex-wrap items-center gap-2">
              <select className="input w-auto" value={terrValue} onChange={(e) => setVTerr(e.target.value)} aria-label="Território">
                {cands.map((id) => (
                  <option key={id} value={id}>
                    {tName(id)} ({g.s.armies[id]} → fica {Math.ceil(g.s.armies[id] / 2)})
                  </option>
                ))}
              </select>
              <span>para</span>
              <select className="input w-auto" value={allyValue} onChange={(e) => setVAlly(e.target.value)} aria-label="Aliado">
                {allies.map((a) => (
                  <option key={a} value={a}>
                    {g.s.players[a].name}
                  </option>
                ))}
              </select>
              <button
                className="btn btn-sm"
                onClick={() =>
                  run({ type: "vassal", territory: terrValue as TerritoryId, ally: Number(allyValue) }, `${tName(terrValue)} agora é vassalo de ${g.s.players[Number(allyValue)].name}.`)
                }
              >
                Declarar vassalagem
              </button>
            </div>
          </>
        )}
      </Section>

      <Section title="Seus territórios vassalos">
        {!g.myVassals().length && <p>Nenhum.</p>}
        {g.myVassals().map((id) => {
          const chk = g.canUnvassal(id);
          const holder = g.s.players[g.s.owner[id]];
          return (
            <div key={id} className="my-1.5 flex flex-wrap items-center gap-2">
              <span className="min-w-[150px] flex-1">
                {tName(id)} — com <Swatch color={holder.color} /> {holder.name} ({g.s.armies[id]})
              </span>
              <button
                className="btn btn-sm btn-ghost"
                disabled={!chk.ok}
                title={chk.ok ? "Retoma o território (sem recuperar os exércitos perdidos)" : chk.reason}
                onClick={() => run({ type: "unvassal", territory: id }, `Você retomou ${tName(id)}.`)}
              >
                Retomar
              </button>
            </div>
          );
        })}
      </Section>

      <Section title="Enviar carta para aliado">
        {!allies.length ? (
          <p>Sem aliados vivos.</p>
        ) : !canSend ? (
          <p>É preciso ter pelo menos 2 cartas: ao enviar uma, outra carta aleatória da sua mão é descartada.</p>
        ) : (
          <>
            <p>Escolha a carta. Ao enviar, outra carta aleatória da sua mão é descartada.</p>
            <CardsGrid>
              {cards.map((c) => (
                <CardView key={c.id} card={c} owned={g.s.owner[c.territory] === me} selected={cardSel === c.id} onClick={() => setCardSel(c.id)} />
              ))}
            </CardsGrid>
            <div className="my-1.5 flex flex-wrap items-center gap-2">
              <span>Para</span>
              <select className="input w-auto" value={cAllyValue} onChange={(e) => setCAlly(e.target.value)} aria-label="Aliado">
                {allies.map((a) => (
                  <option key={a} value={a}>
                    {g.s.players[a].name}
                  </option>
                ))}
              </select>
              <button
                className="btn btn-sm"
                disabled={!cardSel}
                onClick={async () => {
                  const r = await run({ type: "sendCard", cardId: cardSel!, ally: Number(cAllyValue) }, (res) =>
                    res.sentCard
                      ? `Carta enviada. Descartada: ${SHAPE_NAMES[res.sentCard.discarded.shape]} · ${tName(res.sentCard.discarded.territory)}.`
                      : "Carta enviada."
                  );
                  if (r.ok) setCardSel(null);
                }}
              >
                Enviar carta
              </button>
            </div>
          </>
        )}
      </Section>

      <ModalActions>
        <button className="btn" onClick={onClose}>
          Fechar
        </button>
      </ModalActions>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-2.5 border-t border-line pt-1 text-[13px] [&_p]:my-1">
      <h3 className="mt-2 mb-1 text-sm font-bold text-accent">{title}</h3>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- regras
function H({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-4 mb-1.5 text-[15px] font-bold text-accent">{children}</h3>;
}

function L({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc pl-5 leading-relaxed text-muted [&_b]:text-ink">{children}</ul>;
}

export function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal wide onClose={onClose}>
      <ModalTitle>Regras</ModalTitle>
      <H>Início</H>
      <L>
        <li>Cores e ordem são sorteadas; os territórios são divididos igualmente (os primeiros da ordem recebem o que sobrar).</li>
        <li>Cada território começa com 1 exército. Quem começar com um continente inteiro coloca o bônus dele nesse continente.</li>
        <li>Depois, cada jogador recebe metade dos exércitos que tem (arredondado para baixo) para colocar onde quiser.</li>
      </L>
      <H>Rodada</H>
      <L>
        <li>Cada etapa passa por todos os jogadores, na ordem, antes da próxima: reforço de continentes → reforço de territórios → ataques → passagem → cartas → trocas.</li>
      </L>
      <H>Batalha</H>
      <L>
        <li>
          Ataca quem tem mais de 1 exército no território. O atacante rola <b>exércitos − 1</b> dados e o defensor <b>exércitos</b> dados (máximo de 3 cada).
        </li>
        <li>Os dados são comparados do maior para o menor; empate é vitória da defesa.</li>
        <li>Ao zerar um território ele é seu, mas você não precisa ocupá-lo na hora: clique nele para enviar de 1 a 3 exércitos.</li>
        <li>Você pode continuar atacando com o mesmo território desde que, mesmo perdendo a batalha, ainda sobrem exércitos para ocupar todos os territórios conquistados por ele + 1.</li>
      </L>
      <H>Passagem</H>
      <L>
        <li>Passe exércitos para territórios vizinhos. Só os que já estavam no território no início da passagem podem cruzar fronteiras.</li>
        <li>Dentro de um continente que é todo seu, você pode mover à vontade.</li>
      </L>
      <H>Cartas e trocas</H>
      <L>
        <li>Depois que todos fizeram a passagem, quem conquistou ao menos 1 território na rodada ganha 1 carta (bolinha, quadrado, triângulo, estrela ou coringa).</li>
        <li>4 cartas do mesmo naipe valem: 4, 6, 8, 10, 12, 15, 20, 25, 30... (contagem de trocas de todos os jogadores).</li>
        <li>Carta com território seu: +3 exércitos nele. Quem elimina um jogador recebe as cartas dele.</li>
      </L>
      <H>Nova rodada</H>
      <L>
        <li>Bônus de cada continente dominado (colocado no próprio continente) + metade dos seus territórios (para baixo).</li>
        <li>Vence quem eliminar todos e dominar o mundo.</li>
      </L>
      <H>Equipes (duplas, trios, quartetos)</H>
      <L>
        <li>Aliados não se atacam; a ordem alterna as equipes.</li>
        <li>Passagem para território de aliado: chega metade (para baixo).</li>
        <li>Enviar carta a um aliado descarta outra carta aleatória (precisa de 2 cartas).</li>
        <li>
          Vassalagem (na passagem ou colocação): cede um território ao aliado, que fica com metade dos exércitos (para cima). Mantenha pelo menos 1 território próprio. O vassalo conta como seu no bônus de territórios; só você pode retomá-lo, sem recuperar exércitos.
        </li>
        <li>Continente só é dominado por um único jogador.</li>
        <li>Eliminado: metade das cartas (para cima) vai para quem eliminou e o resto é sorteado entre os aliados dele.</li>
      </L>
      <H>Online</H>
      <L>
        <li>Modos 1x1 (todos contra todos, de 2 a 9 jogadores), 2x2, 2x2x2, 2x2x2x2, 3x3, 3x3x3 e 4x4.</li>
        <li>Com o tempo de reconexão ligado, quem cair tem 3 minutos (todos veem o contador) para voltar; se não voltar, há dissolução: territórios para os aliados e cartas sorteadas, metade para aliados e metade para inimigos.</li>
        <li>Desistência: quando metade + 1 da equipe vota, a equipe desiste e seus territórios e cartas vão para a equipe inimiga com menos territórios.</li>
      </L>
      <H>Continentes e territórios</H>
      <p className="mb-2 text-[13px] text-muted">
        Quem domina todos os territórios de um continente recebe o bônus dele no início de cada rodada. A Arctogea junta o Ártico e a
        Antártida, em polos opostos do mapa.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {CONTINENT_IDS.map((c) => {
          const terrs = territoriesOfContinent(c);
          return (
            <div key={c} className="rounded-lg border-l-4 bg-panel-2 px-3 py-2" style={{ borderLeftColor: CONTINENTS[c].color }}>
              <div className="flex items-baseline justify-between gap-2">
                <b>{CONTINENTS[c].name}</b>
                <span className="text-xs text-muted">
                  {terrs.length} territórios · <b className="text-accent">+{CONTINENTS[c].bonus}</b>
                </span>
              </div>
              <div className="mt-1 text-[13px] leading-snug text-muted">{terrs.map(tName).join(", ")}</div>
            </div>
          );
        })}
      </div>
      <H>Controles</H>
      <L>
        <li>Roda do mouse, pinça ou botões +/− para zoom; arraste para mover o mapa.</li>
        <li>Na colocação, clique para adicionar; use −1 (ou o botão direito) para tirar.</li>
      </L>
      <ModalActions>
        <button className="btn" onClick={onClose}>
          Fechar
        </button>
      </ModalActions>
    </Modal>
  );
}

// ---------------------------------------------------------------- vitória
export function WinnerModal({ g, onClose, onNewGame, newGameLabel }: { g: Game; onClose: () => void; onNewGame: () => void; newGameLabel: string }) {
  return (
    <Modal onClose={onClose}>
      <div className="text-center">
        <div className="text-6xl">🏆</div>
        <ModalTitle>
          <span className="w-full text-center">{winnerText(g)} dominou o mundo!</span>
        </ModalTitle>
        <ModalText>
          Vitória na rodada {g.s.round} após {g.s.tradeCount} troca(s) de cartas.
        </ModalText>
      </div>
      <ModalActions>
        <button className="btn btn-ghost" onClick={onClose}>
          Ver o mapa
        </button>
        <button className="btn" onClick={onNewGame}>
          {newGameLabel}
        </button>
      </ModalActions>
    </Modal>
  );
}

export function winnerText(g: Game): string {
  if (g.s.winner === null) return "";
  if (!g.s.teamMode) return g.s.players[g.s.winner].name;
  const t = g.s.winnerTeam!;
  return g.teamName(t) + " (" + g.teamMembers(t).map((m) => m.name).join(", ") + ")";
}
