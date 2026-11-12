import { describe, expect, it } from 'vitest';
import { TERRITORIES, TERRITORY_IDS, CONTINENTS, type TerritoryId } from './data';
import { Game, MODES, tradeValue, redactState, cloneState, type GameState } from './engine';
import { buildAiPrompt } from './aiPrompt';

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/** Coloca todos os exércitos de uma vez no primeiro território válido. */
function placeFirst(g: Game) {
  const t = TERRITORY_IDS.find((x) => g.canPlaceOn(x))!;
  const r = g.apply({ type: 'place', placements: { [t]: g.pool!.amount } }, g.current);
  expect(r.ok).toBe(true);
}

function toAttack(g: Game) {
  while (g.isPlacing()) placeFirst(g);
  expect(g.stage).toBe('attack');
}

function give(g: Game, id: TerritoryId, p: number, n: number) {
  g.s.owner[id] = p;
  g.s.armies[id] = n;
  delete g.s.vassalOf[id];
}

describe('dados do mapa', () => {
  it('fronteiras são simétricas e o mapa é conexo', () => {
    for (const id of TERRITORY_IDS) {
      for (const n of TERRITORIES[id].neighbors) expect(TERRITORIES[n].neighbors).toContain(id);
    }
    const seen = new Set<TerritoryId>(['brasil']);
    const queue: TerritoryId[] = ['brasil'];
    while (queue.length) {
      for (const n of TERRITORIES[queue.shift()!].neighbors) {
        if (!seen.has(n)) {
          seen.add(n);
          queue.push(n);
        }
      }
    }
    expect(seen.size).toBe(TERRITORY_IDS.length);
  });

  it('Arctogea junta Ártico e Antártida com bônus 1', () => {
    expect(CONTINENTS.ag).toMatchObject({ name: 'Arctogea', bonus: 1 });
    expect(TERRITORIES.artico.continent).toBe('ag');
    expect(TERRITORIES.antartida.continent).toBe('ag');
  });

  it('valores de troca', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(tradeValue)).toEqual([4, 6, 8, 10, 12, 15, 20, 25, 30, 35, 40]);
  });
});

describe('regras básicas', () => {
  it('divide os territórios e dá o resto aos primeiros', () => {
    const g = Game.create(3, { rng: seeded(1) });
    const counts = g.s.players.map((_, i) => g.territoriesOf(i).length);
    expect(counts.reduce((a, b) => a + b)).toBe(79);
    expect(counts).toEqual([27, 26, 26]);
  });

  it('todos atacam antes de qualquer passagem', () => {
    const g = Game.create(3, { rng: seeded(2) });
    toAttack(g);
    const seq: string[] = [];
    const st = (): string => g.stage;
    while (st() === 'attack' || st() === 'move') {
      seq.push(g.stage + g.current);
      if (g.stage === 'attack') g.apply({ type: 'endAttack' }, g.current);
      else g.apply({ type: 'endMove' }, g.current);
    }
    expect(seq.slice(0, 3)).toEqual(['attack0', 'attack1', 'attack2']);
    expect(seq.slice(3).every((x) => x.startsWith('move'))).toBe(true);
  });

  it('só o jogador da vez age', () => {
    const g = Game.create(2, { rng: seeded(3) });
    const other = 1 - g.current;
    expect(g.apply({ type: 'place', placements: {} }, other).ok).toBe(false);
  });

  it('colocação exige a soma exata e territórios válidos', () => {
    const g = Game.create(2, { rng: seeded(4) });
    while (g.stage === 'setup-continent') placeFirst(g);
    const mine = g.territoriesOf(g.current);
    const amount = g.pool!.amount;
    expect(g.apply({ type: 'place', placements: { [mine[0]]: amount - 1 } }, g.current).ok).toBe(false);
    const enemy = TERRITORY_IDS.find((t) => g.s.owner[t] !== g.current)!;
    expect(g.apply({ type: 'place', placements: { [enemy]: amount } }, g.current).ok).toBe(false);
    expect(g.apply({ type: 'place', placements: { [mine[0]]: amount } }, g.current).ok).toBe(true);
  });

  it('reforços: todos os bônus de continente antes dos bônus de territórios', () => {
    const g = Game.create(2, { rng: seeded(5) });
    toAttack(g);
    for (const id of TERRITORY_IDS) {
      if (TERRITORIES[id].continent === 'sa') g.s.owner[id] = 0;
      if (TERRITORIES[id].continent === 'oc') g.s.owner[id] = 1;
    }
    while (g.stage === 'attack' || g.stage === 'move') {
      g.apply({ type: g.stage === 'attack' ? 'endAttack' : 'endMove' }, g.current);
    }
    const seq: string[] = [];
    const st = (): string => g.stage;
    while (st() !== 'attack') {
      if (st() === 'trade') {
        g.apply({ type: 'skipTrade' }, g.current);
        continue;
      }
      seq.push(g.stage + ':' + (g.pool!.continent ?? 'any'));
      placeFirst(g);
    }
    const firstTerritory = seq.findIndex((x) => x.startsWith('reinforce-territory'));
    expect(seq.slice(0, firstTerritory).every((x) => x.startsWith('reinforce-continent'))).toBe(true);
    expect(seq.slice(firstTerritory).every((x) => x.startsWith('reinforce-territory'))).toBe(true);
  });
});

