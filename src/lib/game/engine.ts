/*
 * Motor do jogo (sem DOM e sem React). Todo o estado fica em `GameState`, um objeto
 * simples que pode ser salvo como JSON (no banco, no modo online) e recarregado.
 *
 * Fluxo de uma rodada (em cada etapa todos os jogadores agem, na ordem):
 *   setup-continent -> setup-place -> attack -> move -> (cartas) -> trade
 *   -> reinforce-continent -> reinforce-territory -> attack -> move -> trade -> ...
 */
import {
  CONTINENTS,
  CONTINENT_IDS,
  TERRITORIES,
  TERRITORY_IDS,
  cName,
  tName,
  type ContinentId,
  type TerritoryId,
} from './data';

// ------------------------------------------------------------------ tipos

export type ModeKey = 'solo' | 'duplas' | 'trios' | 'quartetos';
export type Shape = 'circulo' | 'quadrado' | 'triangulo' | 'estrela' | 'coringa';
export type Stage =
  | 'setup-continent'
  | 'setup-place'
  | 'reinforce-continent'
  | 'reinforce-territory'
  | 'attack'
  | 'move'
  | 'trade'
  | 'over';
export type PlayerStatus = 'playing' | 'eliminated' | 'dissolved' | 'surrendered';

export interface Card {
  id: string;
  shape: Shape;
  territory: TerritoryId;
}

export interface Player {
  index: number;
  name: string;
  color: string;
  textColor: string;
  cards: Card[];
  /** Preenchido quando as cartas de outro jogador são ocultadas (modo online). */
  cardCount?: number;
  alive: boolean;
  status: PlayerStatus;
  team: number;
  userId?: string;
}

export interface Pool {
  amount: number;
  continent: ContinentId | null;
  label: string;
}

export interface LogEntry {
  text: string;
  player: number | null;
  round: number;
}

export type EventKind = 'conquest' | 'eliminated' | 'cards' | 'dissolved' | 'surrendered' | 'trade' | 'victory';

export interface GameEvent {
  seq: number;
  kind: EventKind;
  text: string;
  player: number | null;
}

export interface BattleResult {
  from: TerritoryId;
  to: TerritoryId;
  attacker: number;
  defender: number;
  att: number[];
  def: number[];
  pairs: ('att' | 'def')[];
  attLoss: number;
  defLoss: number;
  rolls: number;
  totalAttLoss: number;
  totalDefLoss: number;
  conquered: boolean;
  eliminated: number | null;
}

export interface GameState {
  schema: 1;
  mode: ModeKey;
  teamMode: boolean;
  numTeams: number;
  players: Player[];
  owner: Record<TerritoryId, number>;
  armies: Record<TerritoryId, number>;
  /** território vassalo -> dono original (quem cedeu) */
  vassalOf: Partial<Record<TerritoryId, number>>;
  round: number;
  tradeCount: number;
  current: number;
  stage: Stage;
  pools: Pool[];
  poolIndex: number;
  /** conquistado e ainda vazio -> território que atacou */
  pending: Partial<Record<TerritoryId, TerritoryId>>;
  conquered: boolean[];
  movable: Partial<Record<TerritoryId, number>>;
  tradeSub: 'choose' | 'place' | null;
  winner: number | null;
  winnerTeam: number | null;
  /** votos de desistência por equipe (índices dos jogadores) */
  surrenderVotes: Record<number, number[]>;
  lastBattle: BattleResult | null;
  logs: LogEntry[];
  events: GameEvent[];
  eventSeq: number;
}

export type Action =
  | { type: 'place'; placements: Partial<Record<TerritoryId, number>> }
  | { type: 'attack'; from: TerritoryId; to: TerritoryId; blitz?: boolean }
  | { type: 'occupy'; to: TerritoryId; n: number }
  | { type: 'endAttack' }
  | { type: 'move'; from: TerritoryId; to: TerritoryId; n: number }
  | { type: 'endMove' }
  | { type: 'trade'; cardIds: string[] }
  | { type: 'skipTrade' }
  | { type: 'vassal'; territory: TerritoryId; ally: number }
  | { type: 'unvassal'; territory: TerritoryId }
  | { type: 'sendCard'; cardId: string; ally: number }
  | { type: 'surrenderVote'; vote: boolean };

export interface ActionResult {
  ok: boolean;
  reason?: string;
  battle?: BattleResult;
  trade?: { value: number; bonuses: TerritoryId[] };
  sentCard?: { card: Card; discarded: Card };
  surrendered?: boolean;
}

export type Rng = () => number;

// ------------------------------------------------------------------ constantes

export const COLORS = [
  { name: 'Vermelho', hex: '#d63031', text: '#fff' },
  { name: 'Azul', hex: '#2e6fd8', text: '#fff' },
  { name: 'Verde', hex: '#27ae60', text: '#fff' },
  { name: 'Amarelo', hex: '#f6d32d', text: '#222' },
  { name: 'Preto', hex: '#2b2b2b', text: '#fff' },
  { name: 'Branco', hex: '#f4f4f4', text: '#222' },
  { name: 'Roxo', hex: '#8e44ad', text: '#fff' },
  { name: 'Laranja', hex: '#ec7a1c', text: '#fff' },
  { name: 'Rosa', hex: '#ff8fc7', text: '#222' },
] as const;

export const SHAPES: Shape[] = ['circulo', 'quadrado', 'triangulo', 'estrela'];
export const JOKER: Shape = 'coringa';
export const SHAPE_NAMES: Record<Shape, string> = {
  circulo: 'Bolinha',
  quadrado: 'Quadrado',
  triangulo: 'Triângulo',
  estrela: 'Estrela',
  coringa: 'Coringa',
};

export const STAGE_NAMES: Record<Stage, string> = {
  'setup-continent': 'Bônus de continente inicial',
  'setup-place': 'Distribuição inicial',
  'reinforce-continent': 'Reforços — bônus de continente',
  'reinforce-territory': 'Reforços — bônus de territórios',
  attack: 'Ataque',
  move: 'Passagem de exércitos',
  trade: 'Troca de cartas',
  over: 'Fim de jogo',
};

export const MODES: Record<ModeKey, { name: string; teamSize: number; counts: number[] }> = {
  solo: { name: 'Individual', teamSize: 1, counts: [2, 3, 4, 5, 6, 7, 8, 9] },
  duplas: { name: 'Duplas', teamSize: 2, counts: [4, 6, 8] },
  trios: { name: 'Trios', teamSize: 3, counts: [6, 9] },
  quartetos: { name: 'Quartetos', teamSize: 4, counts: [8] },
};

