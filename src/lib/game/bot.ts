/*
 * Bots: jogadores controlados pelo computador. Cada chamada de `botAction` olha o estado atual e
 * devolve UMA ação para o jogador da vez (colocar, atacar, ocupar, passar, trocar, encerrar), para
 * que as jogadas apareçam uma a uma na tela. Sem DOM e sem React: roda no navegador (jogo local) e
 * no servidor (online).
 *
 * Estratégia:
 *  - Probabilidade exata de conquista (dados de ataque × defesa, empate da defesa), calculada uma vez.
 *  - Valor de cada alvo: progresso e domínio de continentes, quebrar o continente de um inimigo,
 *    eliminar jogadores (para ganhar as cartas deles) e conseguir a carta da rodada.
 *  - Colocação: cada exército vai onde mais aumenta a chance de conquistar um alvo valioso ou de
 *    segurar uma fronteira importante (principalmente as dos continentes dominados).
 *  - Ataque: só quando a chance compensa; se ainda não conquistou nada na rodada, aceita mais risco
 *    para garantir a carta.
 *  - Passagem: leva os exércitos do interior para as fronteiras e reforça as fronteiras mais ameaçadas.
 *  - Trocas: troca sempre que pode, preferindo cartas de territórios seus (+3).
 */
import { CONTINENTS, TERRITORIES, TERRITORY_IDS, territoriesOfContinent, type TerritoryId } from './data';
import { isValidSet, type Action, type ActionResult, type Card, type Game } from './engine';

// ------------------------------------------------------------------ probabilidades

interface Outcome {
  attLoss: number;
  defLoss: number;
  p: number;
}

const outcomeCache = new Map<number, Outcome[]>();

/** Resultados possíveis de uma rolagem com `ad` dados de ataque e `dd` de defesa. */
function outcomes(ad: number, dd: number): Outcome[] {
  const key = ad * 10 + dd;
  const cached = outcomeCache.get(key);
  if (cached) return cached;
  const n = ad + dd;
  const total = 6 ** n;
  const counts = new Map<number, number>();
  const dice: number[] = new Array(n);
  for (let idx = 0; idx < total; idx++) {
    let x = idx;
    for (let i = 0; i < n; i++) {
      dice[i] = (x % 6) + 1;
      x = Math.floor(x / 6);
    }
    const att = dice.slice(0, ad).sort((a, b) => b - a);
    const def = dice.slice(ad).sort((a, b) => b - a);
    let attLoss = 0;
    for (let i = 0; i < Math.min(ad, dd); i++) if (att[i] <= def[i]) attLoss++;
    counts.set(attLoss, (counts.get(attLoss) ?? 0) + 1);
  }
  const pairs = Math.min(ad, dd);
  const out = [...counts].map(([attLoss, c]) => ({ attLoss, defLoss: pairs - attLoss, p: c / total }));
  outcomeCache.set(key, out);
  return out;
}

const MAXN = 150;
let table: Float64Array | null = null;

/** P[a][d]: chance de um território com `a` exércitos conquistar um com `d`, atacando até o fim. */
function winTable(): Float64Array {
  if (table) return table;
  const t = new Float64Array((MAXN + 1) * (MAXN + 1));
  const at = (a: number, d: number) => a * (MAXN + 1) + d;
  for (let a = 0; a <= MAXN; a++) {
    for (let d = 0; d <= MAXN; d++) {
      if (d === 0) t[at(a, d)] = 1;
      else if (a <= 1) t[at(a, d)] = 0;
      else {
        let p = 0;
        for (const o of outcomes(Math.min(3, a - 1), Math.min(3, d))) p += o.p * t[at(a - o.attLoss, d - o.defLoss)];
        t[at(a, d)] = p;
      }
    }
  }
  table = t;
  return t;
}