describe('modos de equipe', () => {
  it('quantidades e ordem alternada', () => {
    expect(MODES.duplas.counts).toEqual([4, 6, 8]);
    expect(() => Game.create(5, { mode: 'duplas' })).toThrow();
    for (const [n, mode, teams] of [[4, 'duplas', 2], [6, 'duplas', 3], [8, 'duplas', 4], [6, 'trios', 2], [9, 'trios', 3], [8, 'quartetos', 2]] as const) {
      const g = Game.create(n, { mode, rng: seeded(n) });
      expect(g.s.numTeams).toBe(teams);
      expect(g.s.players.map((p) => p.team)).toEqual(Array.from({ length: n }, (_, i) => i % teams));
    }
  });

  it('aliados não se atacam e passagem para aliado chega pela metade', () => {
    const g = Game.create(4, { mode: 'duplas', rng: seeded(6) });
    toAttack(g);
    const me = g.current;
    const ally = g.alliesOf(me)[0];
    give(g, 'brasil', me, 8);
    give(g, 'argentina', ally, 2);
    expect(g.attackTargets('brasil')).not.toContain('argentina');
    expect(g.checkAttack('brasil', 'argentina').ok).toBe(false);
    while (g.stage === 'attack') g.apply({ type: 'endAttack' }, g.current);
    while (g.stage === 'move' && g.current !== me) g.apply({ type: 'endMove' }, g.current);
    expect(g.maxMove('brasil', 'argentina')).toBe(7);
    expect(g.apply({ type: 'move', from: 'brasil', to: 'argentina', n: 7 }, me).ok).toBe(true);
    expect(g.s.armies.argentina).toBe(5);
  });

  it('vassalagem e retomada', () => {
    const g = Game.create(4, { mode: 'duplas', rng: seeded(7) });
    const me = g.current;
    const ally = g.alliesOf(me)[0];
    const id = g.territoriesOf(me)[0];
    g.s.armies[id] = 5;
    expect(g.apply({ type: 'vassal', territory: id, ally }, me).ok).toBe(true);
    expect(g.s.owner[id]).toBe(ally);
    expect(g.s.armies[id]).toBe(3);
    expect(g.territoryCount(me)).toBeGreaterThan(g.territoriesOf(me).length);
    expect(g.apply({ type: 'unvassal', territory: id }, me).ok).toBe(true);
    expect(g.s.owner[id]).toBe(me);
    expect(g.s.armies[id]).toBe(3);
  });

  it('enviar carta descarta outra', () => {
    const g = Game.create(4, { mode: 'duplas', rng: seeded(8) });
    toAttack(g);
    const me = g.current;
    const ally = g.alliesOf(me)[0];
    g.s.players[me].cards = [{ shape: 'estrela', territory: 'brasil', id: 'x' }];
    expect(g.apply({ type: 'sendCard', cardId: 'x', ally }, me).ok).toBe(false);
    g.s.players[me].cards.push({ shape: 'circulo', territory: 'peru', id: 'y' }, { shape: 'quadrado', territory: 'chile', id: 'z' });
    const r = g.apply({ type: 'sendCard', cardId: 'x', ally }, me);
    expect(r.ok).toBe(true);
    expect(r.sentCard!.discarded.id).not.toBe('x');
    expect(g.s.players[me].cards).toHaveLength(1);
  });

  it('eliminação divide cartas e a equipe vence', () => {
    const g = Game.create(4, { mode: 'duplas', rng: seeded(9) });
    toAttack(g);
    const me = g.current;
    const [e1, e2] = g.s.players.filter((p) => p.team !== g.s.players[me].team).map((p) => p.index);
    for (const t of TERRITORY_IDS) give(g, t, me, 1);
    give(g, 'brasil', me, 300);
    give(g, 'bolivia', me, 300);
    give(g, 'peru', e1, 1);
    give(g, 'chile', e2, 1);
    g.s.players[e1].cards = Array.from({ length: 5 }, (_, i) => ({ shape: 'estrela' as const, territory: 'brasil' as const, id: 'c' + i }));
    g.s.players[me].cards = [];
    let guard = 0;
    while (g.s.owner.peru !== me && guard++ < 500) g.apply({ type: 'attack', from: 'brasil', to: 'peru' }, me);
    expect(g.s.players[e1].alive).toBe(false);
    expect(g.s.players[me].cards).toHaveLength(3);
    expect(g.s.players[e2].cards).toHaveLength(2);
    g.apply({ type: 'occupy', to: 'peru', n: 1 }, me);
    expect(g.apply({ type: 'attack', from: 'bolivia', to: 'chile', blitz: true }, me).ok).toBe(true);
    expect(g.stage).toBe('over');
    expect(g.s.winnerTeam).toBe(g.s.players[me].team);
  });
});