export const TEAM_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];

const MAX_LOGS = 150;
const MAX_EVENTS = 40;

// Valor da n-ésima troca (n começa em 1): 4, 6, 8, 10, 12, 15, 20, 25, 30...
export function tradeValue(n: number): number {
  if (n <= 5) return 2 + 2 * n;
  if (n === 6) return 15;
  return 15 + 5 * (n - 6);
}

export function shuffle<T>(arr: readonly T[], rng: Rng): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function isValidSet(cards: Card[]): boolean {
  if (cards.length !== 4) return false;
  const shapes = new Set(cards.filter((c) => c.shape !== JOKER).map((c) => c.shape));
  return shapes.size <= 1;
}

export interface NewGameOptions {
  mode?: ModeKey;
  rng?: Rng;
  /** Nomes dos jogadores na ordem dos assentos (modo online). Sem nomes, usa o nome da cor. */
  names?: string[];
  userIds?: string[];
}

// ------------------------------------------------------------------ motor

export class Game {
  s: GameState;
  rng: Rng;

  constructor(state: GameState, rng?: Rng) {
    this.s = state;
    this.rng = rng ?? Math.random;
  }

  /** Cria uma partida nova: sorteia cores, ordem e territórios, e começa a preparação. */
  static create(numPlayers: number, opts: NewGameOptions = {}): Game {
    const modeKey = opts.mode ?? 'solo';
    const mode = MODES[modeKey];
    if (!mode || !mode.counts.includes(numPlayers)) throw new Error('Número de jogadores inválido para o modo');
    const rng = opts.rng ?? Math.random;
    const teamMode = mode.teamSize > 1;
    const numTeams = teamMode ? numPlayers / mode.teamSize : numPlayers;

    // Nas equipes a ordem alterna as equipes (A B C A B C...): ninguém da mesma equipe joga em seguida.
    const colors = shuffle(COLORS, rng).slice(0, numPlayers);
    // No online, os assentos (nomes) também são sorteados
    const seats = shuffle(
      Array.from({ length: numPlayers }, (_, i) => i),
      rng
    );
    const players: Player[] = colors.map((c, i) => ({
      index: i,
      name: opts.names ? opts.names[seats[i]] : c.name,
      userId: opts.userIds ? opts.userIds[seats[i]] : undefined,
      color: c.hex,
      textColor: c.text,
      cards: [],
      alive: true,
      status: 'playing',
      team: i % numTeams,
    }));

    const owner = {} as Record<TerritoryId, number>;
    const armies = {} as Record<TerritoryId, number>;
    // Os primeiros da ordem recebem o resto da divisão
    shuffle(TERRITORY_IDS, rng).forEach((id, i) => {
      owner[id] = i % numPlayers;
      armies[id] = 1;
    });

    const state: GameState = {
      schema: 1,
      mode: modeKey,
      teamMode,
      numTeams,
      players,
      owner,
      armies,
      vassalOf: {},
      round: 1,
      tradeCount: 0,
      current: -1,
      stage: 'setup-continent',
      pools: [],
      poolIndex: 0,
      pending: {},
      conquered: players.map(() => false),
      movable: {},
      tradeSub: null,
      winner: null,
      winnerTeam: null,
      surrenderVotes: {},
      lastBattle: null,
      logs: [],
      events: [],
      eventSeq: 0,
    };
    const g = new Game(state, rng);
    g.log(
      'Partida iniciada com ' + numPlayers + ' jogadores' +
        (teamMode ? ' (' + mode.name.toLowerCase() + ': ' + numTeams + ' equipes de ' + mode.teamSize + ').' : '.')
    );
    g.startSetupContinent();
    return g;
  }

  /** Carrega um estado salvo (o objeto é usado diretamente: clone antes se precisar). */
  static load(state: GameState, rng?: Rng): Game {
    return new Game(state, rng);
  }

  toState(): GameState {
    return this.s;
  }

  // ---------------------------------------------------------------- utilidades
  log(text: string, player: number | null = null) {
    this.s.logs.push({ text, player, round: this.s.round });
    if (this.s.logs.length > MAX_LOGS) this.s.logs.splice(0, this.s.logs.length - MAX_LOGS);
  }

  event(kind: EventKind, text: string, player: number | null = null) {
    this.s.eventSeq++;
    this.s.events.push({ seq: this.s.eventSeq, kind, text, player });
    if (this.s.events.length > MAX_EVENTS) this.s.events.splice(0, this.s.events.length - MAX_EVENTS);
  }

  get player(): Player {
    return this.s.players[this.s.current];
  }
  get stage(): Stage {
    return this.s.stage;
  }
  get current(): number {
    return this.s.current;
  }

  cardCount(p: number): number {
    const pl = this.s.players[p];
    return pl.cardCount ?? pl.cards.length;
  }

  /** territórios que o jogador controla (inclui vassalos recebidos de aliados) */
  territoriesOf(p: number): TerritoryId[] {
    return TERRITORY_IDS.filter((id) => this.s.owner[id] === p);
  }
  /** dono "original": territórios vassalos contam para quem os cedeu */
  countedOwner(id: TerritoryId): number {
    const v = this.s.vassalOf[id];
    return v !== undefined ? v : this.s.owner[id];
  }
  territoryCount(p: number): number {
    return TERRITORY_IDS.filter((id) => this.countedOwner(id) === p).length;
  }
  totalArmies(p: number): number {
    return this.territoriesOf(p).reduce((sum, id) => sum + this.s.armies[id], 0);
  }
  teamName(t: number): string {
    return 'Equipe ' + TEAM_LETTERS[t];
  }
  isAlly(p: number, q: number): boolean {
    return this.s.teamMode && p !== q && this.s.players[p].team === this.s.players[q].team;
  }
  alliesOf(p: number): number[] {
    return this.s.players.filter((pl) => pl.alive && this.isAlly(p, pl.index)).map((pl) => pl.index);
  }
  teamMembers(t: number): Player[] {
    return this.s.players.filter((pl) => pl.team === t);
  }
  aliveTeams(): number[] {
    return [...new Set(this.s.players.filter((pl) => pl.alive).map((pl) => pl.team))];
  }
  ownsContinent(p: number, c: ContinentId): boolean {
    return TERRITORY_IDS.every((id) => TERRITORIES[id].continent !== c || this.s.owner[id] === p);
  }
  continentsOf(p: number): ContinentId[] {
    return CONTINENT_IDS.filter((c) => this.ownsContinent(p, c));
  }
  isNeighbor(a: TerritoryId, b: TerritoryId): boolean {
    return TERRITORIES[a].neighbors.includes(b);
  }
  pendingCount(source: TerritoryId): number {
    return Object.values(this.s.pending).filter((x) => x === source).length;
  }