/** Chance de conquistar `d` defensores atacando com um território de `a` exércitos (ataque até conquistar). */
export function conquestChance(a: number, d: number): number {
  if (d <= 0) return 1;
  if (a <= 1) return 0;
  if (a > MAXN || d > MAXN) {
    const k = MAXN / Math.max(a, d);
    a = Math.max(2, Math.round(a * k));
    d = Math.max(1, Math.round(d * k));
  }
  return winTable()[a * (MAXN + 1) + d];
}

// ------------------------------------------------------------------ pesos

/** Valor de ganhar a carta da rodada (conquistar ao menos 1 território). */
const CARD_VALUE = 3;
/** Peso da defesa em relação ao ataque na colocação. */
const DEFENSE_WEIGHT = 0.9;
/** Chance mínima para atacar (com e sem a carta da rodada garantida). */
const MIN_CHANCE = 0.55;
const MIN_CHANCE_FOR_CARD = 0.35;
/** A partir desta chance o bot ataca até conquistar de uma vez; abaixo, rola uma vez e reavalia. */
const BLITZ_CHANCE = 0.7;

// ------------------------------------------------------------------ análise do tabuleiro

class Brain {
  readonly s: Game['s'];
  readonly me: number;
  private readonly reinfCache = new Map<number, number>();

  constructor(readonly g: Game) {
    this.s = g.s;
    this.me = g.current;
  }

  owner(id: TerritoryId): number {
    return this.s.owner[id];
  }
  mine(id: TerritoryId): boolean {
    return this.s.owner[id] === this.me;
  }
  enemy(id: TerritoryId): boolean {
    const o = this.s.owner[id];
    return o !== this.me && !this.g.isAlly(this.me, o);
  }
  enemyNeighbors(id: TerritoryId): TerritoryId[] {
    return TERRITORIES[id].neighbors.filter((n) => this.enemy(n));
  }
  isBorder(id: TerritoryId): boolean {
    return TERRITORIES[id].neighbors.some((n) => this.enemy(n));
  }

  /** Exércitos que um jogador recebe por rodada (estimativa: territórios + continentes). */
  reinforcements(p: number): number {
    let r = this.reinfCache.get(p);
    if (r === undefined) {
      r = this.g.territoryBonus(p) + this.g.continentsOf(p).reduce((sum, c) => sum + CONTINENTS[c].bonus, 0);
      this.reinfCache.set(p, r);
    }
    return r;
  }

  /** Força com que os inimigos vizinhos podem atacar `id` (o mais forte + parte dos outros). */
  enemyStrength(id: TerritoryId, withReinforcements: boolean): number {
    let best = 0;
    let rest = 0;
    for (const n of this.enemyNeighbors(id)) {
      const a = this.s.armies[n] + (withReinforcements ? Math.floor(this.reinforcements(this.owner(n)) * 0.4) : 0);
      if (a > best) {
        rest += Math.max(0, best - 1);
        best = a;
      } else rest += Math.max(0, a - 1);
    }
    return best ? Math.round(best + rest * 0.25) : 0;
  }

  /** Quantos territórios do continente de `id` são meus, o tamanho dele e se um aliado impede o domínio. */
  private continentInfo(id: TerritoryId) {
    const c = TERRITORIES[id].continent;
    const list = territoriesOfContinent(c);
    let mine = 0;
    let blocked = false;
    for (const t of list) {
      const o = this.s.owner[t];
      if (o === this.me) mine++;
      else if (this.g.isAlly(this.me, o)) blocked = true; // continente só é de um único jogador
    }
    return { c, size: list.length, mine, blocked, bonus: CONTINENTS[c].bonus };
  }

  /** Quanto vale conquistar o território inimigo `id`. */
  targetValue(id: TerritoryId): number {
    const { c, size, mine, blocked, bonus } = this.continentInfo(id);
    let v = 1;
    const frac = (mine + 1) / size;
    v += bonus * frac * frac * (blocked ? 0.5 : 1.5);
    if (!blocked && mine + 1 === size) v += bonus * 2.5 + 2; // completa o continente
    const o = this.owner(id);
    if (this.g.ownsContinent(o, c)) v += bonus * 1.5 + 1; // tira o bônus de um inimigo
    const left = this.g.territoriesOf(o).length;
    const cards = this.g.cardCount(o);
    if (left === 1) v += 6 + cards * 2; // elimina o jogador e fica com as cartas
    else if (left <= 3) v += 2 + cards * 0.6;
    return v;
  }

