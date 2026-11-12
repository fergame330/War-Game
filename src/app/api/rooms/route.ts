import { connection } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { isOnlineMode, ONLINE_MODES } from "@/lib/game/engine";
import { db } from "@/lib/server/db";
import { errorResponse, generateCode, readJson, requireUser } from "@/lib/server/rooms";

/** Salas em que o usuário está (para voltar a elas). */
export async function GET() {
  // sempre dinâmico: lê cookies e o banco a cada requisição
  await connection();
  try {
    const user = await requireUser();
    const rooms = await db().room.findMany({
      where: { players: { some: { userId: user.id } }, status: { in: ["LOBBY", "PLAYING"] } },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: { code: true, mode: true, status: true, _count: { select: { players: true } } },
    });
    return Response.json({
      rooms: rooms.map((r) => ({
        code: r.code,
        mode: r.mode,
        status: r.status,
        players: r._count.players,
        capacity: isOnlineMode(r.mode) ? ONLINE_MODES[r.mode].players : 0,
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Cria uma sala e coloca o criador nela. */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const { mode, reconnectTimer } = await readJson<{ mode?: string; reconnectTimer?: boolean }>(request);
    if (!mode || !isOnlineMode(mode)) return Response.json({ error: "Modo inválido." }, { status: 400 });
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        const room = await db().room.create({
          data: {
            code: generateCode(),
            mode,
            reconnectTimer: reconnectTimer !== false,
            hostId: user.id,
            players: { create: { userId: user.id } },
          },
          select: { code: true },
        });
        return Response.json({ code: room.code });
      } catch (e) {
        // código repetido: tenta outro
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
      }
    }
    return Response.json({ error: "Não foi possível gerar um código." }, { status: 500 });
  } catch (err) {
    return errorResponse(err);
  }
}