  // próximo jogador vivo depois de `from` (sem dar a volta); -1 se acabou
  nextAlive(from: number, filter?: (i: number) => boolean): number {
    for (let i = from + 1; i < this.s.players.length; i++) {
      if (this.s.players[i].alive && (!filter || filter(i))) return i;
    }
    return -1;
  }

  // ---------------------------------------------------------------- ações (ponto único de entrada)
  /**
   * Aplica uma ação do jogador `actor`. As ações de turno só valem para o jogador da vez;
   * o voto de desistência vale para qualquer jogador vivo.
   */
  apply(action: Action, actor: number): ActionResult {
    const s = this.s;
    if (s.stage === 'over') return { ok: false, reason: 'A partida terminou.' };
    if (!s.players[actor]) return { ok: false, reason: 'Jogador inválido.' };
    if (action.type === 'surrenderVote') return this.surrenderVote(actor, action.vote);
    if (actor !== s.current) return { ok: false, reason: 'Não é a sua vez.' };
    switch (action.type) {
      case 'place':
        return this.placeAll(action.placements);
      case 'attack':
        return this.attack(action.from, action.to, !!action.blitz);
      case 'occupy':
        return this.occupy(action.to, action.n) ? { ok: true } : { ok: false, reason: 'Ocupação inválida.' };
      case 'endAttack':
        return this.endAttack()
          ? { ok: true }
          : { ok: false, reason: 'Ocupe primeiro os territórios conquistados.' };
      case 'move':
        return this.move(action.from, action.to, action.n) ? { ok: true } : { ok: false, reason: 'Passagem inválida.' };
      case 'endMove':
        return this.endTurn() ? { ok: true } : { ok: false, reason: 'Não é a fase de passagem.' };
      case 'trade':
        return this.trade(action.cardIds);
      case 'skipTrade':
        return this.skipTrade() ? { ok: true } : { ok: false, reason: 'Não é a fase de trocas.' };
      case 'vassal':
        return this.vassal(action.territory, action.ally);
      case 'unvassal':
        return this.unvassal(action.territory);
      case 'sendCard':
        return this.sendCard(action.cardId, action.ally);
      default:
        return { ok: false, reason: 'Ação desconhecida.' };
    }
  }

  // ---------------------------------------------------------------- colocação de exércitos
  beginPlacement(pools: Pool[]): boolean {
    this.s.pools = pools.filter((p) => p.amount > 0);
    this.s.poolIndex = 0;
    return this.s.pools.length > 0;
  }

  get pool(): Pool | null {
    return this.s.pools[this.s.poolIndex] ?? null;
  }

  isPlacing(): boolean {
    return !!this.pool && this.s.stage !== 'over';
  }

  canPlaceOn(id: TerritoryId): boolean {
    const pool = this.pool;
    if (!pool || this.s.owner[id] !== this.s.current) return false;
    return !pool.continent || TERRITORIES[id].continent === pool.continent;
  }

  /** Coloca todos os exércitos da etapa atual de uma vez e confirma. */
  placeAll(placements: Partial<Record<TerritoryId, number>>): ActionResult {
    const pool = this.pool;
    if (!pool) return { ok: false, reason: 'Não há exércitos para colocar.' };
    let total = 0;
    for (const [id, n] of Object.entries(placements) as [TerritoryId, number][]) {
      if (!TERRITORIES[id]) return { ok: false, reason: 'Território inválido.' };
      if (!Number.isInteger(n) || n < 0) return { ok: false, reason: 'Quantidade inválida.' };
      if (n > 0 && !this.canPlaceOn(id)) {
        return {
          ok: false,
          reason: pool.continent
            ? 'Esses exércitos só podem ir para territórios seus em ' + cName(pool.continent) + '.'
            : tName(id) + ' não é seu.',
        };
      }
      total += n;
    }
    if (total !== pool.amount) return { ok: false, reason: 'Coloque exatamente ' + pool.amount + ' exército(s).' };
    const where: string[] = [];
    for (const [id, n] of Object.entries(placements) as [TerritoryId, number][]) {
      if (!n) continue;
      this.s.armies[id] += n;
      where.push(tName(id) + ' +' + n);
    }
    this.log(this.player.name + ' colocou ' + pool.amount + ' (' + pool.label + '): ' + where.join(', '), this.s.current);
    this.s.poolIndex++;
    if (this.s.poolIndex >= this.s.pools.length) {
      this.s.pools = [];
      this.s.poolIndex = 0;
      this.afterPlacement();
    }
    return { ok: true };
  }

  afterPlacement() {
    switch (this.s.stage) {
      case 'setup-continent':
        return this.advanceSetupContinent();
      case 'setup-place':
        return this.advanceSetupPlace();
      case 'reinforce-continent':
        return this.advanceReinforceContinent();
      case 'reinforce-territory':
        return this.advanceReinforceTerritory();
      case 'trade':
        if (this.hasValidSet(this.s.current)) this.s.tradeSub = 'choose';
        else this.advanceTrade();
        return;
    }
  }

  continentPools(p: number): Pool[] {
    return this.continentsOf(p).map((c) => ({
      amount: CONTINENTS[c].bonus,
      continent: c,
      label: 'bônus de ' + cName(c),
    }));
  }

  // ---------------------------------------------------------------- preparação
  startSetupContinent() {
    this.s.stage = 'setup-continent';
    this.s.current = -1;
    this.advanceSetupContinent();
  }

  advanceSetupContinent() {
    const p = this.nextAlive(this.s.current, (i) => this.continentsOf(i).length > 0);
    if (p === -1) return this.startSetupPlace();
    this.s.current = p;
    this.beginPlacement(this.continentPools(p));
    this.log(this.player.name + ' começou com continente(s) completo(s) e recebe o bônus.', p);
  }

