/*
 * Regras do jogo (sem nenhuma dependência de DOM).
 *
 * Fluxo de uma partida:
 *   setup-continent -> setup-place -> [attack/move por jogador] -> trade
 *   -> reinforce-continent -> reinforce-territory -> [attack/move por jogador] -> trade -> ...
 * Nas etapas de colocação todos os jogadores passam, na ordem, antes da próxima etapa.
 */
(function () {
  const D = typeof module !== 'undefined' && module.exports ? require('./data.js') : window.WAR_DATA;

  const COLORS = [
    { name: 'Vermelho', hex: '#d63031', text: '#fff' },
    { name: 'Azul', hex: '#2e6fd8', text: '#fff' },
    { name: 'Verde', hex: '#27ae60', text: '#fff' },
    { name: 'Amarelo', hex: '#f6d32d', text: '#222' },
    { name: 'Preto', hex: '#2b2b2b', text: '#fff' },
    { name: 'Branco', hex: '#f4f4f4', text: '#222' },
    { name: 'Roxo', hex: '#8e44ad', text: '#fff' },
    { name: 'Laranja', hex: '#ec7a1c', text: '#fff' },
    { name: 'Rosa', hex: '#ff8fc7', text: '#222' },
  ];

  const SHAPES = ['circulo', 'quadrado', 'triangulo', 'estrela'];
  const JOKER = 'coringa';
  const SHAPE_NAMES = {
    circulo: 'Bolinha', quadrado: 'Quadrado', triangulo: 'Triângulo', estrela: 'Estrela', coringa: 'Coringa',
  };

  const STAGE_NAMES = {
    'setup-continent': 'Bônus de continente inicial',
    'setup-place': 'Distribuição inicial',
    attack: 'Ataque',
    move: 'Passagem de exércitos',
    trade: 'Troca de cartas',
    'reinforce-continent': 'Reforços — bônus de continente',
    'reinforce-territory': 'Reforços — bônus de territórios',
    over: 'Fim de jogo',
  };

  // Valor da n-ésima troca (n começa em 1): 4, 6, 8, 10, 12, 15, 20, 25, 30...
  function tradeValue(n) {
    if (n <= 5) return 2 + 2 * n;
    if (n === 6) return 15;
    return 15 + 5 * (n - 6);
  }

  function shuffle(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function isValidSet(cards) {
    if (cards.length !== 4) return false;
    const shapes = new Set(cards.filter((c) => c.shape !== JOKER).map((c) => c.shape));
    return shapes.size <= 1;
  }

  class Game {
    constructor(numPlayers, rng) {
      if (numPlayers < 2 || numPlayers > 9) throw new Error('Número de jogadores inválido');
      this.rng = rng || Math.random;
      this.logs = [];
      this.listeners = [];

      // Sorteia cores e ordem
      const colors = shuffle(COLORS, this.rng).slice(0, numPlayers);
      this.players = colors.map((c, i) => ({
        index: i,
        name: c.name,
        color: c.hex,
        textColor: c.text,
        cards: [],
        alive: true,
      }));

      // Divide os territórios: os primeiros da ordem recebem o resto da divisão
      this.owner = {};
      this.armies = {};
      shuffle(D.territoryIds, this.rng).forEach((id, i) => {
        this.owner[id] = i % numPlayers;
        this.armies[id] = 1;
      });

      this.round = 1;
      this.tradeCount = 0;
      this.current = -1;
      this.stage = null;
      this.pools = [];
      this.poolIndex = 0;
      this.poolPlaced = {};
      this.pending = {};
      this.conqueredThisTurn = false;
      this.movable = {};
      this.tradeSub = null;
      this.winner = null;
      this.lastCard = null;

      this.log('Partida iniciada com ' + numPlayers + ' jogadores.');
      this.startSetupContinent();
    }

    // ---------- utilidades ----------
    on(fn) { this.listeners.push(fn); }
    emit(type, payload) { for (const fn of this.listeners) fn(type, payload); }

    log(text, player) {
      this.logs.push({ text, player: player === undefined ? null : player, round: this.round });
      this.emit('log');
    }

    get player() { return this.players[this.current]; }
    territoriesOf(p) { return D.territoryIds.filter((id) => this.owner[id] === p); }
    totalArmies(p) { return this.territoriesOf(p).reduce((s, id) => s + this.armies[id], 0); }
    ownsContinent(p, c) {
      return D.territoryIds.every((id) => D.territories[id].continent !== c || this.owner[id] === p);
    }
    continentsOf(p) { return Object.keys(D.continents).filter((c) => this.ownsContinent(p, c)); }
    isNeighbor(a, b) { return D.territories[a].neighbors.includes(b); }
    pendingCount(source) { return Object.values(this.pending).filter((s) => s === source).length; }

    // próximo jogador vivo depois de `from` (sem dar a volta); -1 se acabou
    nextAlive(from, filter) {
      for (let i = from + 1; i < this.players.length; i++) {
        if (this.players[i].alive && (!filter || filter(i))) return i;
      }
      return -1;
    }

    setCurrent(p) {
      const changed = p !== this.current;
      this.current = p;
      if (changed) this.emit('turn', p);
    }

    // ---------- colocação de exércitos ----------
    beginPlacement(pools) {
      this.pools = pools.filter((p) => p.amount > 0);
      this.poolIndex = 0;
      this.poolPlaced = {};
      return this.pools.length > 0;
    }

    get pool() { return this.pools[this.poolIndex] || null; }

    get poolRemaining() {
      const pool = this.pool;
      if (!pool) return 0;
      return pool.amount - Object.values(this.poolPlaced).reduce((a, b) => a + b, 0);
    }

    isPlacing() { return !!this.pool && this.stage !== 'over'; }

    canPlaceOn(id) {
      const pool = this.pool;
      if (!pool || this.owner[id] !== this.current) return false;
      return !pool.continent || D.territories[id].continent === pool.continent;
    }

    place(id, n) {
      if (!this.canPlaceOn(id)) return 0;
      n = Math.min(n, this.poolRemaining);
      if (n <= 0) return 0;
      this.armies[id] += n;
      this.poolPlaced[id] = (this.poolPlaced[id] || 0) + n;
      this.emit('change');
      return n;
    }

    unplace(id, n) {
      n = Math.min(n, this.poolPlaced[id] || 0);
      if (n <= 0) return 0;
      this.armies[id] -= n;
      this.poolPlaced[id] -= n;
      if (!this.poolPlaced[id]) delete this.poolPlaced[id];
      this.emit('change');
      return n;
    }

    resetPool() {
      for (const id of Object.keys(this.poolPlaced)) this.armies[id] -= this.poolPlaced[id];
      this.poolPlaced = {};
      this.emit('change');
    }

    confirmPool() {
      if (!this.pool || this.poolRemaining !== 0) return false;
      const pool = this.pool;
      const where = Object.entries(this.poolPlaced)
        .map(([id, n]) => D.territories[id].name + ' +' + n)
        .join(', ');
      this.log(this.player.name + ' colocou ' + pool.amount + ' (' + pool.label + '): ' + where, this.current);
      this.poolIndex++;
      this.poolPlaced = {};
      if (this.poolIndex >= this.pools.length) {
        this.pools = [];
        this.afterPlacement();
      }
      this.emit('change');
      return true;
    }

    afterPlacement() {
      switch (this.stage) {
        case 'setup-continent': return this.advanceSetupContinent();
        case 'setup-place': return this.advanceSetupPlace();
        case 'reinforce-continent': return this.advanceReinforceContinent();
        case 'reinforce-territory': return this.advanceReinforceTerritory();
        case 'trade':
          if (this.hasValidSet(this.current)) { this.tradeSub = 'choose'; this.emit('trade-choose'); }
          else this.advanceTrade();
          return;
      }
    }

    continentPools(p) {
      return this.continentsOf(p).map((c) => ({
        amount: D.continents[c].bonus,
        continent: c,
        label: 'bônus de ' + D.continents[c].name,
      }));
    }

    // ---------- preparação ----------
    startSetupContinent() {
      this.stage = 'setup-continent';
      this.current = -1;
      this.advanceSetupContinent();
    }

    advanceSetupContinent() {
      const p = this.nextAlive(this.current, (i) => this.continentsOf(i).length > 0);
      if (p === -1) return this.startSetupPlace();
      this.setCurrent(p);
      this.beginPlacement(this.continentPools(p));
      this.log(this.player.name + ' começou com continente(s) completo(s) e recebe o bônus.', p);
    }

    startSetupPlace() {
      this.stage = 'setup-place';
      this.current = -1;
      this.advanceSetupPlace();
    }

    advanceSetupPlace() {
      const p = this.nextAlive(this.current, (i) => Math.floor(this.totalArmies(i) / 2) > 0);
      if (p === -1) return this.startAttackStage();
      this.setCurrent(p);
      const amount = Math.floor(this.totalArmies(p) / 2);
      this.beginPlacement([{ amount, continent: null, label: 'metade dos seus exércitos' }]);
    }

    // ---------- reforços (início de cada rodada a partir da 2ª) ----------
    // Primeiro todos colocam o bônus de continente; depois todos colocam o bônus de territórios.
    startReinforceStage() {
      this.round++;
      this.log('— Rodada ' + this.round + ' —');
      this.stage = 'reinforce-continent';
      this.current = -1;
      this.advanceReinforceContinent();
    }

    advanceReinforceContinent() {
      const p = this.nextAlive(this.current, (i) => this.continentPools(i).length > 0);
      if (p === -1) {
        this.stage = 'reinforce-territory';
        this.current = -1;
        return this.advanceReinforceTerritory();
      }
      this.setCurrent(p);
      this.beginPlacement(this.continentPools(p));
    }

    territoryBonus(p) { return Math.floor(this.territoriesOf(p).length / 2); }

    advanceReinforceTerritory() {
      const p = this.nextAlive(this.current, (i) => this.territoryBonus(i) > 0);
      if (p === -1) return this.startAttackStage();
      this.setCurrent(p);
      this.beginPlacement([{ amount: this.territoryBonus(p), continent: null, label: 'bônus de territórios' }]);
    }

    // ---------- ataque ----------
    startAttackStage() {
      this.stage = 'attack';
      this.current = -1;
      this.startTurn(this.nextAlive(-1));
    }

    startTurn(p) {
      this.pending = {};
      this.conqueredThisTurn = false;
      this.movable = {};
      this.stage = 'attack';
      this.setCurrent(p);
    }

    canAttackFrom(id) {
      if (this.stage !== 'attack' || this.owner[id] !== this.current || this.pending[id]) return false;
      if (this.armies[id] < 2) return false;
      return D.territories[id].neighbors.some((n) => this.owner[n] !== this.current);
    }

    attackTargets(id) {
      if (!this.canAttackFrom(id)) return [];
      return D.territories[id].neighbors.filter((n) => this.owner[n] !== this.current);
    }

    // Verifica se o ataque é permitido (inclusive a reserva para os territórios conquistados)
    checkAttack(from, to) {
      if (this.stage !== 'attack') return { ok: false, reason: 'Não é fase de ataque.' };
      if (this.owner[from] !== this.current) return { ok: false, reason: 'Território de origem não é seu.' };
      if (this.owner[to] === this.current) return { ok: false, reason: 'Esse território já é seu.' };
      if (!this.isNeighbor(from, to)) return { ok: false, reason: 'Os territórios não fazem fronteira.' };
      if (this.armies[from] < 2) return { ok: false, reason: 'É preciso ter mais de 1 exército para atacar.' };
      const attDice = Math.min(3, this.armies[from] - 1);
      const defDice = Math.min(3, this.armies[to]);
      const maxLoss = Math.min(attDice, defDice);
      const need = this.pendingCount(from);
      if (this.armies[from] - maxLoss < need + 1) {
        return {
          ok: false,
          blockedByPending: true,
          attDice,
          defDice,
          reason:
            'Se perder essa batalha, ' + D.territories[from].name + ' não terá exércitos para ocupar ' +
            (need === 1 ? 'o território conquistado' : 'os ' + need + ' territórios conquistados') +
            '. Envie exércitos para lá primeiro.',
        };
      }
      return { ok: true, attDice, defDice };
    }

    rollDie() { return 1 + Math.floor(this.rng() * 6); }

    attack(from, to) {
      const check = this.checkAttack(from, to);
      if (!check.ok) return { ok: false, reason: check.reason };
      const att = Array.from({ length: check.attDice }, () => this.rollDie()).sort((a, b) => b - a);
      const def = Array.from({ length: check.defDice }, () => this.rollDie()).sort((a, b) => b - a);
      let attLoss = 0, defLoss = 0;
      const pairs = [];
      for (let i = 0; i < Math.min(att.length, def.length); i++) {
        const attackerWins = att[i] > def[i]; // empate: vitória da defesa
        if (attackerWins) defLoss++; else attLoss++;
        pairs.push(attackerWins ? 'att' : 'def');
      }
      this.armies[from] -= attLoss;
      this.armies[to] -= defLoss;

      const defender = this.owner[to];
      const result = { ok: true, from, to, att, def, pairs, attLoss, defLoss, conquered: false, eliminated: null, defender };

      if (this.armies[to] <= 0) {
        this.armies[to] = 0;
        this.owner[to] = this.current;
        this.pending[to] = from;
        this.conqueredThisTurn = true;
        result.conquered = true;
        this.log(this.player.name + ' conquistou ' + D.territories[to].name + ' de ' + this.players[defender].name + '.', this.current);

        if (this.territoriesOf(defender).length === 0) {
          const dp = this.players[defender];
          dp.alive = false;
          const got = dp.cards.length;
          this.player.cards.push(...dp.cards);
          dp.cards = [];
          result.eliminated = defender;
          this.log(dp.name + ' foi eliminado por ' + this.player.name + (got ? ' (recebeu ' + got + ' carta(s)).' : '.'), this.current);
          if (this.players.filter((pl) => pl.alive).length === 1) {
            // ocupa automaticamente o que ficou pendente
            for (const t of Object.keys(this.pending)) {
              const src = this.pending[t];
              const n = Math.max(1, this.maxOccupy(t));
              this.armies[src] -= n;
              this.armies[t] = n;
              delete this.pending[t];
            }
            this.stage = 'over';
            this.winner = this.current;
            this.log(this.player.name + ' dominou o mundo e venceu a partida!', this.current);
          }
        }
      }
      this.emit('change');
      return result;
    }

    // Máximo que pode ser enviado ao território conquistado
    maxOccupy(to) {
      const from = this.pending[to];
      if (!from) return 0;
      const reserveForOthers = this.pendingCount(from) - 1;
      return Math.max(0, Math.min(3, this.armies[from] - 1 - reserveForOthers));
    }

    occupy(to, n) {
      const from = this.pending[to];
      if (!from) return false;
      const max = this.maxOccupy(to);
      if (n < 1 || n > max) return false;
      this.armies[from] -= n;
      this.armies[to] = n;
      delete this.pending[to];
      this.emit('change');
      return true;
    }

    endAttack() {
      if (this.stage !== 'attack' || Object.keys(this.pending).length) return false;
      this.stage = 'move';
      this.movable = {};
      for (const id of this.territoriesOf(this.current)) this.movable[id] = this.armies[id];
      this.emit('change');
      return true;
    }

    // ---------- passagem de exércitos ----------
    freeMove(from, to) {
      const c = D.territories[from].continent;
      return c === D.territories[to].continent && this.ownsContinent(this.current, c);
    }

    maxMove(from, to) {
      if (this.stage !== 'move' || from === to) return 0;
      if (this.owner[from] !== this.current || this.owner[to] !== this.current) return 0;
      if (this.freeMove(from, to)) return this.armies[from] - 1;
      if (!this.isNeighbor(from, to)) return 0;
      return Math.max(0, Math.min(this.movable[from] || 0, this.armies[from] - 1));
    }

    moveTargets(from) {
      return D.territoryIds.filter((id) => this.maxMove(from, id) > 0);
    }

    move(from, to, n) {
      if (n < 1 || n > this.maxMove(from, to)) return false;
      if (this.freeMove(from, to)) {
        // dentro do continente dominado: move primeiro os que não podem mais cruzar fronteiras
        const fixed = this.armies[from] - (this.movable[from] || 0);
        const movedMovable = n - Math.min(n, fixed);
        this.movable[from] -= movedMovable;
        this.movable[to] = (this.movable[to] || 0) + movedMovable;
      } else {
        this.movable[from] -= n;
      }
      this.armies[from] -= n;
      this.armies[to] += n;
      this.log(this.player.name + ' passou ' + n + ' de ' + D.territories[from].name + ' para ' + D.territories[to].name + '.', this.current);
      this.emit('change');
      return true;
    }

    endTurn() {
      if (this.stage !== 'move') return false;
      this.lastCard = null;
      if (this.conqueredThisTurn) {
        const card = this.drawCard();
        this.player.cards.push(card);
        this.lastCard = { player: this.current, card };
        this.log(this.player.name + ' ganhou uma carta.', this.current);
        this.emit('card', this.lastCard);
      }
      this.movable = {};
      const next = this.nextAlive(this.current);
      if (next === -1) this.startTradeStage();
      else this.startTurn(next);
      this.emit('change');
      return true;
    }

    // ---------- cartas ----------
    drawCard() {
      const shape = this.rng() < 0.12 ? JOKER : SHAPES[Math.floor(this.rng() * SHAPES.length)];
      const territory = D.territoryIds[Math.floor(this.rng() * D.territoryIds.length)];
      return { shape, territory, id: Math.floor(this.rng() * 1e9).toString(36) };
    }

    findSet(p) {
      const cards = this.players[p].cards;
      const jokers = cards.filter((c) => c.shape === JOKER);
      for (const s of SHAPES) {
        const same = cards.filter((c) => c.shape === s);
        if (same.length + jokers.length >= 4) {
          return same.slice(0, 4).concat(jokers.slice(0, Math.max(0, 4 - same.length)));
        }
      }
      if (jokers.length >= 4) return jokers.slice(0, 4);
      return null;
    }

    hasValidSet(p) { return !!this.findSet(p); }

    get nextTradeValue() { return tradeValue(this.tradeCount + 1); }

    startTradeStage() {
      this.stage = 'trade';
      this.current = -1;
      this.advanceTrade();
    }

    advanceTrade() {
      this.stage = 'trade';
      const p = this.nextAlive(this.current, (i) => this.hasValidSet(i));
      if (p === -1) return this.startReinforceStage();
      this.setCurrent(p);
      this.tradeSub = 'choose';
      this.emit('trade-choose');
    }

    trade(cardIds) {
      if (this.stage !== 'trade' || this.tradeSub !== 'choose') return { ok: false };
      const hand = this.player.cards;
      const cards = cardIds.map((id) => hand.find((c) => c.id === id)).filter(Boolean);
      if (new Set(cardIds).size !== 4 || cards.length !== 4 || !isValidSet(cards)) {
        return { ok: false, reason: 'Escolha 4 cartas do mesmo naipe (o coringa vale por qualquer naipe).' };
      }
      this.tradeCount++;
      const value = tradeValue(this.tradeCount);
      this.player.cards = hand.filter((c) => !cardIds.includes(c.id));
      const bonuses = [];
      for (const c of cards) {
        if (this.owner[c.territory] === this.current) {
          this.armies[c.territory] += 3;
          bonuses.push(c.territory);
        }
      }
      this.log(
        this.player.name + ' trocou cartas (' + this.tradeCount + 'ª troca) e recebeu ' + value + ' exércitos' +
          (bonuses.length ? '; +3 em ' + bonuses.map((t) => D.territories[t].name).join(', ') : '') + '.',
        this.current
      );
      this.tradeSub = 'place';
      this.beginPlacement([{ amount: value, continent: null, label: 'troca de cartas' }]);
      this.emit('change');
      return { ok: true, value, bonuses };
    }

    skipTrade() {
      if (this.stage !== 'trade' || this.tradeSub !== 'choose') return false;
      this.advanceTrade();
      this.emit('change');
      return true;
    }
  }

  const api = { Game, COLORS, SHAPES, JOKER, SHAPE_NAMES, STAGE_NAMES, tradeValue, isValidSet };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.WarGame = api;
})();
