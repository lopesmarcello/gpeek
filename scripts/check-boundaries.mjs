import { checkBoundaries } from './boundaries.mjs';
const errors = await checkBoundaries();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else console.log('Fronteiras entre módulos verificadas.');