  startSetupPlace() {
    this.s.stage = 'setup-place';
    this.s.current = -1;
    this.advanceSetupPlace();
  }

  advanceSetupPlace() {
    const p = this.nextAlive(this.s.current, (i) => Math.floor(this.totalArmies(i) / 2) > 0);
    if (p === -1) return this.startAttackStage();
    this.s.current = p;
    this.beginPlacement([{ amount: Math.floor(this.totalArmies(p) / 2), continent: null, label: 'metade dos seus exércitos' }]);
  }

  // ---------------------------------------------------------------- reforços (a partir da 2ª rodada)
  // Primeiro todos colocam o bônus de continente; depois todos colocam o bônus de territórios.
  startReinforceStage() {
    this.s.round++;
    this.log('— Rodada ' + this.s.round + ' —');
    this.s.stage = 'reinforce-continent';
    this.s.current = -1;
    this.advanceReinforceContinent();
  }

  advanceReinforceContinent() {
    const p = this.nextAlive(this.s.current, (i) => this.continentPools(i).length > 0);
    if (p === -1) {
      this.s.stage = 'reinforce-territory';
      this.s.current = -1;
      return this.advanceReinforceTerritory();
    }
    this.s.current = p;
    this.beginPlacement(this.continentPools(p));
  }

  territoryBonus(p: number): number {
    return Math.floor(this.territoryCount(p) / 2);
  }

  advanceReinforceTerritory() {
    const p = this.nextAlive(this.s.current, (i) => this.territoryBonus(i) > 0);
    if (p === -1) return this.startAttackStage();
    this.s.current = p;
    this.beginPlacement([{ amount: this.territoryBonus(p), continent: null, label: 'bônus de territórios' }]);
  }

  // ---------------------------------------------------------------- ataque
  startAttackStage() {
    this.s.stage = 'attack';
    this.s.current = -1;
    this.s.conquered = this.s.players.map(() => false);
    this.advanceAttack();
  }

  advanceAttack() {
    const p = this.nextAlive(this.s.current);
    if (p === -1) return this.startMoveStage();
    this.s.pending = {};
    this.s.stage = 'attack';
    this.s.current = p;
  }

  get conqueredThisTurn(): boolean {
    return !!this.s.conquered[this.s.current];
  }

  isEnemyTerritory(id: TerritoryId): boolean {
    const o = this.s.owner[id];
    return o !== this.s.current && !this.isAlly(this.s.current, o);
  }

  canAttackFrom(id: TerritoryId): boolean {
    if (this.s.stage !== 'attack' || this.s.owner[id] !== this.s.current || this.s.pending[id]) return false;
    if (this.s.armies[id] < 2) return false;
    return TERRITORIES[id].neighbors.some((n) => this.isEnemyTerritory(n));
  }

  attackTargets(id: TerritoryId): TerritoryId[] {
    if (!this.canAttackFrom(id)) return [];
    return TERRITORIES[id].neighbors.filter((n) => this.isEnemyTerritory(n));
  }

  checkAttack(from: TerritoryId, to: TerritoryId): { ok: boolean; reason?: string; attDice?: number; defDice?: number } {
    const s = this.s;
    if (s.stage !== 'attack') return { ok: false, reason: 'Não é fase de ataque.' };
    if (!TERRITORIES[from] || !TERRITORIES[to]) return { ok: false, reason: 'Território inválido.' };
    if (s.owner[from] !== s.current) return { ok: false, reason: 'Território de origem não é seu.' };
    if (s.pending[from]) return { ok: false, reason: 'Ocupe esse território antes de atacar com ele.' };
    if (s.owner[to] === s.current) return { ok: false, reason: 'Esse território já é seu.' };
    if (this.isAlly(s.current, s.owner[to])) return { ok: false, reason: 'Não é possível atacar um aliado.' };
    if (!this.isNeighbor(from, to)) return { ok: false, reason: 'Os territórios não fazem fronteira.' };
    if (s.armies[from] < 2) return { ok: false, reason: 'É preciso ter mais de 1 exército para atacar.' };
    const attDice = Math.min(3, s.armies[from] - 1);
    const defDice = Math.min(3, s.armies[to]);
    const maxLoss = Math.min(attDice, defDice);
    const need = this.pendingCount(from);
    if (s.armies[from] - maxLoss < need + 1) {
      return {
        ok: false,
        attDice,
        defDice,
        reason:
          'Se perder essa batalha, ' + tName(from) + ' não terá exércitos para ocupar ' +
          (need === 1 ? 'o território conquistado' : 'os ' + need + ' territórios conquistados') +
          '. Envie exércitos para lá primeiro.',
      };
    }
    return { ok: true, attDice, defDice };
  }

  rollDie(): number {
    return 1 + Math.floor(this.rng() * 6);
  }

  /** Uma batalha (ou várias seguidas, com `blitz`, até conquistar ou o ataque deixar de ser permitido). */
  attack(from: TerritoryId, to: TerritoryId, blitz = false): ActionResult {
    const first = this.checkAttack(from, to);
    if (!first.ok) return { ok: false, reason: first.reason };
    let last: BattleResult | null = null;
    let rolls = 0, totalAtt = 0, totalDef = 0;
    do {
      const r = this.battle(from, to);
      rolls++;
      totalAtt += r.attLoss;
      totalDef += r.defLoss;
      last = { ...r, rolls, totalAttLoss: totalAtt, totalDefLoss: totalDef };
    } while (blitz && !last.conquered && this.s.stage === 'attack' && this.checkAttack(from, to).ok);
    this.s.lastBattle = last;
    return { ok: true, battle: last };
  }

