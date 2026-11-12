import { Prisma } from "@/generated/prisma/client";
import { createSession, hashPassword, validateCredentials } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { errorResponse, readJson } from "@/lib/server/rooms";

export async function POST(request: Request) {
  try {
    const { username, password } = await readJson<{ username?: string; password?: string }>(request);
    const invalid = validateCredentials(username, password);
    if (invalid) return Response.json({ error: invalid }, { status: 400 });
    try {
      const user = await db().user.create({
        data: { username: username!, passwordHash: await hashPassword(password!) },
        select: { id: true, username: true },
      });
      await createSession(user.id);
      return Response.json({ user });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return Response.json({ error: "Esse nome de usuário já existe." }, { status: 409 });
      }
      throw e;
    }
  } catch (err) {
    return errorResponse(err);
  }
}