describe('dissolução e desistência', () => {
  it('dissolução passa territórios aos aliados e divide as cartas', () => {
    const g = Game.create(4, { mode: 'duplas', rng: seeded(10) });
    toAttack(g);
    const p = 1;
    const ally = g.alliesOf(p)[0];
    const terr = g.territoriesOf(p);
    g.s.players[p].cards = Array.from({ length: 4 }, (_, i) => ({ shape: 'circulo' as const, territory: 'peru' as const, id: 'd' + i }));
    const before = g.s.players.map((pl) => pl.cards.length);
    expect(g.dissolve(p)).toBe(true);
    expect(g.s.players[p].status).toBe('dissolved');
    for (const t of terr) expect(g.s.owner[t]).toBe(ally);
    const allyGain = g.s.players[ally].cards.length - before[ally];
    const enemyGain = g.s.players.filter((pl) => pl.team !== g.s.players[p].team).reduce((a, pl) => a + pl.cards.length - before[pl.index], 0);
    expect(allyGain).toBe(2);
    expect(enemyGain).toBe(2);
  });

  it('dissolução do jogador da vez passa a vez', () => {
    const g = Game.create(4, { mode: 'duplas', rng: seeded(11) });
    toAttack(g);
    const cur = g.current;
    g.dissolve(cur);
    expect(g.current).not.toBe(cur);
    expect(g.s.players[g.current].alive).toBe(true);
  });

  it('1x1: dissolução dá a vitória ao outro', () => {
    const g = Game.create(2, { rng: seeded(12) });
    g.dissolve(0);
    expect(g.stage).toBe('over');
    expect(g.s.winner).toBe(1);
    expect(TERRITORY_IDS.every((t) => g.s.owner[t] === 1)).toBe(true);
  });

  it('desistência precisa de metade + 1 da equipe e vai para a equipe mais fraca', () => {
    const g = Game.create(6, { mode: 'duplas', rng: seeded(13) }); // 3 duplas
    toAttack(g);
    const team = g.s.players[0].team;
    const [a, b] = g.teamMembers(team).map((m) => m.index);
    expect(g.surrenderThreshold(team)).toBe(2);
    // deixa a equipe 2 claramente mais fraca
    const weakTeam = [0, 1, 2].find((t) => t !== team && t !== g.s.players.find((pl) => pl.team !== team)!.team) ?? 2;
    const otherTeam = [0, 1, 2].find((t) => t !== team && t !== weakTeam)!;
    const weakMembers = g.teamMembers(weakTeam).map((m) => m.index);
    const strong = g.teamMembers(otherTeam).map((m) => m.index);
    for (const id of TERRITORY_IDS) {
      if (weakMembers.includes(g.s.owner[id])) give(g, id, strong[0], 1);
    }
    give(g, 'peru', weakMembers[0], 1);
    give(g, 'chile', weakMembers[1], 1);
    const terr = [...g.territoriesOf(a), ...g.territoriesOf(b)];
    expect(g.apply({ type: 'surrenderVote', vote: true }, a).surrendered).toBeFalsy();
    const r = g.apply({ type: 'surrenderVote', vote: true }, b);
    expect(r.surrendered).toBe(true);
    for (const t of terr) expect(weakMembers).toContain(g.s.owner[t]);
    expect(g.s.players[a].status).toBe('surrendered');
  });

  it('voto pode ser retirado', () => {
    const g = Game.create(8, { mode: 'quartetos', rng: seeded(14) });
    const team = g.s.players[0].team;
    expect(g.surrenderThreshold(team)).toBe(3);
    g.apply({ type: 'surrenderVote', vote: true }, 0);
    g.apply({ type: 'surrenderVote', vote: false }, 0);
    expect(g.s.surrenderVotes[team]).toEqual([]);
  });
});

