// Loads .env.local for the command line scripts. Next.js does this itself for the app.
import fs from "node:fs";

export function loadEnv(): void {
  if (fs.existsSync(".env.local")) process.loadEnvFile(".env.local");
}