  private battle(from: TerritoryId, to: TerritoryId): BattleResult {
    const s = this.s;
    const check = this.checkAttack(from, to);
    const att = Array.from({ length: check.attDice! }, () => this.rollDie()).sort((a, b) => b - a);
    const def = Array.from({ length: check.defDice! }, () => this.rollDie()).sort((a, b) => b - a);
    let attLoss = 0, defLoss = 0;
    const pairs: ('att' | 'def')[] = [];
    for (let i = 0; i < Math.min(att.length, def.length); i++) {
      const attackerWins = att[i] > def[i]; // empate: vitória da defesa
      if (attackerWins) defLoss++;
      else attLoss++;
      pairs.push(attackerWins ? 'att' : 'def');
    }
    s.armies[from] -= attLoss;
    s.armies[to] -= defLoss;
    const defender = s.owner[to];
    const result: BattleResult = {
      from, to, attacker: s.current, defender, att, def, pairs, attLoss, defLoss,
      rolls: 1, totalAttLoss: attLoss, totalDefLoss: defLoss, conquered: false, eliminated: null,
    };

    if (s.armies[to] <= 0) {
      s.armies[to] = 0;
      s.owner[to] = s.current;
      delete s.vassalOf[to];
      s.pending[to] = from;
      s.conquered[s.current] = true;
      result.conquered = true;
      const msg = this.player.name + ' conquistou ' + tName(to) + ' de ' + s.players[defender].name + '.';
      this.log(msg, s.current);
      this.event('conquest', msg, s.current);

      if (this.territoriesOf(defender).length === 0) {
        result.eliminated = defender;
        this.eliminate(defender, 'eliminated');
        this.log(s.players[defender].name + ' foi eliminado por ' + this.player.name + '.', s.current);
        this.event('eliminated', s.players[defender].name + ' foi eliminado por ' + this.player.name + '!', defender);
        this.distributeCardsOnElimination(defender);
        this.checkVictory();
      }
    }
    return result;
  }

  /** Marca o jogador como fora da partida e limpa vassalagens e votos ligados a ele. */
  private eliminate(p: number, status: PlayerStatus) {
    const pl = this.s.players[p];
    pl.alive = false;
    pl.status = status;
    for (const id of Object.keys(this.s.vassalOf) as TerritoryId[]) {
      if (this.s.vassalOf[id] === p) delete this.s.vassalOf[id];
    }
    const votes = this.s.surrenderVotes[pl.team];
    if (votes) this.s.surrenderVotes[pl.team] = votes.filter((v) => v !== p);
  }

  /** Se só restar uma equipe viva, a partida termina. */
  private checkVictory(): boolean {
    const teams = this.aliveTeams();
    if (teams.length !== 1 || this.s.stage === 'over') return false;
    // ocupa automaticamente o que ficou pendente
    for (const t of Object.keys(this.s.pending) as TerritoryId[]) {
      const src = this.s.pending[t]!;
      const n = Math.max(1, Math.min(this.maxOccupy(t), this.s.armies[src] - 1));
      if (this.s.armies[src] - n >= 1) this.s.armies[src] -= n;
      this.s.armies[t] = Math.max(1, n);
      delete this.s.pending[t];
    }
    this.s.pools = [];
    this.s.stage = 'over';
    this.s.winnerTeam = teams[0];
    this.s.winner = this.s.players.find((pl) => pl.alive && pl.team === teams[0])!.index;
    const who = this.s.teamMode
      ? this.teamName(teams[0]) + ' (' + this.teamMembers(teams[0]).map((m) => m.name).join(', ') + ')'
      : this.s.players[this.s.winner].name;
    this.log(who + ' dominou o mundo e venceu a partida!', this.s.winner);
    this.event('victory', who + ' dominou o mundo!', this.s.winner);
    return true;
  }

  maxOccupy(to: TerritoryId): number {
    const from = this.s.pending[to];
    if (!from) return 0;
    const reserveForOthers = this.pendingCount(from) - 1;
    return Math.max(0, Math.min(3, this.s.armies[from] - 1 - reserveForOthers));
  }

  occupy(to: TerritoryId, n: number): boolean {
    const from = this.s.pending[to];
    if (!from || this.s.stage !== 'attack') return false;
    if (!Number.isInteger(n) || n < 1 || n > this.maxOccupy(to)) return false;
    this.s.armies[from] -= n;
    this.s.armies[to] = n;
    delete this.s.pending[to];
    return true;
  }

  endAttack(): boolean {
    if (this.s.stage !== 'attack' || Object.keys(this.s.pending).length) return false;
    this.s.pending = {};
    this.advanceAttack();
    return true;
  }

  // ---------------------------------------------------------------- passagem
  startMoveStage() {
    this.s.stage = 'move';
    this.s.current = -1;
    this.advanceMove();
  }

  hasAnyMove(): boolean {
    return this.territoriesOf(this.s.current).some((id) => this.s.armies[id] > 1 && this.moveTargets(id).length > 0);
  }

  advanceMove() {
    for (;;) {
      const p = this.nextAlive(this.s.current);
      if (p === -1) {
        this.s.movable = {};
        this.giveCards();
        return this.startTradeStage();
      }
      this.s.stage = 'move';
      this.s.current = p;
      this.s.movable = {};
      for (const id of this.territoriesOf(p)) this.s.movable[id] = this.s.armies[id];
      if (this.hasAnyMove()) return;
      this.log(this.s.players[p].name + ' não tem exércitos para passar.', p);
    }
  }

  freeMove(from: TerritoryId, to: TerritoryId): boolean {
    const c = TERRITORIES[from].continent;
    return this.s.owner[to] === this.s.current && c === TERRITORIES[to].continent && this.ownsContinent(this.s.current, c);
  }

  /** passagem para território de aliado: chega metade (para baixo) */
  isAllyMove(from: TerritoryId, to: TerritoryId): boolean {
    return this.s.owner[from] === this.s.current && this.isAlly(this.s.current, this.s.owner[to]);
  }

  maxMove(from: TerritoryId, to: TerritoryId): number {
    const s = this.s;
    if (s.stage !== 'move' || from === to || !TERRITORIES[from] || !TERRITORIES[to] || s.owner[from] !== s.current) return 0;
    const ally = this.isAllyMove(from, to);
    if (s.owner[to] !== s.current && !ally) return 0;
    if (this.freeMove(from, to)) return s.armies[from] - 1;
    if (!this.isNeighbor(from, to)) return 0;
    const max = Math.max(0, Math.min(s.movable[from] ?? 0, s.armies[from] - 1));
    return ally && max < 2 ? 0 : max; // para aliado é preciso enviar pelo menos 2 (chega 1)
  }

  moveTargets(from: TerritoryId): TerritoryId[] {
    return TERRITORY_IDS.filter((id) => this.maxMove(from, id) > 0);
  }

