import { describe, expect, it } from "vitest";
import { migrationDatabaseUrl, runtimeDatabaseUrl } from "./database-url";

const direct = "postgres://u:p@db.prisma.io:5432/postgres?sslmode=require";
const pooled = "postgres://u:p@pooled.db.prisma.io:5432/postgres?sslmode=require";
const accelerate = "prisma+postgres://accelerate.prisma-data.net/?api_key=x";

describe("escolha da URL do banco", () => {
  it("variáveis da Vercel sem DATABASE_URL", () => {
    const env = { POSTGRES_URL: direct, DATABASE_URL_POOLED: pooled, PRISMA_DATABASE_URL: accelerate };
    expect(runtimeDatabaseUrl(env)).toBe(pooled); // app: com pool
    expect(migrationDatabaseUrl(env)).toBe(direct); // migrações: direta
  });

  it("DATABASE_URL tem prioridade para migrações", () => {
    const env = { DATABASE_URL: direct, POSTGRES_URL: "postgres://outro", DATABASE_URL_POOLED: pooled };
    expect(migrationDatabaseUrl(env)).toBe(direct);
    expect(runtimeDatabaseUrl(env)).toBe(pooled);
  });

  it("ignora PRISMA_DATABASE_URL do Accelerate e valores vazios", () => {
    expect(runtimeDatabaseUrl({ PRISMA_DATABASE_URL: accelerate, DATABASE_URL_POOLED: "" })).toBeUndefined();
    expect(runtimeDatabaseUrl({ PRISMA_DATABASE_URL: direct })).toBe(direct);
  });

  it("só a URL com pool também serve para migrações", () => {
    expect(migrationDatabaseUrl({ DATABASE_URL_POOLED: pooled })).toBe(pooled);
  });
});
