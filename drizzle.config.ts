import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Please copy .env.example to .env, set the appropriate values, and run 'drizzle-kit migrate' to initialize the database."
  );
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  // Change dialect here if switching to a different SQL database (e.g., "mysql" or "sqlite")
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
