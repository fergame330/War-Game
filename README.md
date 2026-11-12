# Guerra Mundial

Jogo de estratégia por turnos no estilo "conquiste o mundo", feito com **Next.js 16 (App Router) + React 19 +
TypeScript (TSX) + Tailwind CSS 4 + ESLint**, banco **PostgreSQL** com **Prisma ORM 7** e pronto para a **Vercel**.

- **No mesmo aparelho**: todos jogam no mesmo navegador, passando a vez (individual de 2 a 9, duplas, trios e
  quartetos).
- **Online**: contas com usuário e senha, salas com código, partidas em tempo real nos modos **1x1** (todos contra
  todos, de 2 a 9 jogadores), **2x2, 2x2x2, 2x2x2x2, 3x3, 3x3x3 e 4x4**.

## Rodar localmente

Requisitos: Node.js 22+ e um PostgreSQL.

```bash
npm install                      # também gera o Prisma Client (postinstall)
cp .env.example .env             # ajuste a URL do banco
npx prisma migrate dev           # cria as tabelas
npm run dev                      # http://localhost:3000
```

Outros comandos:

```bash
npm run lint        # ESLint
npm run typecheck   # TypeScript
npm test            # testes do motor do jogo (Vitest)
npm run build       # build de produção
npm run build-map   # regenera o mapa (src/lib/game/mapdata.json) a partir do Natural Earth
```

## Publicar na Vercel

1. Importe o repositório na Vercel (framework detectado: Next.js).
2. Crie o banco: em **Storage → Marketplace**, adicione **Prisma Postgres** (ou Neon) e conecte ao projeto.
3. Confira as variáveis em **Settings → Environment Variables**. O app aceita qualquer uma destas:

   | Variável | Uso |
   |---|---|
   | `DATABASE_URL_POOLED` | conexão **com pool**, usada pelo app (recomendada na Vercel) |
   | `DATABASE_URL` ou `POSTGRES_URL` | conexão **direta**, usada pelas migrações no build (e pelo app, se não houver a com pool) |
   | `PRISMA_DATABASE_URL` | usada só se for uma URL `postgres://`; a do Accelerate (`prisma+postgres://`) é ignorada |

4. Faça o deploy (ou **Redeploy**, se mudou variáveis: elas só valem para deploys novos). O script
   `vercel-build` roda `prisma generate`, aplica as migrações (`prisma migrate deploy`) e faz o `next build`.

## Como funciona o online

- **Contas**: usuário + senha (hash com scrypt). A sessão é um token aleatório num cookie `httpOnly`; o banco
  guarda só o hash do token.
- **Salas**: quem cria escolhe o modo e se o **tempo de reconexão** fica ligado; recebe um código de 6 letras.
  Os outros entram pelo código (ou pelo link). No 1x1 o dono inicia quando quiser, com 2 a 9 jogadores; nos modos
  de equipe, quando a sala está cheia. Cores, ordem, equipes e territórios são sorteados.
- **Servidor autoritativo**: o estado da partida fica no PostgreSQL (`Room.state`, JSON). Cada jogada é enviada
  para `POST /api/rooms/[código]/action`, validada pelo mesmo motor do jogo e gravada com **concorrência
  otimista** (campo `version`). As cartas dos outros jogadores nunca são enviadas ao navegador, só a quantidade.
- **Tempo real**: `GET /api/rooms/[código]/events` é um stream **Server-Sent Events**. Ele verifica a versão da
  sala a cada ~1 s e envia o estado novo a todos assim que alguém joga. A conexão fecha antes do limite de
  duração das funções da Vercel e o navegador reconecta sozinho, sem precisar de serviço extra (WebSocket, Pusher
  etc.).
- **Presença e reconexão**: a conexão em tempo real registra presença a cada 5 s. Sem sinal por 15 s o jogador
  aparece como desconectado e todos veem um contador de **3 minutos**; se ele voltar, o contador some. Se o prazo
  acabar, há **dissolução**: os territórios dele vão para os aliados (sem aliados, para os inimigos) e as cartas
  são sorteadas, metade para aliados e metade para inimigos. A verificação roda a partir das conexões dos outros
  jogadores, sem cron.
- **Desistência**: qualquer jogador vota; quando **metade + 1** dos jogadores vivos da equipe votam, a equipe
  desiste e seus territórios e cartas vão para a equipe inimiga com menos territórios. O voto pode ser retirado.

