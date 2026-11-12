/*
 * Gera um prompt (texto) para uma IA jogar a ação da vez.
 * O prompt traz as regras, o estado do mundo, os dados do jogador, as ações possíveis
 * e pede para a IA responder apenas com a ação da vez, num formato fixo.
 */
import { CONTINENTS, TERRITORIES, TERRITORY_IDS, cName, tName, type ContinentId, type TerritoryId } from './data';
import { Game, MODES, SHAPE_NAMES, STAGE_NAMES, cloneState, tradeValue, type GameState } from './engine';

const tn = tName;
const cn = cName;

function teamRulesText(game: Game) {
  const m = MODES[game.s.mode];
  return `## Modo de equipes (${m.name}: ${game.s.numTeams} equipes de ${m.teamSize})

Valem todas as regras acima, com estas mudanças:
- Jogadores da mesma equipe não podem se atacar. A ordem alterna as equipes, então ninguém da mesma equipe joga em turnos seguidos.
- Na passagem é possível enviar exércitos para um território vizinho de um aliado, mas chega só a metade dos enviados, arredondando para baixo (envie pelo menos 2).
- É possível enviar uma carta específica para um aliado, mas outra carta aleatória da sua mão (que não a enviada) é descartada. Por isso é preciso ter pelo menos 2 cartas.
- Vassalagem: durante a passagem ou a colocação de exércitos você pode ceder um território seu para um aliado. Ele passa a ser controlado pelo aliado e perde metade dos exércitos (o que fica é arredondado para cima). Você precisa manter pelo menos 1 território próprio que não seja vassalo.
- Territórios vassalos continuam contando como seus na contagem de territórios (bônus de territórios), mas são controlados pelo aliado, que pode atacar, colocar e passar exércitos com eles; o aliado não pode vassalá-los de novo nem devolvê-los.
- O dono original pode retomar um território vassalo na própria vez, quando quiser, sem recuperar os exércitos perdidos (não é possível retomar o último território de um aliado).
- Um continente só é dominado quando todos os seus territórios são controlados por um único jogador; se a equipe tem o continente dividido entre aliados, é preciso usar vassalagem para que um só membro o domine.
- Quando um jogador é eliminado, metade das cartas dele (arredondada para cima) vai para quem o eliminou e o resto é sorteado, carta por carta, entre os aliados vivos dele.
- Vence a equipe que eliminar todas as outras e dominar o mundo.`;
}