  move(from: TerritoryId, to: TerritoryId, n: number): boolean {
    const s = this.s;
    if (!Number.isInteger(n) || n < 1 || n > this.maxMove(from, to)) return false;
    if (this.isAllyMove(from, to)) {
      if (n < 2) return false;
      const arrive = Math.floor(n / 2);
      s.movable[from] = (s.movable[from] ?? 0) - n;
      s.armies[from] -= n;
      s.armies[to] += arrive;
      this.log(
        this.player.name + ' enviou ' + n + ' de ' + tName(from) + ' para o aliado ' + s.players[s.owner[to]].name +
          ' em ' + tName(to) + ' (chegaram ' + arrive + ').',
        s.current
      );
      return true;
    }
    if (this.freeMove(from, to)) {
      // dentro do continente dominado: move primeiro os que não podem mais cruzar fronteiras
      const fixed = s.armies[from] - (s.movable[from] ?? 0);
      const movedMovable = n - Math.min(n, fixed);
      s.movable[from] = (s.movable[from] ?? 0) - movedMovable;
      s.movable[to] = (s.movable[to] ?? 0) + movedMovable;
    } else {
      s.movable[from] = (s.movable[from] ?? 0) - n;
    }
    s.armies[from] -= n;
    s.armies[to] += n;
    this.log(this.player.name + ' passou ' + n + ' de ' + tName(from) + ' para ' + tName(to) + '.', s.current);
    return true;
  }

  endTurn(): boolean {
    if (this.s.stage !== 'move') return false;
    this.advanceMove();
    return true;
  }

  // ---------------------------------------------------------------- cartas
  drawCard(): Card {
    const shape = this.rng() < 0.12 ? JOKER : SHAPES[Math.floor(this.rng() * SHAPES.length)];
    const territory = TERRITORY_IDS[Math.floor(this.rng() * TERRITORY_IDS.length)];
    return { shape, territory, id: Math.floor(this.rng() * 1e12).toString(36) };
  }

  /** Depois da passagem de todos: 1 carta para cada um que conquistou ao menos 1 território */
  giveCards() {
    const names: string[] = [];
    this.s.players.forEach((pl, i) => {
      if (!pl.alive || !this.s.conquered[i]) return;
      pl.cards.push(this.drawCard());
      names.push(pl.name);
      this.log(pl.name + ' ganhou uma carta.', i);
    });
    this.s.conquered = this.s.players.map(() => false);
    if (names.length) this.event('cards', 'Cartas entregues para: ' + names.join(', '));
  }

  findSet(p: number): Card[] | null {
    const cards = this.s.players[p].cards;
    const jokers = cards.filter((c) => c.shape === JOKER);
    for (const sh of SHAPES) {
      const same = cards.filter((c) => c.shape === sh);
      if (same.length + jokers.length >= 4) {
        return same.slice(0, 4).concat(jokers.slice(0, Math.max(0, 4 - same.length)));
      }
    }
    if (jokers.length >= 4) return jokers.slice(0, 4);
    return null;
  }

  hasValidSet(p: number): boolean {
    return !!this.findSet(p);
  }

  get nextTradeValue(): number {
    return tradeValue(this.s.tradeCount + 1);
  }

  startTradeStage() {
    this.s.stage = 'trade';
    this.s.current = -1;
    this.advanceTrade();
  }

  advanceTrade() {
    this.s.stage = 'trade';
    const p = this.nextAlive(this.s.current, (i) => this.hasValidSet(i));
    if (p === -1) {
      this.s.tradeSub = null;
      return this.startReinforceStage();
    }
    this.s.current = p;
    this.s.tradeSub = 'choose';
  }

  trade(cardIds: string[]): ActionResult {
    const s = this.s;
    if (s.stage !== 'trade' || s.tradeSub !== 'choose') return { ok: false, reason: 'Não é a hora de trocar.' };
    const hand = this.player.cards;
    const cards = cardIds.map((id) => hand.find((c) => c.id === id)).filter((c): c is Card => !!c);
    if (new Set(cardIds).size !== 4 || cards.length !== 4 || !isValidSet(cards)) {
      return { ok: false, reason: 'Escolha 4 cartas do mesmo naipe (o coringa vale por qualquer naipe).' };
    }
    s.tradeCount++;
    const value = tradeValue(s.tradeCount);
    this.player.cards = hand.filter((c) => !cardIds.includes(c.id));
    const bonuses: TerritoryId[] = [];
    for (const c of cards) {
      if (s.owner[c.territory] === s.current) {
        s.armies[c.territory] += 3;
        bonuses.push(c.territory);
      }
    }
    const msg =
      this.player.name + ' trocou cartas (' + s.tradeCount + 'ª troca) e recebeu ' + value + ' exércitos' +
      (bonuses.length ? '; +3 em ' + bonuses.map(tName).join(', ') : '') + '.';
    this.log(msg, s.current);
    this.event('trade', msg, s.current);
    s.tradeSub = 'place';
    this.beginPlacement([{ amount: value, continent: null, label: 'troca de cartas' }]);
    return { ok: true, trade: { value, bonuses } };
  }

  skipTrade(): boolean {
    if (this.s.stage !== 'trade' || this.s.tradeSub !== 'choose') return false;
    this.advanceTrade();
    return true;
  }

  // Cartas de quem foi eliminado: no individual vão todas para quem eliminou; nas equipes,
  // metade (arredondando para cima) para quem eliminou e o resto, sorteado, entre os aliados dele.
  private distributeCardsOnElimination(defender: number) {
    const dp = this.s.players[defender];
    const cards = shuffle(dp.cards, this.rng);
    dp.cards = [];
    if (!cards.length) return;
    const allies = this.alliesOf(defender);
    const toWinner = this.s.teamMode && allies.length ? Math.ceil(cards.length / 2) : cards.length;
    this.player.cards.push(...cards.slice(0, toWinner));
    const got: Record<number, number> = {};
    for (const c of cards.slice(toWinner)) {
      const a = allies[Math.floor(this.rng() * allies.length)];
      this.s.players[a].cards.push(c);
      got[a] = (got[a] ?? 0) + 1;
    }
    const parts = [this.player.name + ' recebeu ' + toWinner + ' carta(s) de ' + dp.name];
    for (const [a, n] of Object.entries(got)) parts.push(this.s.players[Number(a)].name + ' recebeu ' + n);
    this.log(parts.join('; ') + '.', this.s.current);
  }

