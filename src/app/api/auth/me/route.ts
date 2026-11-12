import { connection } from "next/server";
import { getSessionUser } from "@/lib/server/auth";
import { errorResponse } from "@/lib/server/rooms";

export async function GET() {
  // sempre dinâmico: lê cookies e o banco a cada requisição
  await connection();
  try {
    return Response.json({ user: await getSessionUser() });
  } catch (err) {
    return errorResponse(err);
  }
}