## Regras

1. Cores e ordem são sorteadas; os 79 territórios são divididos igualmente e os primeiros da ordem ficam com o
   resto. Cada território começa com 1 exército.
2. Quem começa com um continente inteiro coloca o bônus dele nesse continente; depois cada jogador recebe metade
   dos exércitos que tem (para baixo).
3. Cada rodada tem as etapas abaixo. **Em cada etapa todos os jogadores agem, na ordem, antes da próxima**:
   - **Reforços** (a partir da 2ª rodada): primeiro todos colocam o bônus dos continentes dominados (no próprio
     continente); depois todos colocam o bônus de territórios (metade do número de territórios).
   - **Ataque**: o atacante rola `exércitos − 1` dados e o defensor `exércitos` (máximo de 3 cada); os dados são
     comparados do maior para o menor e o empate é da defesa. O território conquistado fica vazio até você enviar
     de 1 a 3 exércitos. Dá para continuar atacando com o mesmo território enquanto, mesmo perdendo a batalha,
     sobrarem exércitos para ocupar o que ele conquistou + 1.
   - **Passagem**: só para vizinhos e só com os exércitos que já estavam no território no início da passagem;
     dentro de um continente que é todo seu a movimentação é livre.
   - **Cartas**: depois da passagem de todos, quem conquistou ao menos 1 território ganha 1 carta.
   - **Trocas**: 4 cartas do mesmo naipe (coringa vale por qualquer um) valem 4, 6, 8, 10, 12, 15, 20, 25, 30…
     exércitos; cada carta com território seu dá +3 nele.
4. Quem elimina um jogador recebe as cartas dele. Vence quem dominar o mundo.

| Continente | Bônus | | Continente | Bônus |
|---|---|---|---|---|
| América do Norte | 2 | | Oriente Médio | 2 |
| América Central | 3 | | Europa | 4 |
| América do Sul | 4 | | Ásia | 4 |
| África | 5 | | Oceania | 2 |
| Arctogea (Ártico + Antártida) | 1 | | | |

### Equipes

Duplas (4, 6 ou 8 jogadores), trios (6 ou 9) e quartetos (8). A ordem alterna as equipes (A B C A B C…), então
ninguém da mesma equipe joga em seguida.

- Aliados não se atacam.
- **Passagem para aliado**: chega a metade dos exércitos enviados (para baixo).
- **Enviar carta** a um aliado: outra carta aleatória da mão é descartada (é preciso ter 2 cartas).
- **Vassalagem** (na passagem ou na colocação): um território seu passa a ser do aliado, ficando com metade dos
  exércitos (para cima). Mantenha pelo menos 1 território próprio. O vassalo conta para o dono original no bônus
  de territórios; só o dono original pode retomá-lo (sem recuperar exércitos).
- Continente só é dominado por um único jogador.
- Eliminação: metade das cartas (para cima) para quem eliminou, o resto sorteado entre os aliados do eliminado.

### Prompt para IA

Na sua vez, **🤖 Baixar prompt p/ IA** (ou **Copiar**) gera um texto com as regras, o estado do mundo, seus dados
e as ações possíveis, pedindo que a IA responda apenas a ação da vez num formato fixo. O texto se adapta ao modo:
individual ou equipes (regras de equipe, ações de vassalagem, envio de carta e passagem para aliado) e, no online,
explica o tempo de reconexão e a desistência.

## Estrutura

```
prisma/schema.prisma          modelos: User, Session, Room, RoomPlayer
prisma.config.ts              configuração do Prisma 7 (URL do banco: src/lib/database-url.ts)
src/lib/game/                 motor do jogo (sem React): data.ts, engine.ts, aiPrompt.ts, mapdata.json
src/lib/server/               servidor: db.ts (Prisma + adapter-pg), auth.ts, rooms.ts
src/lib/online/               tipos e cliente da API
src/app/api/                  rotas: auth/*, rooms/*, rooms/[code]/{join,leave,start,action,events}
src/app/                      páginas: / (início), /local, /online, /sala/[code]
src/components/game/          mapa (SVG com zoom), painéis, modais, GameView
src/components/online/        login, salas, lobby
tools/build-map.mjs           gera o mapa a partir do Natural Earth (world-atlas)
```

Geografia: [Natural Earth](https://www.naturalearthdata.com/) (domínio público), via `world-atlas`.