  // ---------------------------------------------------------------- ações de equipe
  canVassal(id: TerritoryId, ally?: number): { ok: boolean; reason?: string } {
    const s = this.s;
    const no = (reason: string) => ({ ok: false, reason });
    if (!s.teamMode) return no('Só existe vassalagem no modo de equipes.');
    if (s.stage === 'over' || s.current < 0) return no('Partida encerrada.');
    if (!(this.isPlacing() || s.stage === 'move')) return no('A vassalagem só pode ser feita durante a passagem ou a colocação de exércitos.');
    if (!TERRITORIES[id] || s.owner[id] !== s.current) return no('O território não é seu.');
    if (s.vassalOf[id] !== undefined) return no('Esse território já é vassalo: só o dono original pode retomá-lo.');
    if (ally !== undefined && (!s.players[ally] || !this.isAlly(s.current, ally) || !s.players[ally].alive)) return no('Escolha um aliado vivo.');
    const ownLeft = this.territoriesOf(s.current).filter((t) => t !== id && s.vassalOf[t] === undefined).length;
    if (ownLeft < 1) return no('Você precisa manter pelo menos 1 território que não seja vassalo.');
    const pool = this.pool;
    if (
      pool && pool.continent && TERRITORIES[id].continent === pool.continent &&
      !this.territoriesOf(s.current).some((t) => t !== id && TERRITORIES[t].continent === pool.continent)
    ) {
      return no('Você ainda precisa colocar exércitos em ' + cName(pool.continent) + ' e esse é seu último território lá.');
    }
    return { ok: true };
  }

  vassalCandidates(): TerritoryId[] {
    return this.territoriesOf(this.s.current).filter((id) => this.canVassal(id).ok);
  }

  vassal(id: TerritoryId, ally: number): ActionResult {
    const chk = this.canVassal(id, ally);
    if (!chk.ok) return chk;
    const s = this.s;
    const before = s.armies[id];
    s.armies[id] = Math.ceil(before / 2);
    s.owner[id] = ally;
    s.vassalOf[id] = s.current;
    delete s.movable[id];
    this.log(this.player.name + ' declarou ' + tName(id) + ' vassalo de ' + s.players[ally].name + ' (' + before + ' → ' + s.armies[id] + ' exércitos).', s.current);
    return { ok: true };
  }

  canUnvassal(id: TerritoryId): { ok: boolean; reason?: string } {
    const s = this.s;
    if (!s.teamMode || s.stage === 'over' || s.current < 0) return { ok: false, reason: 'Indisponível.' };
    if (!TERRITORIES[id] || s.vassalOf[id] !== s.current) return { ok: false, reason: 'Só o dono original pode retomar o território.' };
    if (s.pending[id]) return { ok: false, reason: 'Indisponível.' };
    if (this.territoriesOf(s.owner[id]).length <= 1) {
      return { ok: false, reason: 'É o último território de ' + s.players[s.owner[id]].name + '; retomá-lo eliminaria seu aliado.' };
    }
    return { ok: true };
  }

  myVassals(): TerritoryId[] {
    return TERRITORY_IDS.filter((id) => this.s.vassalOf[id] === this.s.current);
  }
  unvassalCandidates(): TerritoryId[] {
    return this.myVassals().filter((id) => this.canUnvassal(id).ok);
  }

  unvassal(id: TerritoryId): ActionResult {
    const chk = this.canUnvassal(id);
    if (!chk.ok) return chk;
    const s = this.s;
    const holder = s.owner[id];
    s.owner[id] = s.current;
    delete s.vassalOf[id];
    this.log(this.player.name + ' retomou ' + tName(id) + ' de ' + s.players[holder].name + '.', s.current);
    return { ok: true };
  }

  canSendCard(ally?: number): { ok: boolean; reason?: string } {
    const s = this.s;
    if (!s.teamMode || s.stage === 'over' || s.current < 0) return { ok: false, reason: 'Indisponível.' };
    if (this.player.cards.length < 2) return { ok: false, reason: 'É preciso ter pelo menos 2 cartas (uma é descartada).' };
    if (ally !== undefined && (!s.players[ally] || !this.isAlly(s.current, ally) || !s.players[ally].alive)) return { ok: false, reason: 'Escolha um aliado vivo.' };
    return { ok: true };
  }

  sendCard(cardId: string, ally: number): ActionResult {
    const chk = this.canSendCard(ally);
    if (!chk.ok) return chk;
    const hand = this.player.cards;
    const card = hand.find((c) => c.id === cardId);
    if (!card) return { ok: false, reason: 'Carta não encontrada.' };
    this.player.cards = hand.filter((c) => c !== card);
    this.s.players[ally].cards.push(card);
    const di = Math.floor(this.rng() * this.player.cards.length);
    const discarded = this.player.cards.splice(di, 1)[0];
    this.log(this.player.name + ' enviou uma carta para ' + this.s.players[ally].name + ' e descartou outra.', this.s.current);
    return { ok: true, sentCard: { card, discarded } };
  }

  // ---------------------------------------------------------------- saída de jogadores (online)
  /**
   * Dissolução (jogador desconectado por tempo demais): os territórios vão para os aliados vivos
   * (sem aliados, para os inimigos) e as cartas, sorteadas, metade (para cima) para os aliados e
   * o resto para os inimigos.
   */
  dissolve(p: number): boolean {
    const s = this.s;
    const pl = s.players[p];
    if (!pl || !pl.alive || s.stage === 'over') return false;
    const allies = this.alliesOf(p);
    const enemies = s.players.filter((x) => x.alive && x.index !== p && !this.isAlly(p, x.index)).map((x) => x.index);
    const heirs = allies.length ? allies : enemies;
    this.handOver(p, this.territoriesOf(p), heirs);
    const cards = shuffle(pl.cards, this.rng);
    pl.cards = [];
    const toAllies = allies.length ? Math.ceil(cards.length / 2) : 0;
    cards.forEach((c, i) => {
      const pool = i < toAllies ? allies : enemies.length ? enemies : allies;
      if (pool.length) s.players[pool[Math.floor(this.rng() * pool.length)]].cards.push(c);
    });
    const wasCurrent = s.current === p;
    this.eliminate(p, 'dissolved');
    const msg = pl.name + ' não voltou a tempo: dissolução. Territórios para ' + (allies.length ? 'os aliados' : 'os inimigos') + '.';
    this.log(msg, p);
    this.event('dissolved', msg, p);
    if (!this.checkVictory() && wasCurrent) this.skipCurrent();
    return true;
  }

  surrenderThreshold(team: number): number {
    const alive = this.teamMembers(team).filter((m) => m.alive).length;
    return Math.floor(alive / 2) + 1;
  }

