import { createSession, verifyPassword } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { errorResponse, readJson } from "@/lib/server/rooms";

export async function POST(request: Request) {
  try {
    const { username, password } = await readJson<{ username?: string; password?: string }>(request);
    if (typeof username !== "string" || typeof password !== "string") {
      return Response.json({ error: "Informe usuário e senha." }, { status: 400 });
    }
    const user = await db().user.findUnique({ where: { username } });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return Response.json({ error: "Usuário ou senha incorretos." }, { status: 401 });
    }
    await createSession(user.id);
    return Response.json({ user: { id: user.id, username: user.username } });
  } catch (err) {
    return errorResponse(err);
  }
}
