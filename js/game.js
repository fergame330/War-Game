/*
 * Regras do jogo (sem nenhuma dependência de DOM).
 *
 * Fluxo de uma partida:
 *   setup-continent -> setup-place -> attack -> move -> trade
 *   -> reinforce-continent -> reinforce-territory -> attack -> move -> trade -> ...
 * Em cada etapa todos os jogadores jogam, na ordem, antes de passar para a próxima etapa
 * (ex.: todos atacam; depois todos fazem a passagem; depois as cartas são entregues).
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

  // Modos de jogo: tamanho da equipe e quantidades de jogadores permitidas
  const MODES = {
    solo: { name: 'Individual', teamSize: 1, counts: [2, 3, 4, 5, 6, 7, 8, 9] },
    duplas: { name: 'Duplas', teamSize: 2, counts: [4, 6, 8] },
    trios: { name: 'Trios', teamSize: 3, counts: [6, 9] },
    quartetos: { name: 'Quartetos', teamSize: 4, counts: [8] },
  };
  const TEAM_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];

  function isValidSet(cards) {
    if (cards.length !== 4) return false;
    const shapes = new Set(cards.filter((c) => c.shape !== JOKER).map((c) => c.shape));
    return shapes.size <= 1;
  }

  class Game {
    constructor(numPlayers, rng, options) {
      this.mode = (options && options.mode) || 'solo';
      const mode = MODES[this.mode];
      if (!mode || !mode.counts.includes(numPlayers)) throw new Error('Número de jogadores inválido para o modo');
      this.rng = rng || Math.random;
      this.logs = [];
      this.listeners = [];
      this.teamMode = mode.teamSize > 1;
      this.numTeams = this.teamMode ? numPlayers / mode.teamSize : numPlayers;

      // Sorteia cores e ordem. Nas equipes a ordem alterna as equipes (A B C A B C...),
      // assim ninguém da mesma equipe joga em turnos seguidos.
      const colors = shuffle(COLORS, this.rng).slice(0, numPlayers);
      this.players = colors.map((c, i) => ({
        index: i,
        name: c.name,
        color: c.hex,
        textColor: c.text,
        cards: [],
        alive: true,
        team: i % this.numTeams,
      }));
      this.vassalOf = {}; // território vassalo -> dono original (quem cedeu)

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
      this.conquered = this.players.map(() => false); // conquistou território nesta rodada?
      this.movable = {};
      this.tradeSub = null;
      this.winner = null;

      this.winnerTeam = null;
      this.log('Partida iniciada com ' + numPlayers + ' jogadores' +
        (this.teamMode ? ' (' + mode.name.toLowerCase() + ': ' + this.numTeams + ' equipes de ' + mode.teamSize + ').' : '.'));
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
    // territórios que o jogador controla (inclui vassalos recebidos de aliados)
    territoriesOf(p) { return D.territoryIds.filter((id) => this.owner[id] === p); }
    // dono "original": territórios vassalos contam para quem os cedeu
    countedOwner(id) { return this.vassalOf[id] !== undefined ? this.vassalOf[id] : this.owner[id]; }
    territoryCount(p) { return D.territoryIds.filter((id) => this.countedOwner(id) === p).length; }
    teamName(t) { return 'Equipe ' + TEAM_LETTERS[t]; }
    isAlly(p, q) { return this.teamMode && p !== q && this.players[p].team === this.players[q].team; }
    alliesOf(p) { return this.players.filter((pl, i) => pl.alive && this.isAlly(p, i)).map((pl) => pl.index); }
    teamMembers(t) { return this.players.filter((pl) => pl.team === t); }
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

    territoryBonus(p) { return Math.floor(this.territoryCount(p) / 2); }

    advanceReinforceTerritory() {
      const p = this.nextAlive(this.current, (i) => this.territoryBonus(i) > 0);
      if (p === -1) return this.startAttackStage();
      this.setCurrent(p);
      this.beginPlacement([{ amount: this.territoryBonus(p), continent: null, label: 'bônus de territórios' }]);
    }

    // ---------- ataque ----------
    // Todos atacam, um de cada vez, na ordem
    startAttackStage() {
      this.stage = 'attack';
      this.current = -1;
      this.conquered = this.players.map(() => false);
      this.advanceAttack();
    }

    advanceAttack() {
      const p = this.nextAlive(this.current);
      if (p === -1) return this.startMoveStage();
      this.pending = {};
      this.stage = 'attack';
      this.setCurrent(p);
    }

    get conqueredThisTurn() { return this.conquered[this.current]; }

    isEnemyTerritory(id) { return this.owner[id] !== this.current && !this.isAlly(this.current, this.owner[id]); }

    canAttackFrom(id) {
      if (this.stage !== 'attack' || this.owner[id] !== this.current || this.pending[id]) return false;
      if (this.armies[id] < 2) return false;
      return D.territories[id].neighbors.some((n) => this.isEnemyTerritory(n));
    }

    attackTargets(id) {
      if (!this.canAttackFrom(id)) return [];
      return D.territories[id].neighbors.filter((n) => this.isEnemyTerritory(n));
    }

    // Verifica se o ataque é permitido (inclusive a reserva para os territórios conquistados)
    checkAttack(from, to) {
      if (this.stage !== 'attack') return { ok: false, reason: 'Não é fase de ataque.' };
      if (this.owner[from] !== this.current) return { ok: false, reason: 'Território de origem não é seu.' };
      if (this.owner[to] === this.current) return { ok: false, reason: 'Esse território já é seu.' };
      if (this.isAlly(this.current, this.owner[to])) return { ok: false, reason: 'Não é possível atacar um aliado.' };
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
        delete this.vassalOf[to];
        this.pending[to] = from;
        this.conquered[this.current] = true;
        result.conquered = true;
        this.log(this.player.name + ' conquistou ' + D.territories[to].name + ' de ' + this.players[defender].name + '.', this.current);

        if (this.territoriesOf(defender).length === 0) {
          const dp = this.players[defender];
          dp.alive = false;
          result.eliminated = defender;
          this.log(dp.name + ' foi eliminado por ' + this.player.name + '.', this.current);
          this.distributeCards(defender);
          // territórios que ele tinha cedido como vassalos ficam de vez com os aliados
          for (const id of Object.keys(this.vassalOf)) if (this.vassalOf[id] === defender) delete this.vassalOf[id];
          if (new Set(this.players.filter((pl) => pl.alive).map((pl) => pl.team)).size === 1) {
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
            this.winnerTeam = this.player.team;
            this.log((this.teamMode ? this.teamName(this.player.team) + ' (' + this.teamMembers(this.player.team).map((m) => m.name).join(', ') + ')' : this.player.name) +
              ' dominou o mundo e venceu a partida!', this.current);
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

    // Encerra os ataques do jogador da vez e passa para o próximo
    endAttack() {
      if (this.stage !== 'attack' || Object.keys(this.pending).length) return false;
      this.pending = {};
      this.advanceAttack();
      this.emit('change');
      return true;
    }

    // ---------- passagem: depois que todos atacaram, todos passam exércitos, na ordem ----------
    startMoveStage() {
      this.stage = 'move';
      this.current = -1;
      this.advanceMove();
    }

    hasAnyMove() {
      return this.territoriesOf(this.current).some((id) => this.armies[id] > 1 && this.moveTargets(id).length > 0);
    }

    advanceMove() {
      for (;;) {
        const p = this.nextAlive(this.current);
        if (p === -1) {
          this.movable = {};
          this.giveCards();
          return this.startTradeStage();
        }
        this.stage = 'move';
        this.current = p;
        this.movable = {};
        for (const id of this.territoriesOf(p)) this.movable[id] = this.armies[id];
        if (this.hasAnyMove()) {
          this.current = -1;
          this.setCurrent(p);
          return;
        }
        this.log(this.players[p].name + ' não tem exércitos para passar.', p);
      }
    }

    // ---------- passagem de exércitos ----------
    freeMove(from, to) {
      const c = D.territories[from].continent;
      return this.owner[to] === this.current && c === D.territories[to].continent && this.ownsContinent(this.current, c);
    }

    // passagem para território de aliado: chega metade (para baixo)
    isAllyMove(from, to) { return this.owner[from] === this.current && this.isAlly(this.current, this.owner[to]); }

    maxMove(from, to) {
      if (this.stage !== 'move' || from === to || this.owner[from] !== this.current) return 0;
      const ally = this.isAllyMove(from, to);
      if (this.owner[to] !== this.current && !ally) return 0;
      if (this.freeMove(from, to)) return this.armies[from] - 1;
      if (!this.isNeighbor(from, to)) return 0;
      const max = Math.max(0, Math.min(this.movable[from] || 0, this.armies[from] - 1));
      return ally && max < 2 ? 0 : max; // para aliado é preciso enviar pelo menos 2 (chega 1)
    }

    moveTargets(from) {
      return D.territoryIds.filter((id) => this.maxMove(from, id) > 0);
    }

    move(from, to, n) {
      if (n < 1 || n > this.maxMove(from, to)) return false;
      if (this.isAllyMove(from, to)) {
        if (n < 2) return false;
        const arrive = Math.floor(n / 2);
        this.movable[from] -= n;
        this.armies[from] -= n;
        this.armies[to] += arrive;
        this.log(this.player.name + ' enviou ' + n + ' de ' + D.territories[from].name + ' para o aliado ' +
          this.players[this.owner[to]].name + ' em ' + D.territories[to].name + ' (chegaram ' + arrive + ').', this.current);
        this.emit('change');
        return true;
      }
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

    // Encerra a passagem do jogador da vez e passa para o próximo
    endTurn() {
      if (this.stage !== 'move') return false;
      this.advanceMove();
      this.emit('change');
      return true;
    }

    // Depois da passagem de todos: 1 carta para cada um que conquistou ao menos 1 território
    giveCards() {
      const given = [];
      this.players.forEach((pl, i) => {
        if (!pl.alive || !this.conquered[i]) return;
        const card = this.drawCard();
        pl.cards.push(card);
        given.push({ player: i, card });
        this.log(pl.name + ' ganhou uma carta.', i);
      });
      this.conquered = this.players.map(() => false);
      if (given.length) this.emit('cards', given);
    }

    // ---------- ações de equipe ----------
    // Vassalagem: só na própria vez, durante a passagem ou a colocação de exércitos
    canVassal(id, ally) {
      const no = (reason) => ({ ok: false, reason });
      if (!this.teamMode) return no('Só existe vassalagem no modo de equipes.');
      if (this.stage === 'over' || this.current < 0) return no('Partida encerrada.');
      if (!(this.isPlacing() || this.stage === 'move')) return no('A vassalagem só pode ser feita durante a passagem ou a colocação de exércitos.');
      if (this.owner[id] !== this.current) return no('O território não é seu.');
      if (this.vassalOf[id] !== undefined) return no('Esse território já é vassalo: só o dono original pode retomá-lo.');
      if (ally !== undefined && (!this.isAlly(this.current, ally) || !this.players[ally].alive)) return no('Escolha um aliado vivo.');
      if (this.poolPlaced[id]) return no('Você acabou de colocar exércitos nesse território; desfaça a colocação antes.');
      const ownLeft = this.territoriesOf(this.current).filter((t) => t !== id && this.vassalOf[t] === undefined).length;
      if (ownLeft < 1) return no('Você precisa manter pelo menos 1 território que não seja vassalo.');
      const pool = this.pool;
      if (pool && pool.continent && D.territories[id].continent === pool.continent &&
        !this.territoriesOf(this.current).some((t) => t !== id && D.territories[t].continent === pool.continent)) {
        return no('Você ainda precisa colocar exércitos em ' + D.continents[pool.continent].name + ' e esse é seu último território lá.');
      }
      return { ok: true, remaining: Math.ceil(this.armies[id] / 2) };
    }

    vassalCandidates() { return this.territoriesOf(this.current).filter((id) => this.canVassal(id).ok); }

    vassal(id, ally) {
      const chk = this.canVassal(id, ally);
      if (!chk.ok) return chk;
      const before = this.armies[id];
      this.armies[id] = Math.ceil(before / 2);
      this.owner[id] = ally;
      this.vassalOf[id] = this.current;
      delete this.movable[id];
      this.log(this.player.name + ' declarou ' + D.territories[id].name + ' vassalo de ' + this.players[ally].name +
        ' (' + before + ' → ' + this.armies[id] + ' exércitos).', this.current);
      this.emit('change');
      return { ok: true };
    }

    // Retomar um território vassalo: só o dono original, na sua vez
    canUnvassal(id) {
      if (!this.teamMode || this.stage === 'over' || this.current < 0) return { ok: false, reason: 'Indisponível.' };
      if (this.vassalOf[id] !== this.current) return { ok: false, reason: 'Só o dono original pode retomar o território.' };
      if (this.pending[id]) return { ok: false, reason: 'Indisponível.' };
      if (this.territoriesOf(this.owner[id]).length <= 1) {
        return { ok: false, reason: 'É o último território de ' + this.players[this.owner[id]].name + '; retomá-lo eliminaria seu aliado.' };
      }
      return { ok: true };
    }

    myVassals() { return D.territoryIds.filter((id) => this.vassalOf[id] === this.current); }
    unvassalCandidates() { return this.myVassals().filter((id) => this.canUnvassal(id).ok); }

    unvassal(id) {
      const chk = this.canUnvassal(id);
      if (!chk.ok) return chk;
      const holder = this.owner[id];
      this.owner[id] = this.current;
      delete this.vassalOf[id];
      this.log(this.player.name + ' retomou ' + D.territories[id].name + ' de ' + this.players[holder].name + '.', this.current);
      this.emit('change');
      return { ok: true };
    }

    // Enviar carta a um aliado: uma outra carta aleatória da mão é descartada
    canSendCard(ally) {
      if (!this.teamMode || this.stage === 'over' || this.current < 0) return { ok: false, reason: 'Indisponível.' };
      if (this.player.cards.length < 2) return { ok: false, reason: 'É preciso ter pelo menos 2 cartas (uma é descartada).' };
      if (ally !== undefined && (!this.isAlly(this.current, ally) || !this.players[ally].alive)) return { ok: false, reason: 'Escolha um aliado vivo.' };
      return { ok: true };
    }

    sendCard(cardId, ally) {
      const chk = this.canSendCard(ally);
      if (!chk.ok) return chk;
      const hand = this.player.cards;
      const card = hand.find((c) => c.id === cardId);
      if (!card) return { ok: false, reason: 'Carta não encontrada.' };
      this.player.cards = hand.filter((c) => c !== card);
      this.players[ally].cards.push(card);
      const di = Math.floor(this.rng() * this.player.cards.length);
      const discarded = this.player.cards.splice(di, 1)[0];
      this.log(this.player.name + ' enviou uma carta para ' + this.players[ally].name + ' e descartou outra.', this.current);
      this.emit('change');
      return { ok: true, card, discarded };
    }

    // Cartas de quem foi eliminado: no individual vão todas para quem eliminou; nas equipes,
    // metade (arredondando para cima) para quem eliminou e o resto, sorteado, entre os aliados dele.
    distributeCards(defender) {
      const dp = this.players[defender];
      const cards = shuffle(dp.cards, this.rng);
      dp.cards = [];
      if (!cards.length) return;
      const allies = this.alliesOf(defender);
      const toWinner = this.teamMode && allies.length ? Math.ceil(cards.length / 2) : cards.length;
      this.player.cards.push(...cards.slice(0, toWinner));
      const got = {};
      for (const c of cards.slice(toWinner)) {
        const a = allies[Math.floor(this.rng() * allies.length)];
        this.players[a].cards.push(c);
        got[a] = (got[a] || 0) + 1;
      }
      const parts = [this.player.name + ' recebeu ' + toWinner + ' carta(s) de ' + dp.name];
      for (const [a, n] of Object.entries(got)) parts.push(this.players[a].name + ' recebeu ' + n);
      this.log(parts.join('; ') + '.', this.current);
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

  const api = { Game, MODES, TEAM_LETTERS, COLORS, SHAPES, JOKER, SHAPE_NAMES, STAGE_NAMES, tradeValue, isValidSet };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.WarGame = api;
})();
