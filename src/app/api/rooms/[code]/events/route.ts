import { connection } from "next/server";
import { db } from "@/lib/server/db";
import { buildPayload, errorResponse, isBotRoom, loadRoom, requireUser, runBots, tick, touchPresence } from "@/lib/server/rooms";

// Tempo máximo da função na Vercel; o cliente reconecta sozinho quando a conexão fecha.
export const maxDuration = 300;

const STREAM_MS = 240_000; // fecha antes do limite da plataforma
const POLL_MS = 900; // verifica a versão da sala
const BOT_POLL_MS = 350; // na vez de um bot: faz o bot jogar e envia as jogadas mais rápido
const PRESENCE_MS = 5_000; // registra presença e reenvia o status de conexão de todos
const TICK_MS = 3_000; // prazos de reconexão

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Atualizações em tempo real (Server-Sent Events). Cada mensagem é a sala inteira,
 * já filtrada para o usuário (as cartas dos outros vêm ocultas).
 */
export async function GET(request: Request, ctx: RouteContext<"/api/rooms/[code]/events">) {
  // sempre dinâmico: lê cookies e o banco a cada requisição
  await connection();
  try {
    const user = await requireUser();
    const { code } = await ctx.params;
    const first = await loadRoom(code);
    const isMember = first.players.some((p) => p.userId === user.id);
    const encoder = new TextEncoder();
    const signal = request.signal;

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (data: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        const started = Date.now();
        let lastVersion = -1;
        let lastPresence = 0;
        let lastTick = 0;
        let botTurn = isBotRoom(first);
        try {
          controller.enqueue(encoder.encode("retry: 1500\n\n"));
          while (!signal.aborted && Date.now() - started < STREAM_MS) {
            const now = Date.now();
            let forceSend = false;
            if (isMember && now - lastPresence >= PRESENCE_MS) {
              await touchPresence(first.id, user.id);
              lastPresence = now;
              forceSend = true; // status online/offline e contadores
            }
            if (now - lastTick >= TICK_MS) {
              lastTick = now;
              await tick(code).catch((e) => console.error("tick", e));
            }
            if (botTurn) await runBots(code).catch((e) => console.error("bots", e));
            const head = await db().room.findUnique({ where: { id: first.id }, select: { version: true } });
            if (!head) {
              send({ deleted: true });
              break;
            }
            if (head.version !== lastVersion || forceSend) {
              lastVersion = head.version;
              const room = await loadRoom(code);
              botTurn = isBotRoom(room);
              send(buildPayload(room, user.id));
            }
            await sleep(botTurn ? BOT_POLL_MS : POLL_MS);
          }
        } catch (e) {
          if (!signal.aborted) console.error("events", e);
        } finally {
          try {
            controller.close();
          } catch {
            /* já fechado */
          }
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
