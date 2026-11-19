#!/usr/bin/env node
/**
 * Database Switcher & Cloud Provider Manager
 * Supports Free Web-Based Databases:
 *  - Neon Serverless PostgreSQL (https://neon.tech)
 *  - Supabase Cloud PostgreSQL (https://supabase.com)
 *  - Local SQLite (Development & Offline sandbox)
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const targetArg = (process.argv[2] || 'auto').toLowerCase();
const shouldPush = process.argv.includes('--push');

// 1. Read .env if present
const envPath = path.join(rootDir, '.env');
let databaseUrl = process.env.DATABASE_URL || '';
let dbType = process.env.DB_TYPE || '';

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.substring(1, value.length - 1);
      }
      if (key === 'DATABASE_URL' && !process.env.DATABASE_URL) databaseUrl = value;
      if (key === 'DB_TYPE' && !process.env.DB_TYPE) dbType = value;
    }
  }
}

// 2. Determine target provider
let targetProvider = 'sqlite';
if (targetArg === 'postgres' || targetArg === 'postgresql') {
  targetProvider = 'postgresql';
} else if (targetArg === 'sqlite') {
  targetProvider = 'sqlite';
} else {
  // Auto-detect based on DATABASE_URL or DB_TYPE
  if (
    databaseUrl.startsWith('postgresql://') ||
    databaseUrl.startsWith('postgres://') ||
    dbType.toLowerCase() === 'postgresql' ||
    dbType.toLowerCase() === 'postgres'
  ) {
    targetProvider = 'postgresql';
  } else {
    targetProvider = 'sqlite';
  }
}

console.log(`\n======================================================`);
console.log(` SMART HIGHWAY WFM - DATABASE CONFIGURATION MANAGER`);
console.log(` Target Provider: ${targetProvider.toUpperCase()}`);
if (targetProvider === 'postgresql') {
  console.log(` Mode: Web-Based Cloud Database (Neon / Supabase / Postgres)`);
} else {
  console.log(` Mode: Local Relational Database (SQLite)`);
}
console.log(`======================================================\n`);

// 3. Source schema file
const schemaPath = path.join(rootDir, 'prisma', 'schema.prisma');
const postgresSchemaPath = path.join(rootDir, 'prisma', 'schema.postgresql.prisma');
const sqliteSchemaPath = path.join(rootDir, 'prisma', 'schema.sqlite.prisma');

const sourceFile = targetProvider === 'postgresql' ? postgresSchemaPath : sqliteSchemaPath;

if (!fs.existsSync(sourceFile)) {
  console.error(`Error: Source schema file not found at ${sourceFile}`);
  process.exit(1);
}

// Copy source schema to schema.prisma
fs.copyFileSync(sourceFile, schemaPath);
console.log(`[OK] Copied ${path.basename(sourceFile)} -> prisma/schema.prisma`);

// 4. Update .env DB_TYPE if present
if (fs.existsSync(envPath)) {
  let envText = fs.readFileSync(envPath, 'utf8');
  if (envText.includes('DB_TYPE=')) {
    envText = envText.replace(/DB_TYPE=.*/g, `DB_TYPE=${targetProvider}`);
  } else {
    envText += `\nDB_TYPE=${targetProvider}\n`;
  }
  fs.writeFileSync(envPath, envText, 'utf8');
  console.log(`[OK] Updated DB_TYPE=${targetProvider} in .env`);
}

// 5. Run Prisma generate
console.log(`[*] Generating Prisma Client for ${targetProvider}...`);
try {
  execSync('npx prisma generate', { cwd: rootDir, stdio: 'inherit' });
  console.log(`[OK] Prisma Client successfully generated.`);
} catch (err) {
  console.error(`[FAIL] Failed to generate Prisma Client:`, err);
  process.exit(1);
}

// 6. Optional db push if requested
if (shouldPush) {
  console.log(`\n[*] Pushing database schema to ${targetProvider}...`);
  try {
    execSync('npx prisma db push', { cwd: rootDir, stdio: 'inherit' });
    console.log(`[OK] Database schema pushed successfully.`);
  } catch (err) {
    console.error(`[FAIL] Failed to push schema:`, err);
    process.exit(1);
  }
}

console.log(`\nConfiguration completed successfully!`);
if (targetProvider === 'postgresql') {
  console.log(`To connect your Free Web-Based Database:`);
  console.log(` 1. Create a free database at https://neon.tech or https://supabase.com`);
  console.log(` 2. Set DATABASE_URL in .env (e.g. postgresql://user:pass@ep-xyz.neon.tech/neondb?sslmode=require)`);
  console.log(` 3. Run: npm run db:push && npm run db:seed`);
}
console.log(`\n======================================================\n`);
