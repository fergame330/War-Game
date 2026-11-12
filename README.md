# Guerra Mundial

Jogo de estratégia por turnos no estilo "conquiste o mundo", feito com HTML, CSS e JavaScript puros
(sem frameworks e sem build). Vários jogadores jogam no mesmo computador, passando a vez.

## Como jogar

Abra o `index.html` no navegador (duplo clique já funciona). Também dá para servir a pasta:

```bash
python3 -m http.server 8000   # depois acesse http://localhost:8000
```

1. **Começar jogo** → escolha de 2 a 9 jogadores.
2. As cores e a ordem são sorteadas e os 79 territórios são divididos igualmente; os primeiros da ordem
   ficam com o que sobrar da divisão. Cada território começa com 1 exército.
3. Quem começa com um continente inteiro coloca o bônus dele nesse continente.
4. Cada jogador recebe metade dos exércitos que tem (arredondado para baixo) para colocar onde quiser.
5. Cada rodada tem as etapas abaixo. **Em cada etapa todos os jogadores agem, na ordem, antes da próxima**
   (todos atacam; depois todos fazem a passagem; e assim por diante):
   - **Reforços** (a partir da 2ª rodada): primeiro todos colocam o bônus de cada continente dominado (no
     próprio continente); depois todos colocam o bônus de territórios (metade do número de territórios).
   - **Ataque**: o atacante rola `exércitos − 1` dados, o defensor `exércitos` (máximo de 3 cada). Os dados são
     comparados do maior para o menor e o empate é da defesa. O território conquistado fica com 0 exércitos até
     você clicar nele e enviar de 1 a 3. Você pode continuar atacando com o mesmo território enquanto, mesmo
     perdendo a batalha, sobrarem exércitos para ocupar todos os territórios que ele conquistou + 1.
   - **Passagem**: só para vizinhos, e só com os exércitos que já estavam no território no início da passagem.
     Dentro de um continente que é todo seu a movimentação é livre. Quem não tem o que passar é pulado.
   - **Cartas**: depois da passagem de todos, quem conquistou ao menos 1 território ganha 1 carta (bolinha,
     quadrado, triângulo, estrela ou coringa) com um território aleatório.
   - **Trocas**: 4 cartas do mesmo naipe (o coringa vale por qualquer um) valem 4, 6, 8, 10, 12, 15, 20, 25,
     30, 35, 40… exércitos, contando as trocas de todos os jogadores. Cada carta com um território seu dá +3
     exércitos nele. Quem não tem troca possível é pulado.
6. Quem elimina um jogador recebe as cartas dele. Vence quem dominar o mundo.

### Bônus dos continentes

| Continente | Bônus | | Continente | Bônus |
|---|---|---|---|---|
| América do Norte | 2 | | Oriente Médio | 2 |
| América Central | 3 | | Europa | 4 |
| América do Sul | 4 | | Ásia | 4 |
| África | 5 | | Oceania | 2 |
| Antártida | 1 | | Ártico | 1 |

### Controles

- Roda do mouse / pinça ou botões **+ / −** para zoom; arraste para mover o mapa.
- Colocação: clique no território para adicionar (escolha +1, +5, +10 ou Todos); botão direito remove.
- Ataque: clique no seu território e depois no inimigo vizinho (ou clique direto no inimigo para usar o seu
  vizinho mais forte). "Atacar até conquistar" repete os ataques automaticamente.
- Passe o mouse sobre um território para ver dono, exércitos e fronteiras (inclusive as marítimas,
  desenhadas com linhas tracejadas).

### Jogar com uma IA

Na vez de qualquer jogador, o botão **🤖 Baixar prompt p/ IA** (no painel do turno e na troca de cartas) baixa
um arquivo `.txt` com todas as regras, o estado do mundo (jogadores, continentes, territórios, exércitos e
fronteiras), os dados do jogador da vez (territórios, cartas) e as ações possíveis naquele momento. O prompt
pede para a IA responder **apenas a ação da vez** num formato fixo, por exemplo:

```
COLOCAR
Brasil: 3
Argentina: 2
```

```
ATACAR Brasil -> Gana
```

Envie o arquivo (ou use **Copiar**) para a IA e aplique no tabuleiro a ação que ela responder. No ataque, cada
batalha depende dos dados, então gere um novo prompt depois de cada ação.

## Estrutura

```
index.html          telas e layout
css/style.css       visual
js/data.js          continentes, territórios e fronteiras
js/mapdata.js       caminhos SVG do mapa (gerado)
js/game.js          regras do jogo (sem DOM)
js/ai-prompt.js     gera o prompt para uma IA jogar a vez (sem DOM)
js/ui.js            mapa interativo, painéis e modais
tools/build-map.js  gera js/mapdata.js a partir do Natural Earth
tests/simulate.js   simula partidas aleatórias verificando as regras
```

### Mapa

O mapa usa a geografia do [Natural Earth](https://www.naturalearthdata.com/) (domínio público, via pacote
`world-atlas`). Países que não estão na lista do jogo foram incorporados a territórios vizinhos — por
exemplo, Saara = Saara Ocidental, Mauritânia, Mali e Níger; Iugoslávia inclui a Romênia; Israel inclui
Líbano, Palestina, Jordânia e Síria; Islândia faz parte da Groenlândia. A lista completa está em
`tools/build-map.js` (`COUNTRY_TO_TERRITORY`). Para regenerar:

```bash
cd tools && npm install && npm run build-map
```

### Testes

```bash
node tests/simulate.js      # simula partidas e confere as regras/invariantes
```
