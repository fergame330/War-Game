import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Lido do ambiente (.env em desenvolvimento; variáveis do projeto na Vercel).
    url: process.env["DATABASE_URL"],
  },
});
