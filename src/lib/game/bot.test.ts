import { describe, expect, it } from 'vitest';
import { TERRITORIES, TERRITORY_IDS, territoriesOfContinent, type TerritoryId } from './data';
import { Game, type ModeKey } from './engine';
import { botAct, botAction, conquestChance, isBotTurn } from './bot';

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function give(g: Game, id: TerritoryId, p: number, n: number) {
  g.s.owner[id] = p;
  g.s.armies[id] = n;
  delete g.s.vassalOf[id];
}

/** Joga com bots até a partida terminar; falha se alguma ação do bot for recusada. */
function playOut(g: Game, maxSteps = 60000) {
  let steps = 0;
  while (g.stage !== 'over' && steps < maxSteps) {
    const me = g.current;
    const action = botAction(g);
    const r = g.apply(action, me);
    if (!r.ok) throw new Error(`Ação do bot recusada (${action.type}): ${r.reason}`);
    steps++;
  }
  return steps;
}

describe('probabilidades', () => {
  it('casos conhecidos', () => {
    expect(conquestChance(5, 0)).toBe(1);
    expect(conquestChance(1, 1)).toBe(0);
    // 1 dado contra 1 dado, empate da defesa: 15/36
    expect(conquestChance(2, 1)).toBeCloseTo(15 / 36, 10);
    expect(conquestChance(40, 3)).toBeGreaterThan(0.99);
  });

  it('mais atacantes = mais chance; mais defensores = menos chance', () => {
    for (let d = 1; d < 30; d += 3) {
      for (let a = 2; a < 60; a++) expect(conquestChance(a + 1, d)).toBeGreaterThanOrEqual(conquestChance(a, d) - 1e-12);
    }
    for (let a = 2; a < 30; a += 3) {
      for (let d = 1; d < 60; d++) expect(conquestChance(a, d + 1)).toBeLessThanOrEqual(conquestChance(a, d) + 1e-12);
    }
    // valores grandes são aproximados por escala
    expect(conquestChance(400, 100)).toBeGreaterThan(conquestChance(200, 200));
  });
});

describe('partidas só com bots', () => {
  const configs: [number, ModeKey][] = [
    [2, 'solo'],
    [5, 'solo'],
    [9, 'solo'],
    [4, 'duplas'],
    [6, 'trios'],
    [8, 'quartetos'],
  ];
  for (const [n, mode] of configs) {
    it(`${mode} com ${n}: terminam e nenhuma jogada é recusada`, () => {
      for (const seed of [1, 2]) {
        const g = Game.create(n, { mode, rng: seeded(seed * 1000 + n), bots: Array(n).fill(true) });
        expect(g.s.players.every((p) => p.bot && p.name.startsWith('Bot '))).toBe(true);
        playOut(g);
        expect(g.stage).toBe('over');
        expect(g.s.round).toBeLessThan(120);
      }
    });
  }
});