function rulesText(): string {
  const bonuses = Object.values(CONTINENTS).map((c) => c.name + ' +' + c.bonus).join(', ');
  return `## Regras do jogo "Guerra Mundial"

Objetivo: eliminar todos os outros jogadores e dominar todos os ${TERRITORY_IDS.length} territórios do mundo.

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

function worldText(game: Game) {
  const lines = [];
  lines.push('### Jogadores (na ordem padrão)');
  game.s.players.forEach((pl, i) => {
    if (!pl.alive) {
      lines.push(`${i + 1}. ${pl.name} — ELIMINADO`);
      return;
    }
    const conts = game.continentsOf(i).map(cn);
    lines.push(
      `${i + 1}. ${pl.name}${game.s.teamMode ? ' [' + game.teamName(pl.team) + ']' : ''}${i === game.s.current ? ' (VOCÊ)' : ''} — ` +
        `${game.territoryCount(i)} territórios` + (game.territoriesOf(i).length !== game.territoryCount(i) ? ` (controla ${game.territoriesOf(i).length})` : '') + ', ' +
        `${game.totalArmies(i)} exércitos nos territórios que controla, ${pl.cards.length} carta(s)` +
        (conts.length ? `, domina: ${conts.join(', ')}` : '')
    );
  });

  lines.push('', '### Continentes');
  for (const [c, info] of Object.entries(CONTINENTS) as [ContinentId, (typeof CONTINENTS)[ContinentId]][]) {
    const ids = TERRITORY_IDS.filter((id) => TERRITORIES[id].continent === c);
    const owner = game.s.players.findIndex((pl, i) => pl.alive && game.ownsContinent(i, c));
    lines.push(`- ${info.name} (bônus +${info.bonus}, ${ids.length} territórios): ` +
      (owner >= 0 ? `dominado por ${game.s.players[owner].name}` : 'ninguém domina'));
  }

  lines.push('', '### Territórios', 'Formato: Território — dono (exércitos) — fronteiras: vizinho [dono exércitos]');
  for (const [c, info] of Object.entries(CONTINENTS) as [ContinentId, (typeof CONTINENTS)[ContinentId]][]) {
    lines.push('', `${info.name}:`);
    for (const id of TERRITORY_IDS.filter((t) => TERRITORIES[t].continent === c)) {
      const o = game.s.owner[id];
      const nb = TERRITORIES[id].neighbors
        .map((n) => `${tn(n)} [${game.s.players[game.s.owner[n]].name} ${game.s.armies[n]}]`)
        .join(', ');
      const pending = (game.s.pending[id] ? ' (conquistado agora, vazio — aguardando exércitos de ' + tn(game.s.pending[id]) + ')' : '') +
        (game.s.vassalOf[id] !== undefined ? ' (vassalo: dono original ' + game.s.players[game.s.vassalOf[id]].name + ')' : '');
      lines.push(`- ${tn(id)} — ${game.s.players[o].name} (${game.s.armies[id]})${pending} — fronteiras: ${nb}`);
    }
  }
  return lines.join('\n');
}

function playerText(game: Game) {
  const p = game.s.current;
  const pl = game.s.players[p];
  const lines = [`## Seus dados (${pl.name})`];
  if (game.s.teamMode) {
    const allies = game.teamMembers(pl.team).filter((m) => m.index !== p);
    lines.push(`Sua equipe: ${game.teamName(pl.team)}. Aliados: ` + allies.map((m) => m.name + (m.alive ? '' : ' (eliminado)')).join(', ') + '.');
    const given = game.myVassals();
    if (given.length) lines.push('Seus territórios cedidos como vassalos: ' + given.map((id) => `${tn(id)} (com ${game.s.players[game.s.owner[id]].name}, ${game.s.armies[id]})`).join(', ') + '.');
  }
  const mine = game.territoriesOf(p);
  lines.push(`Territórios que você controla (${mine.length}): ` + mine.map((id) => `${tn(id)} (${game.s.armies[id]})` +
    (game.s.vassalOf[id] !== undefined ? ' [vassalo de ' + game.s.players[game.s.vassalOf[id]].name + ']' : '')).join(', '));
  const conts = game.continentsOf(p);
  lines.push('Continentes dominados: ' + (conts.length ? conts.map((c) => `${cn(c)} (+${CONTINENTS[c].bonus})`).join(', ') : 'nenhum'));
  lines.push(`Bônus de territórios na próxima rodada: ${game.territoryBonus(p)}`);
  if (pl.cards.length) {
    lines.push('Suas cartas:');
    pl.cards.forEach((c, i) => {
      lines.push(`  ${i + 1}. ${SHAPE_NAMES[c.shape]} — ${tn(c.territory)}${game.s.owner[c.territory] === p ? ' (território seu: +3 se trocar)' : ''}`);
    });
  } else {
    lines.push('Suas cartas: nenhuma');
  }
  lines.push(`Trocas já feitas (todos os jogadores): ${game.s.tradeCount}. A próxima troca vale ${tradeValue(game.s.tradeCount + 1)} exércitos.`);
  if (game.stage === 'attack' || game.stage === 'move') {
    lines.push('Você ' + (game.conqueredThisTurn ? 'já conquistou' : 'ainda não conquistou') + ' território nesta rodada' +
      (game.conqueredThisTurn ? ' (vai ganhar 1 carta depois da passagem).' : '.'));
  }
  return lines.join('\n');
}

