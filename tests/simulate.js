/*
 * Simula partidas com jogadores aleatórios para verificar as regras.
 * Uso: node tests/simulate.js [partidas]
 */
const { Game, tradeValue } = require('../js/game.js');
const D = require('../js/data.js');
const assert = require('assert');

// Fronteiras simétricas e todos os territórios alcançáveis
for (const id of D.territoryIds) {
  for (const n of D.territories[id].neighbors) assert(D.territories[n].neighbors.includes(id), id + '-' + n);
}
const seen = new Set(['brasil']);
const queue = ['brasil'];
while (queue.length) for (const n of D.territories[queue.shift()].neighbors) if (!seen.has(n)) { seen.add(n); queue.push(n); }
assert.strictEqual(seen.size, D.territoryIds.length, 'mapa desconexo');
assert.deepStrictEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(tradeValue), [4, 6, 8, 10, 12, 15, 20, 25, 30, 35, 40]);

function seeded(seed) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
}

function play(numPlayers, seed) {
  const rng = seeded(seed);
  const pick = (a) => a[Math.floor(rng() * a.length)];
  const g = new Game(numPlayers, rng);
  const total = D.territoryIds.length;
  const counts = g.players.map((_, i) => g.territoriesOf(i).length);
  for (let i = 1; i < counts.length; i++) assert(counts[i] <= counts[i - 1]);
  assert(counts[0] - counts[counts.length - 1] <= 1);

  let steps = 0;
  while (g.stage !== 'over' && steps++ < 200000) {
    if (g.round > 300) { if (process.env.DEBUG) console.log(g.players.map((p, i) => p.name + ":" + g.territoriesOf(i).length + "/" + g.totalArmies(i) + "/c" + p.cards.length).join(" "), "trocas", g.tradeCount); return { round: g.round, unfinished: true }; }
    if (g.stage === 'reinforce-continent') assert(g.pool && g.pool.continent, 'bônus de continente fora de ordem');
    if (g.stage === 'reinforce-territory') assert(g.pool && !g.pool.continent, 'bônus de território fora de ordem');
    if (g.isPlacing()) {
      const opts = g.territoriesOf(g.current).filter((t) => g.canPlaceOn(t));
      assert(opts.length, 'sem território para colocar');
      const border = opts.filter((t) => D.territories[t].neighbors.some((n) => g.owner[n] !== g.current));
      const target = (border.length ? border : opts).sort((a, b) => g.armies[b] - g.armies[a])[0];
      while (g.poolRemaining > 0) g.place(rng() < 0.8 ? target : pick(opts), 1);
      assert(g.confirmPool());
    } else if (g.stage === 'trade') {
      assert.strictEqual(g.tradeSub, 'choose');
      const set = g.findSet(g.current);
      assert(set);
      const r = g.trade(set.map((c) => c.id));
      assert(r.ok, r.reason);
    } else if (g.stage === 'attack') {
      for (const [to] of Object.entries(g.pending)) {
        const max = g.maxOccupy(to);
        assert(max >= 1, 'não dá para ocupar');
        g.occupy(to, rng() < 0.7 ? max : 1 + Math.floor(rng() * max));
      }
      const sources = g.territoriesOf(g.current).filter((t) => g.canAttackFrom(t) && g.armies[t] > 2);
      let attacked = false;
      for (let k = 0; k < 3000 && sources.length; k++) {
        const s = pick(sources);
        const targets = g.attackTargets(s).filter((t) => g.armies[t] < g.armies[s]);
        if (!targets.length) continue;
        const t = pick(targets);
        if (g.checkAttack(s, t).ok) { g.attack(s, t); attacked = true; }
        if (g.stage === 'over') break;
      }
      if (g.stage === 'over') break;
      if (!attacked || rng() < 0.05) {
        for (const [to] of Object.entries(g.pending)) g.occupy(to, 1);
        assert(g.endAttack());
      }
    } else if (g.stage === 'move') {
      for (const id of g.territoriesOf(g.current)) assert(g.armies[id] >= 1);
      const from = pick(g.territoriesOf(g.current));
      const targets = g.moveTargets(from);
      if (targets.length) {
        const to = pick(targets);
        assert(g.move(from, to, g.maxMove(from, to)));
      }
      assert(g.endTurn());
    }
    // invariantes
    let sum = 0;
    for (const id of D.territoryIds) {
      assert(g.armies[id] >= 0);
      if (!g.pending[id]) assert(g.armies[id] >= 1, 'território vazio fora da conquista: ' + id);
      sum++;
    }
    assert.strictEqual(sum, total);
  }
  assert.strictEqual(g.stage, 'over', 'partida travou');
  assert(D.territoryIds.every((id) => g.owner[id] === g.winner));
  return { round: g.round, trades: g.tradeCount };
}

const n = Number(process.argv[2] || 16);
let rounds = 0, unfinished = 0;
for (let i = 0; i < n; i++) {
  const r = play(2 + (i % 8), 1000 + i);
  if (r.unfinished) unfinished++; else rounds += r.round;
}
console.log(`OK: ${n} partidas simuladas, média de ${(rounds / Math.max(1, n - unfinished)).toFixed(1)} rodadas` + (unfinished ? `, ${unfinished} sem vencedor após 300 rodadas` : ''));
