/*
 * Escolhe a URL de conexão do PostgreSQL entre as variáveis que a Vercel / Prisma Postgres
 * costumam criar. Usado pelo app (src/lib/server/db.ts) e pelos comandos do Prisma (prisma.config.ts).
 */

type Env = Record<string, string | undefined>;

const isPostgresUrl = (v: string | undefined): v is string => !!v && /^postgres(ql)?:\/\//.test(v.trim());

// PRISMA_DATABASE_URL só serve se for uma URL postgres:// comum; em bancos antigos ela é
// prisma+postgres:// (Accelerate), que não funciona com o adapter-pg.
const prismaUrl = (env: Env) => (isPostgresUrl(env.PRISMA_DATABASE_URL) ? env.PRISMA_DATABASE_URL : undefined);

/** Para o app em execução: prefere a conexão com pool (melhor para funções serverless). */
export function runtimeDatabaseUrl(env: Env = process.env): string | undefined {
  return [env.DATABASE_URL_POOLED, env.DATABASE_URL, env.POSTGRES_URL, prismaUrl(env)].find(isPostgresUrl)?.trim();
}

/** Para migrações (prisma migrate): prefere a conexão direta, sem pool. */
export function migrationDatabaseUrl(env: Env = process.env): string | undefined {
  return [env.DATABASE_URL, env.POSTGRES_URL, prismaUrl(env), env.DATABASE_URL_POOLED].find(isPostgresUrl)?.trim();
}

export const DATABASE_ENV_HELP =
  "Configure DATABASE_URL_POOLED, DATABASE_URL ou POSTGRES_URL com uma URL postgres:// do seu banco.";
