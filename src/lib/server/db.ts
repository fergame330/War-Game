import "server-only";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Uma única instância por processo (cada PrismaClient tem seu próprio pool de conexões).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL não configurada");
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

/** Cliente do banco (criado na primeira consulta, para o build funcionar sem banco). */
export function db(): PrismaClient {
  if (!globalForPrisma.prisma) globalForPrisma.prisma = createClient();
  return globalForPrisma.prisma;
}
