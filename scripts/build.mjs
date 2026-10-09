import { rm, mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';
import { build } from 'vite';
const result = spawnSync(
  process.execPath,
  ['node_modules/typescript/bin/tsc', '--noEmit'],
  { stdio: 'inherit' },
);
if (result.status !== 0) process.exit(result.status ?? 1);
const config = ts.parseJsonConfigFileContent(
  ts.readConfigFile('tsconfig.json', ts.sys.readFile).config,
  ts.sys,
  '.',
);
const program = ts.createProgram(config.fileNames, config.options);
for (const project of [
  'apps/cli',
  'apps/server',
  'packages/contracts',
  'packages/core',
  'packages/git',
]) {
  await rm(`${project}/dist`, { recursive: true, force: true });
  await mkdir(`${project}/dist`, { recursive: true });
  for (const file of program.getSourceFiles()) {
    const name = file.fileName.replaceAll('\\', '/');
    const marker = `${project}/src/`;
    const offset = name.indexOf(marker);
    if (offset < 0 || name.endsWith('.d.ts')) continue;
    const relative = name.slice(offset + marker.length).replace(/\.ts$/, '.js');
    const output = ts.transpileModule(file.text, {
      compilerOptions: config.options,
    }).outputText;
    const target = `${project}/dist/${relative}`;
    await mkdir(target.slice(0, target.lastIndexOf('/')), { recursive: true });
    await writeFile(target, output);
  }
}
await build({ root: 'apps/web', configFile: 'apps/web/vite.config.ts' });
