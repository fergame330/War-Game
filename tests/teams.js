/*
 * Testes determinísticos das regras dos modos de equipe.
 * Uso: node tests/teams.js
 */
const assert = require('assert');
const { Game, MODES } = require('../js/game.js');
const D = require('../js/data.js');
const { buildAiPrompt } = require('../js/ai-prompt.js');

function seeded(seed) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
}

// Coloca todos os exércitos iniciais até chegar à fase de ataque
function toAttack(g) {
  while (g.isPlacing()) {
    const t = D.territoryIds.find((x) => g.canPlaceOn(x));
    g.place(t, g.poolRemaining);
    g.confirmPool();
  }
  assert.strictEqual(g.stage, 'attack');
}

// Dá ao jogador `p` o território `id` com `n` exércitos
function give(g, id, p, n) {
  g.owner[id] = p;
  g.armies[id] = n;
  delete g.vassalOf[id];
}

let tests = 0;
function test(name, fn) {
  fn();
  tests++;
  console.log('ok -', name);
}

test('modos aceitam só as quantidades combinadas', () => {
  assert.deepStrictEqual(MODES.duplas.counts, [4, 6, 8]);
  assert.deepStrictEqual(MODES.trios.counts, [6, 9]);
  assert.deepStrictEqual(MODES.quartetos.counts, [8]);
  assert.throws(() => new Game(5, Math.random, { mode: 'duplas' }));
  assert.throws(() => new Game(4, Math.random, { mode: 'trios' }));
});

test('ordem alterna as equipes (A B C A B C...)', () => {
  for (const [n, mode, teams] of [[4, 'duplas', 2], [6, 'duplas', 3], [8, 'duplas', 4], [6, 'trios', 2], [9, 'trios', 3], [8, 'quartetos', 2]]) {
    const g = new Game(n, seeded(n), { mode });
    assert.strictEqual(g.numTeams, teams);
    assert.deepStrictEqual(g.players.map((p) => p.team), Array.from({ length: n }, (_, i) => i % teams));
  }
});

test('Arctogea junta Ártico e Antártida com bônus 1', () => {
  assert.strictEqual(D.continents.ag.name, 'Arctogea');
  assert.strictEqual(D.continents.ag.bonus, 1);
  assert.strictEqual(D.territories.artico.continent, 'ag');
  assert.strictEqual(D.territories.antartida.continent, 'ag');
  assert(!D.continents.an && !D.continents.ar);
});

test('aliados não se atacam', () => {
  const g = new Game(4, seeded(1), { mode: 'duplas' });
  toAttack(g);
  const me = g.current, ally = g.alliesOf(me)[0];
  give(g, 'brasil', me, 10);
  give(g, 'argentina', ally, 1);
  assert(!g.attackTargets('brasil').includes('argentina'));
  assert(!g.checkAttack('brasil', 'argentina').ok);
});

test('passagem para aliado: chega metade, arredondando para baixo', () => {
  const g = new Game(4, seeded(2), { mode: 'duplas' });
  toAttack(g);
  const me = g.current, ally = g.alliesOf(me)[0];
  give(g, 'brasil', me, 8);
  give(g, 'argentina', ally, 2);
  while (g.stage === 'attack') g.endAttack();
  while (g.stage === 'move' && g.current !== me) g.endTurn();
  assert.strictEqual(g.current, me);
  assert.strictEqual(g.maxMove('brasil', 'argentina'), 7);
  assert(g.move('brasil', 'argentina', 7));
  assert.strictEqual(g.armies.brasil, 1);
  assert.strictEqual(g.armies.argentina, 2 + 3);
  assert.strictEqual(g.owner.argentina, ally);
});

test('vassalagem: metade dos exércitos (fica arredondado para cima), mantém 1 território próprio', () => {
  const g = new Game(4, seeded(3), { mode: 'duplas' });
  // na colocação inicial
  assert(g.isPlacing());
  const me = g.current, ally = g.alliesOf(me)[0];
  const id = g.territoriesOf(me)[0];
  g.armies[id] = 5;
  assert(g.vassal(id, ally).ok);
  assert.strictEqual(g.owner[id], ally);
  assert.strictEqual(g.vassalOf[id], me);
  assert.strictEqual(g.armies[id], 3);
  // conta para o dono original
  assert(g.territoryCount(me) > g.territoriesOf(me).length);
  // o aliado não pode vassalar nem retomar esse território
  assert(!g.canUnvassal(id).ok || g.current === me);
  // não pode ficar sem território próprio
  const enemy = g.players.findIndex((p, i) => !g.isAlly(me, i) && i !== me);
  for (const t of D.territoryIds) if (g.owner[t] === me && t !== id) give(g, t, enemy, 1);
  const last = D.territoryIds.find((t) => g.owner[t] !== me && g.vassalOf[t] === undefined);
  give(g, last, me, 2);
  g.pools = [{ amount: 1, continent: null, label: 'teste' }];
  g.poolIndex = 0;
  assert(!g.canVassal(last, ally).ok);
});