describe('estado serializável', () => {
  it('sobrevive a JSON e oculta as cartas dos outros', () => {
    const g = Game.create(4, { mode: 'duplas', rng: seeded(15) });
    g.s.players[1].cards = [{ shape: 'estrela', territory: 'brasil', id: 'q' }];
    const json = JSON.parse(JSON.stringify(g.toState())) as GameState;
    const g2 = Game.load(json);
    expect(g2.territoryCount(0)).toBe(g.territoryCount(0));
    const red = redactState(g.toState(), 0);
    expect(red.players[1].cards).toEqual([]);
    expect(red.players[1].cardCount).toBe(1);
    expect(g.s.players[1].cards).toHaveLength(1);
  });
});

// Partidas completas com jogadores aleatórios: confere invariantes a cada passo.
function simulate(numPlayers: number, seed: number, mode: 'solo' | 'duplas' | 'trios' | 'quartetos') {
  const rng = seeded(seed);
  const pick = <T,>(a: T[]) => a[Math.floor(rng() * a.length)];
  const g = Game.create(numPlayers, { mode, rng });
  const over = (): boolean => g.stage === 'over';
  let steps = 0;
  while (g.stage !== 'over' && steps++ < 20000 && g.s.round <= 40) {
    const cur = g.current;
    if (g.isPlacing()) {
      if (g.s.teamMode && rng() < 0.1) {
        const c = g.vassalCandidates();
        const allies = g.alliesOf(cur);
        if (c.length && allies.length) expect(g.apply({ type: 'vassal', territory: pick(c), ally: pick(allies) }, cur).ok).toBe(true);
      }
      const opts = TERRITORY_IDS.filter((t) => g.canPlaceOn(t));
      expect(opts.length).toBeGreaterThan(0);
      const placements: Record<string, number> = {};
      for (let i = 0; i < g.pool!.amount; i++) {
        const t = pick(opts);
        placements[t] = (placements[t] ?? 0) + 1;
      }
      expect(g.apply({ type: 'place', placements }, cur).ok).toBe(true);
    } else if (g.stage === 'trade') {
      const set = g.findSet(cur)!;
      expect(g.apply({ type: 'trade', cardIds: set.map((c) => c.id) }, cur).ok).toBe(true);
    } else if (g.stage === 'attack') {
      for (let k = 0; k < 30 && g.stage === 'attack'; k++) {
        for (const to of Object.keys(g.s.pending) as TerritoryId[]) g.apply({ type: 'occupy', to, n: Math.max(1, g.maxOccupy(to)) }, cur);
        const sources = g.territoriesOf(cur).filter((t) => g.canAttackFrom(t) && g.s.armies[t] > 2);
        if (!sources.length) break;
        const from = pick(sources);
        const targets = g.attackTargets(from).filter((t) => g.s.armies[t] < g.s.armies[from]);
        if (targets.length) g.apply({ type: 'attack', from, to: pick(targets), blitz: rng() < 0.5 }, cur);
      }
      if (g.stage !== 'attack') break;
      for (const to of Object.keys(g.s.pending) as TerritoryId[]) g.apply({ type: 'occupy', to, n: 1 }, cur);
      expect(g.apply({ type: 'endAttack' }, cur).ok).toBe(true);
    } else if (g.stage === 'move') {
      const from = pick(g.territoriesOf(cur));
      const targets = g.moveTargets(from);
      if (targets.length) {
        const to = pick(targets);
        expect(g.apply({ type: 'move', from, to, n: g.maxMove(from, to) }, cur).ok).toBe(true);
      }
      expect(g.apply({ type: 'endMove' }, cur).ok).toBe(true);
    }
    if (rng() < 0.002) g.dissolve(pick(g.s.players.filter((p) => p.alive)).index);
    // invariantes
    for (const id of TERRITORY_IDS) {
      expect(g.s.armies[id]).toBeGreaterThanOrEqual(g.s.pending[id] ? 0 : 1);
      const v = g.s.vassalOf[id];
      if (v !== undefined) expect(g.isAlly(g.s.owner[id], v)).toBe(true);
      if (!over()) expect(g.s.players[g.s.owner[id]].alive).toBe(true);
    }
    if (!over()) expect(g.s.players[g.current].alive).toBe(true);
    expect(JSON.parse(JSON.stringify(g.s))).toBeTruthy();
    if (g.s.round <= 2) expect(buildAiPrompt(cloneState(g.s))).not.toMatch(/undefined|null/);
  }
}

describe('simulação', () => {
  const configs = [[2, 'solo'], [3, 'solo'], [5, 'solo'], [9, 'solo'], [4, 'duplas'], [6, 'duplas'], [8, 'duplas'], [6, 'trios'], [9, 'trios'], [8, 'quartetos']] as const;
  for (const [n, mode] of configs) {
    it(`${mode} com ${n} jogadores`, () => simulate(n, 100 + n, mode));
  }
});
