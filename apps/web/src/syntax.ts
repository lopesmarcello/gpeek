import hljs from 'highlight.js/lib/core';
import { createElement, type ReactNode } from 'react';
import type { FileDiff } from '@gpeek/contracts';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import json from 'highlight.js/lib/languages/json';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import scss from 'highlight.js/lib/languages/scss';
import bash from 'highlight.js/lib/languages/bash';
import sql from 'highlight.js/lib/languages/sql';
import yaml from 'highlight.js/lib/languages/yaml';
import markdown from 'highlight.js/lib/languages/markdown';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import cpp from 'highlight.js/lib/languages/cpp';
import c from 'highlight.js/lib/languages/c';
import csharp from 'highlight.js/lib/languages/csharp';
import kotlin from 'highlight.js/lib/languages/kotlin';
import ruby from 'highlight.js/lib/languages/ruby';
import php from 'highlight.js/lib/languages/php';
import swift from 'highlight.js/lib/languages/swift';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import ini from 'highlight.js/lib/languages/ini';
import diff from 'highlight.js/lib/languages/diff';

hljs.registerLanguage('java', java);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('json', json);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('css', css);
hljs.registerLanguage('scss', scss);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('go', go);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('c', c);
hljs.registerLanguage('csharp', csharp);
hljs.registerLanguage('kotlin', kotlin);
hljs.registerLanguage('ruby', ruby);
hljs.registerLanguage('php', php);
hljs.registerLanguage('swift', swift);
hljs.registerLanguage('dockerfile', dockerfile);
hljs.registerLanguage('ini', ini);
hljs.registerLanguage('diff', diff);

const extensions: Record<string, string> = {
  java: 'java',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  json: 'json',
  xml: 'xml',
  html: 'xml',
  svg: 'xml',
  css: 'css',
  scss: 'scss',
  sh: 'bash',
  bash: 'bash',
  sql: 'sql',
  yml: 'yaml',
  yaml: 'yaml',
  md: 'markdown',
  go: 'go',
  rs: 'rust',
  cpp: 'cpp',
  cc: 'cpp',
  hpp: 'cpp',
  c: 'c',
  h: 'c',
  cs: 'csharp',
  kt: 'kotlin',
  kts: 'kotlin',
  rb: 'ruby',
  php: 'php',
  swift: 'swift',
  ini: 'ini',
  toml: 'ini',
  diff: 'diff',
  patch: 'diff',
};
export function languageForPath(path: string): string | undefined {
  const name = path.split('/').pop()!.toLowerCase();
  if (name === 'dockerfile' || name.startsWith('dockerfile.'))
    return 'dockerfile';
  if (name === '.gitignore' || name === '.gitattributes') return undefined;
  return extensions[name.split('.').pop()!];
}
type Line = FileDiff['hunks'][number]['lines'][number];
// Highlight each side separately so removed code cannot affect added-code tokens.
// Hunks lack preceding file context; unknown languages and large hunks stay plain.
export function highlightHunk(lines: Line[], oldPath: string, newPath: string) {
  const result = new Map<Line, ReactNode>();
  for (const side of ['old', 'new'] as const) {
    const language = languageForPath(side === 'old' ? oldPath : newPath);
    const selected = lines.filter(
      (line) =>
        line.kind === 'context' ||
        line.kind === (side === 'old' ? 'deletion' : 'addition'),
    );
    const source = selected.map((line) => line.text).join('\n');
    if (!language || source.length > 100_000) continue;
    try {
      const markup = hljs.highlight(source, {
        language,
        ignoreIllegals: true,
      }).value;
      const parsed = new DOMParser().parseFromString(
        `<pre>${markup}</pre>`,
        'text/html',
      );
      const rows: ReactNode[][] = [[]];
      let key = 0;
      function visit(node: Node, classes: string[]) {
        if (node.nodeType === 3) {
          const parts = (node.textContent ?? '').split('\n');
          parts.forEach((part, index) => {
            if (index) rows.push([]);
            if (part)
              rows[rows.length - 1]!.push(
                classes.length
                  ? createElement(
                      'span',
                      { className: classes.join(' '), key: key++ },
                      part,
                    )
                  : part,
              );
          });
        } else if (node instanceof Element && node.tagName === 'SPAN') {
          const safeClasses = Array.from(node.classList).filter((name) =>
            /^hljs-[a-z0-9_-]+$/.test(name),
          );
          node.childNodes.forEach((child) =>
            visit(child, [...classes, ...safeClasses]),
          );
        }
      }
      parsed.body.firstChild!.childNodes.forEach((node) => visit(node, []));
      selected.forEach((line, index) => result.set(line, rows[index]));
    } catch {
      // A highlighting failure must never hide source text.
    }
  }
  return result;
}