  /** Voto de desistência (metade + 1 da equipe precisa votar). */
  surrenderVote(p: number, vote: boolean): ActionResult {
    const s = this.s;
    const pl = s.players[p];
    if (!pl.alive) return { ok: false, reason: 'Você não está mais na partida.' };
    const team = pl.team;
    const votes = new Set(s.surrenderVotes[team] ?? []);
    if (vote) votes.add(p);
    else votes.delete(p);
    s.surrenderVotes[team] = [...votes];
    const need = this.surrenderThreshold(team);
    this.log(pl.name + (vote ? ' votou pela desistência' : ' retirou o voto de desistência') + ' (' + votes.size + '/' + need + ').', p);
    if (votes.size >= need) {
      this.surrenderTeam(team);
      return { ok: true, surrendered: true };
    }
    return { ok: true };
  }

  /** A equipe desiste: territórios e cartas vão para a equipe inimiga viva com menos territórios. */
  surrenderTeam(team: number) {
    const s = this.s;
    const members = this.teamMembers(team).filter((m) => m.alive).map((m) => m.index);
    const enemyTeams = this.aliveTeams().filter((t) => t !== team);
    if (!enemyTeams.length) return;
    const teamTerr = (t: number) => this.teamMembers(t).reduce((sum, m) => sum + (m.alive ? this.territoryCount(m.index) : 0), 0);
    const minT = Math.min(...enemyTeams.map(teamTerr));
    const weakest = shuffle(enemyTeams.filter((t) => teamTerr(t) === minT), this.rng)[0];
    const heirs = this.teamMembers(weakest).filter((m) => m.alive).map((m) => m.index);
    const territories = members.flatMap((m) => this.territoriesOf(m));
    const cards = shuffle(members.flatMap((m) => s.players[m].cards), this.rng);
    const wasCurrent = members.includes(s.current);
    for (const m of members) {
      s.players[m].cards = [];
      this.eliminate(m, 'surrendered');
    }
    this.handOver(-1, territories, heirs);
    for (const c of cards) s.players[heirs[Math.floor(this.rng() * heirs.length)]].cards.push(c);
    delete s.surrenderVotes[team];
    const who = s.teamMode ? this.teamName(team) : s.players[members[0]].name;
    const to = s.teamMode ? this.teamName(weakest) : s.players[heirs[0]].name;
    const msg = who + ' desistiu. Territórios e cartas foram para ' + to + '.';
    this.log(msg);
    this.event('surrendered', msg, members[0] ?? null);
    if (!this.checkVictory() && wasCurrent) this.skipCurrent();
  }

  /** Reparte territórios entre herdeiros (rodízio, começando por quem tem menos). */
  private handOver(_from: number, territories: TerritoryId[], heirs: number[]) {
    const s = this.s;
    if (!heirs.length) return;
    const order = heirs.slice().sort((a, b) => this.territoriesOf(a).length - this.territoriesOf(b).length);
    shuffle(territories, this.rng).forEach((id, i) => {
      s.owner[id] = order[i % order.length];
      delete s.vassalOf[id];
      delete s.movable[id];
      if (s.pending[id]) delete s.pending[id];
      if (s.armies[id] < 1) s.armies[id] = 1;
    });
  }

  /** O jogador da vez saiu da partida: descarta o que estava fazendo e passa a vez. */
  private skipCurrent() {
    const s = this.s;
    s.pools = [];
    s.poolIndex = 0;
    for (const t of Object.keys(s.pending) as TerritoryId[]) {
      if (s.armies[t] < 1) s.armies[t] = 1;
    }
    s.pending = {};
    switch (s.stage) {
      case 'setup-continent':
        return this.advanceSetupContinent();
      case 'setup-place':
        return this.advanceSetupPlace();
      case 'reinforce-continent':
        return this.advanceReinforceContinent();
      case 'reinforce-territory':
        return this.advanceReinforceTerritory();
      case 'attack':
        return this.advanceAttack();
      case 'move':
        return this.advanceMove();
      case 'trade':
        return this.advanceTrade();
    }
  }
}

// ------------------------------------------------------------------ ajudas

/** Cópia profunda do estado (o motor altera o objeto). */
export function cloneState(state: GameState): GameState {
  return structuredClone(state);
}

/** Estado visto por um jogador: as cartas dos outros ficam ocultas (só a quantidade). */
export function redactState(state: GameState, viewer: number | null): GameState {
  const out = cloneState(state);
  for (const pl of out.players) {
    if (pl.index !== viewer) {
      pl.cardCount = pl.cards.length;
      pl.cards = [];
    }
  }
  return out;
}

/**
 * Modos do jogo online. `players` é o máximo de vagas e `minPlayers` o mínimo para iniciar:
 * no 1x1 (todos contra todos) a partida começa com 2 a 9 jogadores; nas equipes, só com a sala cheia.
 */
export const ONLINE_MODES = {
  '1x1': { label: '1x1', mode: 'solo', minPlayers: 2, players: 9, description: 'todos contra todos, 2 a 9 jogadores' },
  '2x2': { label: '2x2', mode: 'duplas', minPlayers: 4, players: 4, description: '2 duplas' },
  '2x2x2': { label: '2x2x2', mode: 'duplas', minPlayers: 6, players: 6, description: '3 duplas' },
  '2x2x2x2': { label: '2x2x2x2', mode: 'duplas', minPlayers: 8, players: 8, description: '4 duplas' },
  '3x3': { label: '3x3', mode: 'trios', minPlayers: 6, players: 6, description: '2 trios' },
  '3x3x3': { label: '3x3x3', mode: 'trios', minPlayers: 9, players: 9, description: '3 trios' },
  '4x4': { label: '4x4', mode: 'quartetos', minPlayers: 8, players: 8, description: '2 quartetos' },
} as const satisfies Record<string, { label: string; mode: ModeKey; minPlayers: number; players: number; description: string }>;

/** Texto curto com a quantidade de jogadores do modo online ("2 a 9 jogadores", "4 jogadores"). */
export function onlinePlayersText(key: OnlineModeKey): string {
  const m = ONLINE_MODES[key];
  return m.minPlayers === m.players ? `${m.players} jogadores` : `${m.minPlayers} a ${m.players} jogadores`;
}

export type OnlineModeKey = keyof typeof ONLINE_MODES;
export const isOnlineMode = (m: string): m is OnlineModeKey => m in ONLINE_MODES;