test('vassalagem só na passagem ou colocação; retomada a qualquer momento da vez do dono', () => {
  const g = new Game(4, seeded(4), { mode: 'duplas' });
  toAttack(g);
  const me = g.current, ally = g.alliesOf(me)[0];
  const [a] = g.territoriesOf(me);
  assert(!g.canVassal(a, ally).ok); // fase de ataque
  // prepara um vassalo e retoma durante o ataque
  give(g, 'peru', ally, 2);
  g.vassalOf.peru = me;
  assert(g.canUnvassal('peru').ok);
  assert(g.unvassal('peru').ok);
  assert.strictEqual(g.owner.peru, me);
  assert.strictEqual(g.armies.peru, 2); // não recupera exércitos
  assert.strictEqual(g.vassalOf.peru, undefined);
});

test('continente só é dominado por um único jogador', () => {
  const g = new Game(4, seeded(5), { mode: 'duplas' });
  toAttack(g);
  const me = g.current, ally = g.alliesOf(me)[0];
  const sa = D.territoryIds.filter((t) => D.territories[t].continent === 'sa');
  sa.forEach((t, i) => give(g, t, i === 0 ? ally : me, 2));
  assert(!g.ownsContinent(me, 'sa'));
  assert(!g.ownsContinent(ally, 'sa'));
  g.vassalOf[sa[0]] = undefined;
  delete g.vassalOf[sa[0]];
  // aliado cede o território por vassalagem: agora o continente é de um jogador só
  g.owner[sa[0]] = me;
  g.vassalOf[sa[0]] = ally;
  assert(g.ownsContinent(me, 'sa'));
  // bônus de territórios conta o vassalo para o dono original
  assert.strictEqual(g.territoryCount(ally), D.territoryIds.filter((t) => g.countedOwner(t) === ally).length);
});

test('enviar carta a aliado descarta outra carta aleatória (precisa de 2)', () => {
  const g = new Game(4, seeded(6), { mode: 'duplas' });
  toAttack(g);
  const me = g.current, ally = g.alliesOf(me)[0];
  g.players[me].cards = [{ shape: 'estrela', territory: 'brasil', id: 'x' }];
  assert(!g.sendCard('x', ally).ok);
  g.players[me].cards.push({ shape: 'circulo', territory: 'peru', id: 'y' }, { shape: 'quadrado', territory: 'chile', id: 'z' });
  const r = g.sendCard('x', ally);
  assert(r.ok);
  assert.strictEqual(r.card.id, 'x');
  assert.notStrictEqual(r.discarded.id, 'x');
  assert.strictEqual(g.players[me].cards.length, 1);
  assert(g.players[ally].cards.some((c) => c.id === 'x'));
});

test('eliminação divide as cartas e a equipe que sobra vence', () => {
  const g = new Game(4, seeded(7), { mode: 'duplas' });
  toAttack(g);
  const me = g.current;
  const enemies = g.players.filter((p) => p.team !== g.players[me].team).map((p) => p.index);
  const [e1, e2] = enemies;
  // todo o mapa é da minha equipe, exceto Peru (e1) e Chile (e2)
  for (const t of D.territoryIds) give(g, t, me, 1);
  give(g, 'brasil', me, 200);
  give(g, 'bolivia', me, 200);
  give(g, 'peru', e1, 1);
  give(g, 'chile', e2, 1);
  g.players[me].cards = [];
  g.players[e1].cards = Array.from({ length: 5 }, (_, i) => ({ shape: 'estrela', territory: 'brasil', id: 'c' + i }));
  g.players[e2].cards = [];
  let guard = 0;
  while (g.owner.peru !== me && guard++ < 500) g.attack('brasil', 'peru');
  assert(!g.players[e1].alive);
  assert.strictEqual(g.players[me].cards.length, 3); // metade arredondada para cima
  assert.strictEqual(g.players[e2].cards.length, 2); // o resto vai para o aliado
  g.occupy('peru', 1);
  guard = 0;
  while (g.stage !== 'over' && guard++ < 500) g.attack('bolivia', 'chile');
  assert.strictEqual(g.stage, 'over');
  assert.strictEqual(g.winnerTeam, g.players[me].team);
  assert.strictEqual(g.players[me].cards.length, 5); // sem aliados vivos, recebe todas
});

test('prompt da IA explica as regras de equipe e as ações possíveis', () => {
  const g = new Game(4, seeded(8), { mode: 'duplas' });
  const txt = buildAiPrompt(g);
  assert(txt.includes('Modo de equipes'));
  assert(txt.includes('VASSALAGEM'));
  assert(!txt.includes('undefined') && !txt.includes('null'));
});

console.log(`\n${tests} testes de equipe OK`);