function placementAction(game: Game) {
  const pool = game.pool!;
  const remaining = pool.amount;
  const valid = TERRITORY_IDS.filter((id) => game.canPlaceOn(id));
  const later = game.s.pools.slice(game.s.poolIndex + 1);
  const lines = [
    `Etapa: ${STAGE_NAMES[game.stage] || game.stage}${game.stage === 'trade' ? ' (colocar os exércitos da troca)' : ''}.`,
    `Você deve colocar ${remaining} exército(s) (${pool.label})` +
      (pool.continent ? `, somente em territórios do continente ${cn(pool.continent)}.` : ', em qualquer território seu.'),
  ];
  lines.push('Territórios onde pode colocar: ' + valid.map((id) => `${tn(id)} (${game.s.armies[id]})`).join(', ') + '.');
  if (later.length) {
    lines.push('Depois desta colocação você ainda terá: ' +
      later.map((x) => `${x.amount} (${x.label}${x.continent ? ', só em ' + cn(x.continent) : ''})`).join('; ') +
      '. NÃO inclua essas na resposta: responda só a colocação atual.');
  }
  lines.push('', 'Formato da resposta (a soma das quantidades deve ser exatamente ' + remaining + '):', '```',
    'COLOCAR', '<Território>: <quantidade>', '<Território>: <quantidade>', '```');
  return lines.join('\n');
}

