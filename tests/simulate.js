/*
 * Simula partidas com jogadores aleatórios para verificar as regras.
 * Uso: node tests/simulate.js [partidas]
 */
const { Game, tradeValue } = require('../js/game.js');
const { buildAiPrompt, aiPromptFileName } = require('../js/ai-prompt.js');
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

function play(numPlayers, seed, mode) {
  const rng = seeded(seed);
  const pick = (a) => a[Math.floor(rng() * a.length)];
  const g = new Game(numPlayers, rng, { mode: mode || 'solo' });
  if (g.teamMode) {
    // ninguém da mesma equipe joga em turnos seguidos
    for (let i = 1; i < g.players.length; i++) assert.notStrictEqual(g.players[i].team, g.players[i - 1].team);
  }
  // ações de equipe aleatórias (vassalagem, retomada, envio de carta)
  const teamActions = () => {
    if (!g.teamMode || g.stage === 'over') return;
    const allies = g.alliesOf(g.current);
    if (allies.length && rng() < 0.15) {
      const cands = g.vassalCandidates();
      if (cands.length) {
        const id = pick(cands), before = g.armies[id], a = pick(allies);
        assert(g.vassal(id, a).ok);
        assert.strictEqual(g.armies[id], Math.ceil(before / 2));
        assert.strictEqual(g.owner[id], a);
      }
    }
    if (rng() < 0.1) {
      const mine = g.unvassalCandidates();
      if (mine.length) assert(g.unvassal(pick(mine)).ok);
    }
    if (allies.length && g.player.cards.length >= 2 && rng() < 0.1) {
      const n = g.player.cards.length, a = pick(allies), na = g.players[a].cards.length;
      assert(g.sendCard(pick(g.player.cards).id, a).ok);
      assert.strictEqual(g.player.cards.length, n - 2);
      assert.strictEqual(g.players[a].cards.length, na + 1);
    }
  };
  const total = D.territoryIds.length;
  const counts = g.players.map((_, i) => g.territoriesOf(i).length);
  for (let i = 1; i < counts.length; i++) assert(counts[i] <= counts[i - 1]);
  assert(counts[0] - counts[counts.length - 1] <= 1);

  let steps = 0;
  let prevStage = g.stage;
  while (g.stage !== 'over' && steps++ < 200000) {
    // todos atacam antes de qualquer passagem
    assert(!(prevStage === 'move' && g.stage === 'attack'), 'ataque depois da passagem na mesma rodada');
    prevStage = g.stage;
    // o prompt da IA precisa ser gerado em qualquer etapa (em algumas rodadas, para ser rápido)
    if (g.round <= 3 || g.round % 25 === 0) {
      const prompt = buildAiPrompt(g);
      assert(prompt.includes('## Sua ação agora') && !prompt.includes('undefined') && !prompt.includes('null'), 'prompt inválido');
      assert(aiPromptFileName(g).endsWith('.txt'));
    }
    if (g.round > 300) { if (process.env.DEBUG) console.log(g.players.map((p, i) => p.name + ":" + g.territoriesOf(i).length + "/" + g.totalArmies(i) + "/c" + p.cards.length).join(" "), "trocas", g.tradeCount); return { round: g.round, unfinished: true }; }
    if (g.stage === 'reinforce-continent') assert(g.pool && g.pool.continent, 'bônus de continente fora de ordem');
    if (g.stage === 'reinforce-territory') assert(g.pool && !g.pool.continent, 'bônus de território fora de ordem');
    if (g.isPlacing() && g.poolRemaining === g.pool.amount) teamActions();
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
      teamActions();
      // passagem para aliado: chega metade
      const allyMoves = [];
      for (const f of g.territoriesOf(g.current)) for (const t of g.moveTargets(f)) if (g.isAllyMove(f, t)) allyMoves.push([f, t]);
      if (allyMoves.length && rng() < 0.3) {
        const [f, t] = pick(allyMoves), n = g.maxMove(f, t), before = g.armies[t];
        assert(g.move(f, t, n));
        assert.strictEqual(g.armies[t], before + Math.floor(n / 2));
      }
      const from = pick(g.territoriesOf(g.current));
      const targets = g.moveTargets(from);
      if (targets.length) {
        const to = pick(targets);
        assert(g.move(from, to, g.maxMove(from, to)));
      }
      assert(g.endTurn());
    }
    // invariantes
    for (const id of D.territoryIds) {
      if (g.stage === 'attack' && g.owner[id] === g.current) {
        for (const t of g.attackTargets(id)) assert(!g.isAlly(g.current, g.owner[t]), 'ataque a aliado');
      }
      if (g.vassalOf[id] !== undefined) {
        assert(g.isAlly(g.owner[id], g.vassalOf[id]), 'vassalo com quem não é aliado');
        assert(g.players[g.vassalOf[id]].alive, 'vassalo de jogador eliminado');
      }
    }
    g.players.forEach((pl, i) => { if (pl.alive) assert(g.territoriesOf(i).length >= 1); });
    assert.strictEqual(g.players.reduce((a, _, i) => a + g.territoryCount(i), 0), total);
    let sum = 0;
    for (const id of D.territoryIds) {
      assert(g.armies[id] >= 0);
      if (!g.pending[id]) assert(g.armies[id] >= 1, 'território vazio fora da conquista: ' + id);
      sum++;
    }
    assert.strictEqual(sum, total);
  }
  assert.strictEqual(g.stage, 'over', 'partida travou');
  assert(D.territoryIds.every((id) => g.players[g.owner[id]].team === g.winnerTeam));
  return { round: g.round, trades: g.tradeCount };
}

module.exports = play;

if (require.main === module) {
  const n = Number(process.argv[2] || 28);
  let rounds = 0, unfinished = 0;
  const configs = [];
  for (let k = 2; k <= 9; k++) configs.push([k, 'solo']);
  configs.push([4, 'duplas'], [6, 'duplas'], [8, 'duplas'], [6, 'trios'], [9, 'trios'], [8, 'quartetos']);
  for (let i = 0; i < n; i++) {
    const [players, mode] = configs[i % configs.length];
    const r = play(players, 1000 + i, mode);
    if (r.unfinished) unfinished++; else rounds += r.round;
  }
  console.log(`OK: ${n} partidas simuladas, média de ${(rounds / Math.max(1, n - unfinished)).toFixed(1)} rodadas` + (unfinished ? `, ${unfinished} sem vencedor após 300 rodadas` : ''));
}
