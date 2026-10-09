#!/usr/bin/env node
import { access } from 'node:fs/promises';
const entry = new URL('../apps/cli/dist/index.js', import.meta.url);
try {
  await access(entry);
} catch {
  console.error('Build ausente. Execute npm run build na pasta do gpeek.');
  process.exit(1);
}
await import(entry.href);
