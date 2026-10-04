import { config as loadEnvFile } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, env } from 'prisma/config';

// Prisma 7 config (replaces Prisma 6-style `url = env(...)` in schema.prisma
// and the `prisma.seed` key in package.json — both are ignored by Prisma 7).
// DATABASE_URL is read from the environment; see .env.example for the
// placeholder.
//
// Prisma 7 does NOT auto-load .env files once a config file exists, so
// `env('DATABASE_URL')` throws unless the variable is already in the process
// environment. That made the documented setup (`cp .env.example .env` then
// `npm install`) fail at the repo's postinstall hook, which runs
// `prisma generate`. So the env files are loaded here, before it is read.
//
// dotenv is already a devDependency of this package and this file is only
// ever loaded by the Prisma CLI, which is a development tool. Neither load
// overrides a variable that is already set (dotenv's default), so an exported
// DATABASE_URL still wins, and a missing file is ignored so the original,
// clearer error still fires when nothing provides the variable.
const here = dirname(fileURLToPath(import.meta.url));
loadEnvFile({ path: resolve(here, '../../.env'), quiet: true });
loadEnvFile({ path: resolve(here, '.env'), quiet: true });

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