  /** Quanto vale manter o meu território `id`. */
  importance(id: TerritoryId): number {
    const { size, mine, blocked, bonus } = this.continentInfo(id);
    let v = 1;
    if (mine === size) v += bonus * 1.5 + 1;
    else if (!blocked) v += bonus * (mine / size) ** 2;
    const count = this.g.territoriesOf(this.me).length;
    if (count <= 3) v += 4 + this.g.cardCount(this.me);
    return v;
  }

  /** Distância (em passos pelos meus territórios) até a fronteira mais próxima; Infinity se não há caminho. */
  borderDistances(): Map<TerritoryId, number> {
    const dist = new Map<TerritoryId, number>();
    const queue: TerritoryId[] = [];
    for (const id of this.g.territoriesOf(this.me)) {
      if (this.isBorder(id)) {
        dist.set(id, 0);
        queue.push(id);
      }
    }
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i];
      for (const n of TERRITORIES[id].neighbors) {
        if (this.mine(n) && !dist.has(n)) {
          dist.set(n, dist.get(id)! + 1);
          queue.push(n);
        }
      }
    }
    for (const id of this.g.territoriesOf(this.me)) if (!dist.has(id)) dist.set(id, Infinity);
    return dist;
  }

  // ---------------------------------------------------------------- colocação

  placement(): Partial<Record<TerritoryId, number>> {
    const g = this.g;
    const pool = g.pool!;
    const eligible = g.territoriesOf(this.me).filter((id) => g.canPlaceOn(id));
    const add: Partial<Record<TerritoryId, number>> = {};
    const armies = (id: TerritoryId) => this.s.armies[id] + (add[id] ?? 0);
    const hasCard = g.conqueredThisTurn;
    const options = eligible.flatMap((from) => this.enemyNeighbors(from).map((to) => ({ from, to, value: this.targetValue(to) })));
    const defenses = eligible
      .map((id) => ({ id, strength: this.enemyStrength(id, true), value: this.importance(id) * DEFENSE_WEIGHT }))
      .filter((d) => d.strength > 0);

    let left = pool.amount;
    while (left > 0) {
      // sem uma conquista quase certa, a carta da rodada ainda está em jogo
      const cardBonus =
        !hasCard && !options.some((o) => conquestChance(armies(o.from), this.s.armies[o.to]) >= 0.85) ? CARD_VALUE : 0;
      let best: { id: TerritoryId; k: number; rate: number } | null = null;
      const kMax = Math.min(left, 40);
      for (const o of options) {
        const a = armies(o.from);
        const d = this.s.armies[o.to];
        const p0 = conquestChance(a, d);
        if (p0 > 0.97) continue;
        const value = o.value + cardBonus;
        for (let k = 1; k <= kMax; k++) {
          const rate = (value * (conquestChance(a + k, d) - p0)) / k;
          if (!best || rate > best.rate) best = { id: o.from, k, rate };
        }
      }
      for (const def of defenses) {
        const a = armies(def.id);
        const lose0 = conquestChance(def.strength, a);
        if (lose0 < 0.03) continue;
        for (let k = 1; k <= kMax; k++) {
          const rate = (def.value * (lose0 - conquestChance(def.strength, a + k))) / k;
          if (!best || rate > best.rate) best = { id: def.id, k, rate };
        }
      }
      if (!best || best.rate <= 1e-4) break;
      add[best.id] = (add[best.id] ?? 0) + best.k;
      left -= best.k;
    }

    if (left > 0) {
      // nada mais faz diferença: reforça a fronteira mais ameaçada (ou a mais próxima do inimigo)
      const dist = this.borderDistances();
      const target = eligible
        .slice()
        .sort(
          (x, y) =>
            dist.get(x)! - dist.get(y)! ||
            this.enemyStrength(y, true) - armies(y) - (this.enemyStrength(x, true) - armies(x)) ||
            armies(y) - armies(x)
        )[0];
      add[target] = (add[target] ?? 0) + left;
    }
    return add;
  }

  // ---------------------------------------------------------------- ataque

  attackAction(): Action {
    const g = this.g;
    const s = this.s;
    const pending = Object.keys(s.pending) as TerritoryId[];
    if (pending.length) return { type: 'occupy', to: pending[0], n: this.occupyAmount(pending[0]) };

    const hungry = !g.conqueredThisTurn;
    let best: { from: TerritoryId; to: TerritoryId; p: number; score: number } | null = null;
    for (const from of g.territoriesOf(this.me)) {
      if (!g.canAttackFrom(from)) continue;
      const a = s.armies[from] - g.pendingCount(from);
      // sair de um continente dominado deixa a fronteira fraca: só com boa chance
      const guard = this.continentInfo(from).mine === this.continentInfo(from).size && this.enemyNeighbors(from).length > 1;
      for (const to of g.attackTargets(from)) {
        if (!g.checkAttack(from, to).ok) continue;
        const p = conquestChance(a, s.armies[to]);
        const value = this.targetValue(to);
        const eliminates = g.territoriesOf(this.owner(to)).length === 1;
        let min = hungry ? MIN_CHANCE_FOR_CARD : MIN_CHANCE;
        if (eliminates) min = Math.min(min, 0.3);
        if (guard) min = Math.max(min, 0.6);
        if (p < min) continue;
        const score = p * (value + (hungry ? CARD_VALUE : 0)) - (1 - p) * 1.5;
        if (!best || score > best.score) best = { from, to, p, score };
      }
    }
    if (!best) return { type: 'endAttack' };
    return { type: 'attack', from: best.from, to: best.to, blitz: best.p >= BLITZ_CHANCE };
  }

  /** Quantos exércitos mandar para o território conquistado (1 a 3). */
  occupyAmount(to: TerritoryId): number {
    const max = this.g.maxOccupy(to);
    const from = this.s.pending[to]!;
    if (max <= 1) return Math.max(1, max);
    const toBorder = this.isBorder(to);
    const fromBorder = this.enemyNeighbors(from).length > 0;
    // conquistado no interior e a origem ainda na fronteira: deixa os exércitos onde fazem falta
    if (!toBorder && fromBorder) return 1;
    return max;
  }

  // ---------------------------------------------------------------- passagem

  moveAction(): Action {
    const g = this.g;
    const s = this.s;
    const mine = g.territoriesOf(this.me);
    const dist = this.borderDistances();
    const desired = new Map<TerritoryId, number>();
    for (const id of mine) desired.set(id, dist.get(id) === 0 ? Math.ceil(this.enemyStrength(id, true) * 0.9) : 0);
    const need = (id: TerritoryId) => Math.max(0, desired.get(id)! - s.armies[id]);

    const pick: { best: { from: TerritoryId; to: TerritoryId; n: number; benefit: number } | null } = { best: null };
    const consider = (from: TerritoryId, to: TerritoryId, n: number, benefit: number) => {
      if (n > 0 && benefit > 0 && (!pick.best || benefit > pick.best.benefit)) pick.best = { from, to, n, benefit };
    };

    for (const from of mine) {
      if (s.armies[from] < 2) continue;
      const d = dist.get(from)!;
      if (d > 0 && d !== Infinity) {
        // interior: leva tudo o que puder para mais perto da fronteira
        for (const to of mine) {
          if (to === from) continue;
          const dt = dist.get(to)!;
          if (dt >= d) continue;
          const n = g.maxMove(from, to);
          if (!n) continue;
          consider(from, to, n, n * (d - dt) * 2 + need(to) * 0.1);
        }
      } else if (d === 0) {
        // fronteira com sobra: reforça a fronteira vizinha mais necessitada
        const surplus = s.armies[from] - 1 - desired.get(from)!;
        if (surplus <= 0) continue;
        for (const to of mine) {
          if (to === from || dist.get(to) !== 0) continue;
          const lack = need(to);
          if (!lack) continue;
          const n = Math.min(surplus, lack, g.maxMove(from, to));
          if (n <= 0) continue;
          consider(from, to, n, n * this.importance(to) * 0.5);
        }
      }
    }
    if (!pick.best) return { type: 'endMove' };
    const { from, to, n } = pick.best;
    return { type: 'move', from, to, n };
  }

  // ---------------------------------------------------------------- trocas

  /** Melhor conjunto de 4 cartas: mais cartas de territórios meus (+3 cada) e menos coringas gastos. */
  bestSet(): string[] | null {
    const cards = this.s.players[this.me].cards;
    let best: Card[] | null = null;
    let bestScore = -Infinity;
    const n = cards.length;
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++)
        for (let k = j + 1; k < n; k++)
          for (let l = k + 1; l < n; l++) {
            const set = [cards[i], cards[j], cards[k], cards[l]];
            if (!isValidSet(set)) continue;
            const score = set.reduce((sum, c) => sum + (this.mine(c.territory) ? 3 : 0) - (c.shape === 'coringa' ? 1 : 0), 0);
            if (score > bestScore) {
              best = set;
              bestScore = score;
            }
          }
    return best ? best.map((c) => c.id) : null;
  }
}

