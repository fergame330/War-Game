/*
 * Gera um prompt (texto) para uma IA jogar a ação da vez.
 * O prompt traz as regras, o estado do mundo, os dados do jogador, as ações possíveis
 * e pede para a IA responder apenas com a ação da vez, num formato fixo.
 * Sem dependência de DOM (também roda no Node).
 */
(function () {
  const isNode = typeof module !== 'undefined' && module.exports;
  const D = isNode ? require('./data.js') : window.WAR_DATA;
  const W = isNode ? require('./game.js') : window.WarGame;
  const { SHAPE_NAMES, STAGE_NAMES, tradeValue } = W;

  const tn = (id) => D.territories[id].name;
  const cn = (c) => D.continents[c].name;

  function rulesText() {
    const bonuses = Object.values(D.continents).map((c) => c.name + ' +' + c.bonus).join(', ');
    return `## Regras do jogo "Guerra Mundial"

Objetivo: eliminar todos os outros jogadores e dominar todos os ${D.territoryIds.length} territórios do mundo.

Início da partida:
- Cores e ordem dos jogadores são sorteadas. Os territórios são divididos igualmente; quem vem primeiro na ordem fica com o resto da divisão.
- Cada território começa com 1 exército.
- Quem começa com um continente inteiro recebe o bônus desse continente e o coloca em territórios desse continente (todos os que têm continente colocam antes da etapa seguinte).
- Depois, cada jogador recebe metade (arredondada para baixo) do total de exércitos que tem e os coloca onde quiser nos seus territórios.

Cada rodada tem estas etapas. Em cada etapa todos os jogadores agem, um de cada vez, na ordem padrão, antes de passar para a próxima etapa:
1. Reforço de continentes (a partir da 2ª rodada): cada jogador recebe o bônus de cada continente que domina por completo e o coloca em territórios desse continente.
2. Reforço de territórios (a partir da 2ª rodada): cada jogador recebe metade (para baixo) do número de territórios que possui e coloca onde quiser nos seus territórios.
3. Ataques: cada jogador ataca quantas vezes quiser e depois encerra seus ataques.
4. Passagem de exércitos: cada jogador move exércitos entre seus territórios e encerra.
5. Cartas: todos que conquistaram ao menos 1 território na rodada ganham 1 carta (no máximo 1 por rodada).
6. Trocas: cada jogador que tiver uma troca possível pode trocar cartas e colocar os exércitos recebidos.

Batalha:
- Só ataca um território seu com mais de 1 exército, contra um território inimigo que faz fronteira com ele.
- O atacante rola (exércitos no território − 1) dados e o defensor rola (exércitos no território) dados, no máximo 3 dados cada.
- Os dados de cada lado são ordenados do maior para o menor e comparados em pares: maior com maior, 2º com 2º, 3º com 3º. Só se comparam tantos pares quanto o lado com menos dados. Empate é vitória da defesa.
- Cada par vencido pelo ataque tira 1 exército da defesa; cada par vencido pela defesa tira 1 exército do ataque.
- Quando a defesa fica com 0 exércitos o território passa a ser do atacante, mas fica vazio até receber exércitos. A ocupação não precisa ser imediata: o território que atacou deve enviar de 1 a 3 exércitos para ele (no máximo 3), sempre deixando pelo menos 1 em si mesmo.
- Um território com conquistas ainda vazias pode continuar atacando somente se, mesmo perdendo todos os pares da próxima batalha, ainda sobrarem exércitos suficientes para ocupar cada território vazio que ele conquistou com 1 exército e manter 1 em si mesmo. Caso contrário, é preciso ocupar antes.
- Antes de encerrar os ataques, todos os territórios conquistados precisam estar ocupados.

Passagem de exércitos:
- Só para territórios seus que fazem fronteira com a origem.
- Só podem cruzar uma fronteira os exércitos que já estavam no território no início da passagem; exércitos que chegaram de outro território nesta passagem não podem ser passados adiante.
- Sempre fica pelo menos 1 exército em cada território.
- Dentro de um continente que é inteiramente seu, a movimentação entre quaisquer territórios desse continente é livre e ilimitada; ao cruzar a fronteira do continente vale a regra normal.

Cartas e trocas:
- Cada carta tem um naipe (Bolinha, Quadrado, Triângulo, Estrela ou Coringa) e um território qualquer do mapa.
- Uma troca usa 4 cartas do mesmo naipe; o Coringa vale por qualquer naipe.
- O valor da troca depende de quantas trocas já foram feitas por todos os jogadores somados: 1ª = 4, 2ª = 6, 3ª = 8, 4ª = 10, 5ª = 12, 6ª = 15, 7ª = 20, 8ª = 25, 9ª = 30, 10ª = 35, 11ª = 40 e assim por diante (+5 por troca).
- Cada carta trocada cujo território é seu dá +3 exércitos nesse território, automaticamente.
- Os exércitos da troca são colocados onde o jogador quiser, nos seus territórios.
- Quem conquista o último território de um jogador o elimina e recebe todas as cartas dele.

Bônus dos continentes: ${bonuses}.`;
  }

  function worldText(game) {
    const lines = [];
    lines.push('### Jogadores (na ordem padrão)');
    game.players.forEach((pl, i) => {
      if (!pl.alive) {
        lines.push(`${i + 1}. ${pl.name} — ELIMINADO`);
        return;
      }
      const conts = game.continentsOf(i).map(cn);
      lines.push(
        `${i + 1}. ${pl.name}${i === game.current ? ' (VOCÊ)' : ''} — ${game.territoriesOf(i).length} territórios, ` +
          `${game.totalArmies(i)} exércitos, ${pl.cards.length} carta(s)` +
          (conts.length ? `, domina: ${conts.join(', ')}` : '')
      );
    });

    lines.push('', '### Continentes');
    for (const [c, info] of Object.entries(D.continents)) {
      const ids = D.territoryIds.filter((id) => D.territories[id].continent === c);
      const owner = game.players.findIndex((pl, i) => pl.alive && game.ownsContinent(i, c));
      lines.push(`- ${info.name} (bônus +${info.bonus}, ${ids.length} territórios): ` +
        (owner >= 0 ? `dominado por ${game.players[owner].name}` : 'ninguém domina'));
    }

    lines.push('', '### Territórios', 'Formato: Território — dono (exércitos) — fronteiras: vizinho [dono exércitos]');
    for (const [c, info] of Object.entries(D.continents)) {
      lines.push('', `${info.name}:`);
      for (const id of D.territoryIds.filter((t) => D.territories[t].continent === c)) {
        const o = game.owner[id];
        const nb = D.territories[id].neighbors
          .map((n) => `${tn(n)} [${game.players[game.owner[n]].name} ${game.armies[n]}]`)
          .join(', ');
        const pending = game.pending[id] ? ' (conquistado agora, vazio — aguardando exércitos de ' + tn(game.pending[id]) + ')' : '';
        lines.push(`- ${tn(id)} — ${game.players[o].name} (${game.armies[id]})${pending} — fronteiras: ${nb}`);
      }
    }
    return lines.join('\n');
  }

  function playerText(game) {
    const p = game.current;
    const pl = game.players[p];
    const lines = [`## Seus dados (${pl.name})`];
    const mine = game.territoriesOf(p);
    lines.push(`Territórios (${mine.length}): ` + mine.map((id) => `${tn(id)} (${game.armies[id]})`).join(', '));
    const conts = game.continentsOf(p);
    lines.push('Continentes dominados: ' + (conts.length ? conts.map((c) => `${cn(c)} (+${D.continents[c].bonus})`).join(', ') : 'nenhum'));
    lines.push(`Bônus de territórios na próxima rodada: ${Math.floor(mine.length / 2)}`);
    if (pl.cards.length) {
      lines.push('Suas cartas:');
      pl.cards.forEach((c, i) => {
        lines.push(`  ${i + 1}. ${SHAPE_NAMES[c.shape]} — ${tn(c.territory)}${game.owner[c.territory] === p ? ' (território seu: +3 se trocar)' : ''}`);
      });
    } else {
      lines.push('Suas cartas: nenhuma');
    }
    lines.push(`Trocas já feitas (todos os jogadores): ${game.tradeCount}. A próxima troca vale ${tradeValue(game.tradeCount + 1)} exércitos.`);
    if (game.stage === 'attack' || game.stage === 'move') {
      lines.push('Você ' + (game.conqueredThisTurn ? 'já conquistou' : 'ainda não conquistou') + ' território nesta rodada' +
        (game.conqueredThisTurn ? ' (vai ganhar 1 carta depois da passagem).' : '.'));
    }
    return lines.join('\n');
  }

  function placementAction(game) {
    const pool = game.pool;
    const remaining = game.poolRemaining;
    const valid = D.territoryIds.filter((id) => game.canPlaceOn(id));
    const already = Object.entries(game.poolPlaced);
    const later = game.pools.slice(game.poolIndex + 1);
    const lines = [
      `Etapa: ${STAGE_NAMES[game.stage] || game.stage}${game.stage === 'trade' ? ' (colocar os exércitos da troca)' : ''}.`,
      `Você deve colocar ${remaining} exército(s) (${pool.label})` +
        (pool.continent ? `, somente em territórios do continente ${cn(pool.continent)}.` : ', em qualquer território seu.'),
    ];
    if (already.length) lines.push('Já colocados nesta etapa: ' + already.map(([id, n]) => `${tn(id)} +${n}`).join(', ') + '.');
    lines.push('Territórios onde pode colocar: ' + valid.map((id) => `${tn(id)} (${game.armies[id]})`).join(', ') + '.');
    if (later.length) {
      lines.push('Depois desta colocação você ainda terá: ' +
        later.map((x) => `${x.amount} (${x.label}${x.continent ? ', só em ' + cn(x.continent) : ''})`).join('; ') +
        '. NÃO inclua essas na resposta: responda só a colocação atual.');
    }
    lines.push('', 'Formato da resposta (a soma das quantidades deve ser exatamente ' + remaining + '):', '```',
      'COLOCAR', '<Território>: <quantidade>', '<Território>: <quantidade>', '```');
    return lines.join('\n');
  }

  function attackAction(game) {
    const p = game.current;
    const lines = ['Etapa: Ataques. É a sua vez de atacar.'];
    const pendings = Object.entries(game.pending);
    if (pendings.length) {
      lines.push('', 'Territórios conquistados ainda vazios (precisam ser ocupados antes de encerrar os ataques):');
      for (const [t, src] of pendings) {
        lines.push(`- ${tn(t)}: ocupar com 1 a ${game.maxOccupy(t)} exército(s) vindos de ${tn(src)} (que tem ${game.armies[src]}).`);
      }
    }
    const allowed = [], blocked = [];
    for (const from of game.territoriesOf(p)) {
      for (const to of game.attackTargets(from)) {
        const chk = game.checkAttack(from, to);
        const desc = `${tn(from)} (${game.armies[from]}) -> ${tn(to)} (${game.players[game.owner[to]].name}, ${game.armies[to]})`;
        if (chk.ok) allowed.push(`- ${desc}: ${chk.attDice} dado(s) de ataque contra ${chk.defDice} de defesa`);
        else blocked.push(`- ${desc}: bloqueado — ${chk.reason}`);
      }
    }
    lines.push('', 'Ataques permitidos agora:', allowed.length ? allowed.join('\n') : '- nenhum');
    if (blocked.length) lines.push('', 'Ataques bloqueados até ocupar os territórios conquistados:', blocked.join('\n'));
    lines.push('', 'Escolha UMA destas ações e responda exatamente em um destes formatos:');
    if (allowed.length) {
      lines.push('```', 'ATACAR <origem> -> <alvo>', '```',
        '(uma única batalha; depois você receberá o resultado e um novo prompt)', '```',
        'ATACAR ATÉ CONQUISTAR <origem> -> <alvo>', '```',
        '(repete batalhas até conquistar o alvo ou até o ataque deixar de ser permitido)');
    }
    if (pendings.length) lines.push('```', 'OCUPAR <território conquistado> COM <quantidade>', '```');
    lines.push('```', 'ENCERRAR ATAQUES', '```');
    if (pendings.length) lines.push('(ENCERRAR ATAQUES só é aceito depois de ocupar todos os territórios conquistados)');
    return lines.join('\n');
  }

  function moveAction(game) {
    const p = game.current;
    const lines = ['Etapa: Passagem de exércitos. É a sua vez de passar exércitos.', '',
      'Possibilidades (limites calculados antes de qualquer passagem desta vez):'];
    let any = false;
    for (const from of game.territoriesOf(p)) {
      const targets = game.moveTargets(from);
      if (!targets.length) continue;
      any = true;
      const canCross = Math.max(0, Math.min(game.movable[from] || 0, game.armies[from] - 1));
      lines.push(`- ${tn(from)} (${game.armies[from]} exércitos; podem cruzar fronteira: ${canCross}) -> ` +
        targets.map((t) => `${tn(t)} (até ${game.maxMove(from, t)}${game.freeMove(from, t) ? ', livre no continente' : ''})`).join(', '));
    }
    if (!any) lines.push('- nenhuma');
    lines.push('', 'Você pode fazer várias passagens nesta mesma resposta, respeitando as regras (exércitos que chegaram não podem cruzar outra fronteira; sempre fica 1 em cada território).',
      'Formato da resposta:', '```', 'PASSAGEM', '<quantidade> de <origem> para <destino>', '<quantidade> de <origem> para <destino>', 'FIM', '```',
      'ou, se não quiser passar nada:', '```', 'NENHUMA PASSAGEM', '```');
    return lines.join('\n');
  }

  function tradeAction(game) {
    const set = game.findSet(game.current);
    const cards = game.players[game.current].cards;
    const lines = [
      'Etapa: Trocas de cartas. Você tem pelo menos uma troca possível.',
      `Esta troca vale ${tradeValue(game.tradeCount + 1)} exércitos (+3 em cada território seu que estiver nas cartas trocadas).`,
      'Os exércitos recebidos serão colocados num próximo passo (você receberá outro prompt para isso).',
    ];
    if (set) lines.push('Exemplo de troca válida: cartas ' + set.map((c) => cards.indexOf(c) + 1).join(', ') + '.');
    lines.push('', 'Responda exatamente em um destes formatos (números das cartas da lista "Suas cartas"):', '```',
      'TROCAR <n1>, <n2>, <n3>, <n4>', '```', 'ou', '```', 'NÃO TROCAR', '```');
    return lines.join('\n');
  }

  function actionText(game) {
    if (game.isPlacing()) return placementAction(game);
    if (game.stage === 'attack') return attackAction(game);
    if (game.stage === 'move') return moveAction(game);
    if (game.stage === 'trade' && game.tradeSub === 'choose') return tradeAction(game);
    return 'Não há ação para você agora.';
  }

  function canBuildAiPrompt(game) {
    return !!game && game.current >= 0 && game.stage !== 'over';
  }

  function buildAiPrompt(game) {
    const pl = game.player;
    return [
      `# Guerra Mundial — vez de ${pl.name} (rodada ${game.round})`,
      '',
      `Você é a IA que joga como o jogador **${pl.name}** em uma partida do jogo de estratégia "Guerra Mundial" ` +
        `(estilo "conquiste o mundo"). Seu objetivo é vencer a partida. Leia as regras, o estado atual e decida ` +
        `a ação da vez.`,
      '',
      rulesText(),
      '',
      `## Situação atual`,
      `Rodada ${game.round}. Etapa atual: ${STAGE_NAMES[game.stage] || game.stage}. Jogador da vez: ${pl.name}.`,
      '',
      worldText(game),
      '',
      playerText(game),
      '',
      '## Sua ação agora',
      actionText(game),
      '',
      '## Como responder',
      '- Execute apenas a ação da vez descrita em "Sua ação agora" — nada de etapas seguintes.',
      '- Responda somente com o bloco da ação, no formato indicado, sem explicações.',
      '- Escreva os nomes dos territórios exatamente como aparecem neste texto.',
      '- A ação precisa respeitar as regras; se não for possível agir, use a opção de encerrar/não fazer nada.',
      '',
    ].join('\n');
  }

  function aiPromptFileName(game) {
    const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return `guerra-mundial-rodada${game.round}-${slug(game.player.name)}-${slug(STAGE_NAMES[game.stage] || game.stage)}.txt`;
  }

  const api = { buildAiPrompt, aiPromptFileName, canBuildAiPrompt };
  if (isNode) module.exports = api;
  else window.WarAiPrompt = api;
})();
