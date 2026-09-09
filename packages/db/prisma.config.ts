import { defineConfig, env } from 'prisma/config';

// Prisma 7 config (replaces Prisma 6-style `url = env(...)` in schema.prisma
// and the `prisma.seed` key in package.json — both are ignored by Prisma 7).
// DATABASE_URL is read from the environment (.env, never committed);
// see .env.example for the placeholder.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
