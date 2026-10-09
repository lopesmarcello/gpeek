import { readdir, readFile } from 'node:fs/promises';
import { resolve, relative, dirname, sep } from 'node:path';
import { builtinModules } from 'node:module';
import ts from 'typescript';
const projects = {
  cli: 'apps/cli',
  server: 'apps/server',
  web: 'apps/web',
  core: 'packages/core',
  git: 'packages/git',
  contracts: 'packages/contracts',
};
const allowed = {
  cli: ['server', 'git', 'contracts'],
  server: ['core', 'git', 'contracts'],
  web: ['contracts'],
  core: [],
  git: ['core'],
  contracts: [],
};
const builtins = new Set(
  builtinModules.flatMap((name) => [name, `node:${name}`]),
);
export function violation(
  project,
  specifier,
  file = `${projects[project]}/src/index.ts`,
) {
  if (!projects[project]) return 'Unknown project';
  if (
    (project === 'core' || project === 'contracts' || project === 'web') &&
    builtins.has(specifier)
  )
    return `${project} cannot import Node builtins`;
  let target;
  if (specifier.startsWith('@gpeek/'))
    target = specifier.slice(7).split('/')[0];
  else if (specifier.startsWith('.')) {
    const resolved = resolve(dirname(file), specifier);
    const entry = Object.entries(projects).find(([, directory]) =>
      resolved.startsWith(resolve(directory) + sep),
    );
    if (!entry) return `${project} cannot import outside its workspace modules`;
    target = entry[0];
  }
  if (target && target !== project && !allowed[project].includes(target))
    return `${project} cannot import ${target}`;
  if (project === 'core' && !target)
    return 'core cannot import external dependencies';
  if (project === 'contracts' && !target && specifier !== 'zod')
    return 'contracts may only import zod';
  if (
    project === 'web' &&
    !target &&
    !['react', 'react-dom'].some(
      (name) => specifier === name || specifier.startsWith(name + '/'),
    )
  )
    return 'web may only import React and contracts';
  return undefined;
}
export async function checkBoundaries() {
  const errors = [];
  async function walk(directory, project) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = `${directory}/${entry.name}`;
      if (entry.isDirectory()) await walk(file, project);
      else if (/\.tsx?$/.test(file)) {
        const source = ts.createSourceFile(
          file,
          await readFile(file, 'utf8'),
          ts.ScriptTarget.Latest,
          true,
        );
        function inspect(node) {
          let specifier;
          if (
            (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
            node.moduleSpecifier &&
            ts.isStringLiteral(node.moduleSpecifier)
          )
            specifier = node.moduleSpecifier.text;
          if (
            ts.isImportTypeNode(node) &&
            ts.isLiteralTypeNode(node.argument) &&
            ts.isStringLiteral(node.argument.literal)
          )
            specifier = node.argument.literal.text;
          if (
            ts.isCallExpression(node) &&
            (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
              (ts.isIdentifier(node.expression) &&
                node.expression.text === 'require'))
          ) {
            const argument = node.arguments[0];
            if (argument && ts.isStringLiteral(argument))
              specifier = argument.text;
            else errors.push(`${file}: dynamic module paths are forbidden`);
          }
          if (specifier !== undefined) {
            const error = violation(project, specifier, file);
            if (error)
              errors.push(`${relative('.', file)}: ${error} (${specifier})`);
          }
          ts.forEachChild(node, inspect);
        }
        inspect(source);
      }
    }
  }
  for (const [project, directory] of Object.entries(projects)) {
    const manifest = JSON.parse(
      await readFile(`${directory}/package.json`, 'utf8'),
    );
    for (const name of Object.keys({
      ...manifest.dependencies,
      ...manifest.devDependencies,
      ...manifest.peerDependencies,
      ...manifest.optionalDependencies,
    })) {
      const error = violation(project, name);
      if (error) errors.push(`${directory}/package.json: ${error}`);
    }
    await walk(`${directory}/src`, project);
  }
  return errors;
}