function attackAction(game: Game) {
  const p = game.s.current;
  const lines = ['Etapa: Ataques. É a sua vez de atacar.'];
  const pendings = Object.entries(game.s.pending);
  if (pendings.length) {
    lines.push('', 'Territórios conquistados ainda vazios (precisam ser ocupados antes de encerrar os ataques):');
    for (const [t, src] of pendings as [TerritoryId, TerritoryId][]) {
      lines.push(`- ${tn(t)}: ocupar com 1 a ${game.maxOccupy(t)} exército(s) vindos de ${tn(src)} (que tem ${game.s.armies[src]}).`);
    }
  }
  const allowed = [], blocked = [];
  for (const from of game.territoriesOf(p)) {
    for (const to of game.attackTargets(from)) {
      const chk = game.checkAttack(from, to);
      const desc = `${tn(from)} (${game.s.armies[from]}) -> ${tn(to)} (${game.s.players[game.s.owner[to]].name}, ${game.s.armies[to]})`;
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

function moveAction(game: Game) {
  const p = game.s.current;
  const lines = ['Etapa: Passagem de exércitos. É a sua vez de passar exércitos.', '',
    'Possibilidades (limites calculados antes de qualquer passagem desta vez):'];
  let any = false;
  for (const from of game.territoriesOf(p)) {
    const targets = game.moveTargets(from);
    if (!targets.length) continue;
    any = true;
    const canCross = Math.max(0, Math.min(game.s.movable[from] || 0, game.s.armies[from] - 1));
    lines.push(`- ${tn(from)} (${game.s.armies[from]} exércitos; podem cruzar fronteira: ${canCross}) -> ` +
      targets.map((t) => `${tn(t)} (até ${game.maxMove(from, t)}` +
        (game.freeMove(from, t) ? ', livre no continente' : '') +
        (game.isAllyMove(from, t) ? `, aliado ${game.s.players[game.s.owner[t]].name}: chega metade` : '') + ')').join(', '));
  }
  if (!any) lines.push('- nenhuma');
  lines.push('', 'Você pode fazer várias passagens nesta mesma resposta, respeitando as regras (exércitos que chegaram não podem cruzar outra fronteira; sempre fica 1 em cada território).',
    'Formato da resposta:', '```', 'PASSAGEM', '<quantidade> de <origem> para <destino>', '<quantidade> de <origem> para <destino>', 'FIM', '```',
    'ou, se não quiser passar nada:', '```', 'NENHUMA PASSAGEM', '```');
  return lines.join('\n');
}

function tradeAction(game: Game) {
  const set = game.findSet(game.s.current);
  const cards = game.s.players[game.s.current].cards;
  const lines = [
    'Etapa: Trocas de cartas. Você tem pelo menos uma troca possível.',
    `Esta troca vale ${tradeValue(game.s.tradeCount + 1)} exércitos (+3 em cada território seu que estiver nas cartas trocadas).`,
    'Os exércitos recebidos serão colocados num próximo passo (você receberá outro prompt para isso).',
  ];
  if (set) lines.push('Exemplo de troca válida: cartas ' + set.map((c) => cards.indexOf(c) + 1).join(', ') + '.');
  lines.push('', 'Responda exatamente em um destes formatos (números das cartas da lista "Suas cartas"):', '```',
    'TROCAR <n1>, <n2>, <n3>, <n4>', '```', 'ou', '```', 'NÃO TROCAR', '```');
  return lines.join('\n');
}

function teamActionText(game: Game) {
  if (!game.s.teamMode) return '';
  const p = game.s.current;
  const allies = game.alliesOf(p);
  const lines = ['', '### Ações de equipe (opcionais, antes da ação principal)'];
  if (!allies.length) {
    lines.push('Você não tem aliados vivos.');
    return lines.join('\n');
  }
  lines.push('Aliados vivos: ' + allies.map((a) => game.s.players[a].name).join(', ') + '.');
  const vc = game.vassalCandidates();
  if (game.isPlacing() || game.stage === 'move') {
    lines.push('Vassalagem possível agora em: ' + (vc.length ? vc.map((id) => `${tn(id)} (${game.s.armies[id]} → fica ${Math.ceil(game.s.armies[id] / 2)})`).join(', ') : 'nenhum território') + '.');
  } else {
    lines.push('Vassalagem: não disponível nesta etapa (só na passagem ou colocação).');
  }
  const uc = game.unvassalCandidates();
  lines.push('Territórios que você pode retomar: ' + (uc.length ? uc.map(tn).join(', ') : 'nenhum') + '.');
  lines.push('Enviar carta: ' + (game.canSendCard().ok ? 'possível (use o número da carta em "Suas cartas"; outra carta aleatória é descartada)' : 'não é possível (precisa de pelo menos 2 cartas)') + '.');
  lines.push('Se quiser fazer ações de equipe, coloque este bloco ANTES do bloco da ação principal:', '```', 'EQUIPE',
    'VASSALAGEM <território> PARA <aliado>', 'DESVASSALAR <território>', 'ENVIAR CARTA <número> PARA <aliado>', 'FIM EQUIPE', '```',
    '(use só as linhas que quiser; elas são executadas na ordem, antes da ação principal)');
  return lines.join('\n');
}

function actionText(game: Game) {
  if (game.isPlacing()) return placementAction(game);
  if (game.stage === 'attack') return attackAction(game);
  if (game.stage === 'move') return moveAction(game);
  if (game.stage === 'trade' && game.s.tradeSub === 'choose') return tradeAction(game);
  return 'Não há ação para você agora.';
}

export function canBuildAiPrompt(state: GameState | null): boolean {
  return !!state && state.current >= 0 && state.stage !== 'over';
}

export function buildAiPrompt(state: GameState): string {
  const game = Game.load(cloneState(state));
  const pl = game.player;
  return [
    `# Guerra Mundial — vez de ${pl.name} (rodada ${game.s.round})`,
    '',
    `Você é a IA que joga como o jogador **${pl.name}** em uma partida do jogo de estratégia "Guerra Mundial" ` +
      `(estilo "conquiste o mundo"). Seu objetivo é vencer a partida. Leia as regras, o estado atual e decida ` +
      `a ação da vez.`,
    '',
    rulesText(),
    '',
    game.s.teamMode ? teamRulesText(game) + '\n' : null,
    `## Situação atual`,
    `Rodada ${game.s.round}. Etapa atual: ${STAGE_NAMES[game.stage] || game.stage}. Jogador da vez: ${pl.name}.`,
    '',
    worldText(game),
    '',
    playerText(game),
    '',
    '## Sua ação agora',
    actionText(game) + teamActionText(game),
    '',
    '## Como responder',
    '- Execute apenas a ação da vez descrita em "Sua ação agora" — nada de etapas seguintes.',
    '- Responda somente com o bloco da ação, no formato indicado, sem explicações' + (game.s.teamMode ? ' (opcionalmente precedido do bloco EQUIPE).' : '.'),
    '- Escreva os nomes dos territórios exatamente como aparecem neste texto.',
    '- A ação precisa respeitar as regras; se não for possível agir, use a opção de encerrar/não fazer nada.',
    '',
  ].filter((x) => x !== null).join('\n');
}

export function aiPromptFileName(state: GameState): string {
  const game = Game.load(state);
  const slug = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `guerra-mundial-rodada${game.s.round}-${slug(game.player.name)}-${slug(STAGE_NAMES[game.stage] || game.stage)}.txt`;
}
