import { PrismaClient } from '@prisma/client';
import CONFIG from '../config.js';

// Safe masked database target identifier for security auditing
export function getMaskedDatabaseTarget(): string {
  const url = CONFIG.DATABASE.URL;
  if (url.startsWith('file:')) {
    return `SQLite Local File (${url})`;
  }
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const provider = host.includes('neon.tech')
      ? 'Neon Serverless Cloud Postgres'
      : host.includes('supabase.co')
      ? 'Supabase Cloud Postgres'
      : 'Cloud PostgreSQL';
    return `${provider} (host: ${host}, db: ${parsed.pathname.replace(/^\//, '')})`;
  } catch {
    return 'Secured Relational Database Engine';
  }
}

// Instantiate single Prisma client
export const prisma = new PrismaClient({
  log: CONFIG.SERVER.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

// Graceful disconnection handler
export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
}