describe('decisões do bot', () => {
  it('bônus de continente fica no continente', () => {
    for (let seed = 1; seed < 40; seed++) {
      const g = Game.create(3, { rng: seeded(seed), bots: [true, true, true] });
      if (g.stage !== 'setup-continent') continue;
      const action = botAction(g);
      expect(action.type).toBe('place');
      if (action.type !== 'place') return;
      const c = g.pool!.continent!;
      for (const [id, n] of Object.entries(action.placements) as [TerritoryId, number][]) {
        if (n) expect(TERRITORIES[id].continent).toBe(c);
      }
      expect(g.apply(action, g.current).ok).toBe(true);
      return;
    }
    throw new Error('nenhuma partida começou com continente');
  });

  it('reforça a fronteira ameaçada e o ataque que completa continente', () => {
    const g = Game.create(2, { rng: seeded(7), bots: [true, true] });
    // jogador 0 tem a Oceania menos 1 território; o resto é do jogador 1
    for (const id of TERRITORY_IDS) give(g, id, 1, 2);
    const oce = territoriesOfContinent('oc');
    const [missing, ...owned] = oce;
    for (const id of owned) give(g, id, 0, 1);
    give(g, missing, 1, 1);
    g.s.stage = 'reinforce-territory';
    g.s.current = 0;
    g.beginPlacement([{ amount: 6, continent: null, label: 'teste' }]);
    const action = botAction(g);
    expect(action.type).toBe('place');
    if (action.type !== 'place') return;
    const placedNextToMissing = (Object.entries(action.placements) as [TerritoryId, number][])
      .filter(([id]) => TERRITORIES[id].neighbors.includes(missing))
      .reduce((sum, [, n]) => sum + n, 0);
    expect(placedNextToMissing).toBeGreaterThan(0);
  });

  it('ataca para ganhar a carta e ocupa o conquistado', () => {
    const g = Game.create(2, { rng: seeded(3), bots: [true, true] });
    for (const id of TERRITORY_IDS) give(g, id, 1, 3);
    give(g, 'brasil', 0, 12);
    give(g, 'argentina', 1, 1);
    g.s.stage = 'attack';
    g.s.current = 0;
    g.s.pools = [];
    g.s.conquered = [false, false];
    const action = botAction(g);
    expect(action).toMatchObject({ type: 'attack', from: 'brasil', blitz: true });
    let guard = 0;
    while (g.stage === 'attack' && g.current === 0 && guard++ < 50) botAct(g);
    expect(g.s.conquered[0] || g.stage !== 'attack' || g.current !== 0).toBe(true);
    expect(Object.keys(g.s.pending)).toHaveLength(0);
  });

  it('passagem leva exércitos do interior para a fronteira', () => {
    const g = Game.create(2, { rng: seeded(5), bots: [true, true] });
    for (const id of TERRITORY_IDS) give(g, id, 1, 2);
    // América do Sul inteira do jogador 0, com exércitos parados longe da fronteira
    const sa = territoriesOfContinent('sa');
    for (const id of sa) give(g, id, 0, 1);
    const interior = sa.find((id) => TERRITORIES[id].neighbors.every((n) => TERRITORIES[n].continent === 'sa'))!;
    give(g, interior, 0, 9);
    g.s.pools = [];
    g.s.stage = 'move';
    g.s.current = 0;
    g.s.movable = {};
    for (const id of g.territoriesOf(0)) g.s.movable[id] = g.s.armies[id];
    const action = botAction(g);
    expect(action).toMatchObject({ type: 'move', from: interior, n: 8 });
    if (action.type !== 'move') return;
    expect(TERRITORIES[action.to].neighbors.some((n) => g.s.owner[n] === 1)).toBe(true);
  });

  it('troca cartas preferindo territórios próprios', () => {
    const g = Game.create(2, { rng: seeded(9), bots: [true, true] });
    const mine = g.territoriesOf(0)[0];
    const other = g.territoriesOf(1)[0];
    g.s.players[0].cards = [
      { id: 'a', shape: 'circulo', territory: other },
      { id: 'b', shape: 'circulo', territory: other },
      { id: 'c', shape: 'circulo', territory: other },
      { id: 'd', shape: 'circulo', territory: other },
      { id: 'e', shape: 'circulo', territory: mine },
      { id: 'f', shape: 'coringa', territory: other },
    ];
    g.s.stage = 'trade';
    g.s.current = 0;
    g.s.pools = [];
    g.s.tradeSub = 'choose';
    const action = botAction(g);
    expect(action.type).toBe('trade');
    if (action.type !== 'trade') return;
    expect(action.cardIds).toContain('e');
    expect(action.cardIds).not.toContain('f');
  });
});

describe('bots na partida', () => {
  it('posição dos bots é sorteada e o nome indica o bot', () => {
    const seen = new Set<number>();
    for (let seed = 1; seed < 30; seed++) {
      const g = Game.create(4, { rng: seeded(seed), bots: [false, true, true, true] });
      const humans = g.s.players.filter((p) => !p.bot);
      expect(humans).toHaveLength(1);
      expect(humans[0].name.startsWith('Bot')).toBe(false);
      seen.add(humans[0].index);
    }
    expect(seen.size).toBeGreaterThan(2);
  });

  it('nomes e equipes informados (online)', () => {
    const names = ['ana', 'Bot Napoleão', 'bia', 'Bot Ciro'];
    const g = Game.create(4, { mode: 'duplas', names, bots: [false, true, false, true], teams: [0, 0, 1, 1], rng: seeded(4) });
    for (const p of g.s.players) {
      expect(!!p.bot).toBe(p.name.startsWith('Bot '));
      expect(p.team).toBe(names.indexOf(p.name) < 2 ? 0 : 1);
    }
  });

  it('desistência: bots não votam e acompanham os humanos da equipe', () => {
    const g = Game.create(4, { mode: 'duplas', names: ['ana', 'b1', 'bia', 'b2'], bots: [false, true, false, true], teams: [0, 0, 1, 1], rng: seeded(2) });
    const ana = g.s.players.find((p) => p.name === 'ana')!;
    const bot = g.s.players.find((p) => p.name === 'b1')!;
    expect(g.surrenderThreshold(ana.team)).toBe(1);
    expect(g.apply({ type: 'surrenderVote', vote: true }, bot.index).ok).toBe(false);
    const r = g.apply({ type: 'surrenderVote', vote: true }, ana.index);
    expect(r.surrendered).toBe(true);
    expect(bot.alive).toBe(false);
    expect(g.stage).toBe('over');
  });

  it('isBotTurn', () => {
    const g = Game.create(2, { rng: seeded(1), bots: [true, false] });
    expect(isBotTurn(g)).toBe(!!g.player.bot);
  });
});