// ------------------------------------------------------------------ API

/** Próxima ação do bot da vez (o jogador atual). */
export function botAction(g: Game): Action {
  const s = g.s;
  const brain = new Brain(g);
  if (g.isPlacing()) return { type: 'place', placements: brain.placement() };
  switch (s.stage) {
    case 'attack':
      return brain.attackAction();
    case 'move':
      return brain.moveAction();
    case 'trade': {
      const set = brain.bestSet();
      return set ? { type: 'trade', cardIds: set } : { type: 'skipTrade' };
    }
    default:
      return fallbackAction(g);
  }
}

/** Ação que sempre faz a partida andar (se a escolhida pelo bot for recusada). */
export function fallbackAction(g: Game): Action {
  const s = g.s;
  if (g.isPlacing()) {
    const id = TERRITORY_IDS.find((t) => g.canPlaceOn(t))!;
    return { type: 'place', placements: { [id]: g.pool!.amount } };
  }
  if (s.stage === 'attack') {
    const pending = Object.keys(s.pending) as TerritoryId[];
    if (pending.length) return { type: 'occupy', to: pending[0], n: Math.max(1, g.maxOccupy(pending[0])) };
    return { type: 'endAttack' };
  }
  if (s.stage === 'move') return { type: 'endMove' };
  return { type: 'skipTrade' };
}

/** É a vez de um bot? */
export function isBotTurn(g: Game): boolean {
  return g.stage !== 'over' && g.current >= 0 && !!g.s.players[g.current]?.bot;
}

/** Faz o bot da vez jogar uma ação. Retorna a ação aplicada e o resultado. */
export function botAct(g: Game): { action: Action; result: ActionResult } {
  const me = g.current;
  const action = botAction(g);
  const result = g.apply(action, me);
  if (result.ok) return { action, result };
  const fb = fallbackAction(g);
  return { action: fb, result: g.apply(fb, me) };
}

/** Pausa (ms) antes de cada tipo de jogada, para que dê para acompanhar o bot na tela. */
export function botDelay(action: Action): number {
  switch (action.type) {
    case 'place':
    case 'trade':
      return 900;
    case 'attack':
      return 800;
    case 'move':
      return 550;
    case 'occupy':
      return 450;
    default:
      return 350;
  }
}

/** Nomes dos bots no online. */
export const BOT_NAMES = [
  'Bot Napoleão', 'Bot Cleópatra', 'Bot Aníbal', 'Bot Joana', 'Bot Saladino',
  'Bot Sun Tzu', 'Bot Boudica', 'Bot Ciro', 'Bot Tomoe', 'Bot Átila',
];
