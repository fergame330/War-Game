import "dotenv/config";
import { defineConfig } from "prisma/config";
import { migrationDatabaseUrl } from "./src/lib/database-url";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Lido do ambiente (.env em desenvolvimento; variáveis do projeto na Vercel).
    // Migrações usam a conexão direta: DATABASE_URL, depois POSTGRES_URL (veja src/lib/database-url.ts).
    url: migrationDatabaseUrl(),
  },
});
