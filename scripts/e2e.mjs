import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
let cli;
try {
  cli = fileURLToPath(import.meta.resolve('@playwright/test/cli'));
} catch {
  console.error(
    'Playwright não instalado. Execute npm ci e npx playwright install --with-deps chromium antes de npm run test:e2e.',
  );
  process.exit(1);
}
const child = spawn(process.execPath, [cli, 'test', ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: false,
});
child.once('error', () => {
  console.error('Não foi possível iniciar o Playwright.');
  process.exitCode = 1;
});
child.once('exit', (code) => {
  process.exitCode = code ?? 1;
});
