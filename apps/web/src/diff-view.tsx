import { Fragment, useMemo, useState } from 'react';
import type { FileDiff } from '@gpeek/contracts';
import { highlightHunk } from './syntax.js';
import {
  CommentForm,
  anchorLabel,
  type Annotation,
  type LineAnchor,
} from './review-notes.js';
export function DiffView({
  diff,
  view,
  oldPath,
  newPath,
  annotation,
  onChange,
}: {
  annotation: Annotation;
  onChange: (value: Annotation) => void;
  oldPath: string;
  newPath: string;
  diff: FileDiff;
  view: 'unified' | 'split';
}) {
  const [selected, setSelected] = useState<LineAnchor>();
  function choose(anchor: LineAnchor | undefined) {
    if (anchor && window.getSelection()?.isCollapsed !== false)
      setSelected(anchor);
  }
  function number(side: LineAnchor['side'], line: number | null | undefined) {
    if (typeof line !== 'number') return null;
    const anchor = { side, line };
    const count = annotation.comments.filter(
      (comment) =>
        typeof comment !== 'string' &&
        comment.side === side &&
        comment.line === line,
    ).length;
    return (
      <button
        type="button"
        className="line-comment-trigger"
        aria-label={`Comentar ${anchorLabel(anchor).toLowerCase()}`}
        aria-pressed={selected?.side === side && selected.line === line}
        title={`Comentar ${anchorLabel(anchor).toLowerCase()}${count ? ` (${count} comentários)` : ''}`}
        onClick={() => setSelected(anchor)}
      >
        {line}
        {count > 0 && (
          <span className="comment-dot" aria-hidden="true">
            •
          </span>
        )}
      </button>
    );
  }
  function threads(
    oldLine: number | null | undefined,
    newLine: number | null | undefined,
  ) {
    const anchors: LineAnchor[] = [
      ...(typeof oldLine !== 'number'
        ? []
        : [{ side: 'old' as const, line: oldLine }]),
      ...(typeof newLine !== 'number'
        ? []
        : [{ side: 'new' as const, line: newLine }]),
    ];
    const visible = anchors.filter(
      (anchor) =>
        (selected?.side === anchor.side && selected.line === anchor.line) ||
        annotation.comments.some(
          (comment) =>
            typeof comment !== 'string' &&
            comment.side === anchor.side &&
            comment.line === anchor.line,
        ),
    );
    if (!visible.length) return null;
    return (
      <tr className="inline-comment-row">
        <td colSpan={4}>
          <div className="inline-threads">
            {visible.map((anchor) => {
              const active =
                selected?.side === anchor.side && selected.line === anchor.line;
              return (
                <section
                  key={`${anchor.side}:${anchor.line}`}
                  className={`inline-thread ${anchor.side}`}
                  aria-label={`Comentários da ${anchorLabel(anchor).toLowerCase()}`}
                >
                  <h3>{anchorLabel(anchor)}</h3>
                  <ul className="personal-comments">
                    {annotation.comments.map((comment, index) =>
                      typeof comment !== 'string' &&
                      comment.side === anchor.side &&
                      comment.line === anchor.line ? (
                        <li key={index}>
                          <p>{comment.text}</p>
                          <button
                            type="button"
                            className="quiet"
                            aria-label={`Excluir comentário da linha ${index + 1}`}
                            onClick={() =>
                              onChange({
                                ...annotation,
                                comments: annotation.comments.filter(
                                  (_, i) => i !== index,
                                ),
                              })
                            }
                          >
                            Excluir
                          </button>
                        </li>
                      ) : null,
                    )}
                  </ul>
                  {active ? (
                    <CommentForm
                      key={`${anchor.side}:${anchor.line}`}
                      disabled={annotation.comments.length >= 100}
                      onCancel={() => setSelected(undefined)}
                      onAdd={(text) => {
                        onChange({
                          ...annotation,
                          comments: [
                            ...annotation.comments,
                            { ...anchor, text },
                          ],
                        });
                        setSelected(undefined);
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="quiet"
                      onClick={() => setSelected(anchor)}
                    >
                      Adicionar comentário nesta linha
                    </button>
                  )}
                </section>
              );
            })}
          </div>
        </td>
      </tr>
    );
  }
  const highlighted = useMemo(
    () => diff.hunks.map((hunk) => highlightHunk(hunk.lines, oldPath, newPath)),
    [diff, oldPath, newPath],
  );
  return (
    <div
      className={`diff-scroll ${view}`}
      tabIndex={0}
      aria-label="Conteúdo do diff"
    >
      {diff.hunks.map((hunk, index) => (
        <div key={index}>
          <div className="hunk-header">{hunk.header}</div>
          {view === 'unified' ? (
            <table className="diff-table">
              <colgroup>
                <col className="number-column" />
                <col className="number-column" />
                <col className="sign-column" />
                <col />
              </colgroup>
              <thead className="sr-only">
                <tr>
                  <th>Linha anterior</th>
                  <th>Linha nova</th>
                  <th>Alteração</th>
                  <th>Conteúdo</th>
                </tr>
              </thead>
              <tbody>
                {hunk.lines.map((line, i) => (
                  <Fragment key={i}>
                    <tr className={line.kind}>
                      <td className="line-number">
                        {number('old', line.oldLine)}
                      </td>
                      <td className="line-number">
                        {number('new', line.newLine)}
                      </td>
                      <td className="sign">
                        {line.kind === 'addition'
                          ? '+'
                          : line.kind === 'deletion'
                            ? '−'
                            : ''}
                      </td>
                      <td
                        className={`code ${line.kind === 'note' ? '' : 'commentable'}`}
                        onClick={() =>
                          choose(
                            typeof line.newLine === 'number'
                              ? { side: 'new', line: line.newLine }
                              : typeof line.oldLine === 'number'
                                ? { side: 'old', line: line.oldLine }
                                : undefined,
                          )
                        }
                      >
                        <pre>
                          {highlighted[index]?.get(line) ?? (line.text || ' ')}
                        </pre>
                      </td>
                    </tr>
                    {threads(line.oldLine, line.newLine)}
                  </Fragment>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="diff-table split-table">
              <colgroup>
                <col className="number-column" />
                <col className="code-column" />
                <col className="number-column" />
                <col className="code-column" />
              </colgroup>
              <thead>
                <tr>
                  <th colSpan={2}>Antes</th>
                  <th colSpan={2}>Depois</th>
                </tr>
              </thead>
              <tbody>
                {splitLines(hunk.lines).map((row, i) => (
                  <Fragment key={i}>
                    <tr>
                      <td className={`line-number ${row.old?.kind ?? 'blank'}`}>
                        {number('old', row.old?.oldLine)}
                      </td>
                      <td
                        className={`code ${row.old?.kind ?? 'blank'} ${typeof row.old?.oldLine !== 'number' ? '' : 'commentable'}`}
                        onClick={() =>
                          choose(
                            typeof row.old?.oldLine !== 'number'
                              ? undefined
                              : { side: 'old', line: row.old.oldLine },
                          )
                        }
                      >
                        <pre>
                          {row.old
                            ? (highlighted[index]?.get(row.old) ??
                              (row.old.text || ' '))
                            : ' '}
                        </pre>
                      </td>
                      <td
                        className={`line-number ${row.next?.kind ?? 'blank'}`}
                      >
                        {number('new', row.next?.newLine)}
                      </td>
                      <td
                        className={`code ${row.next?.kind ?? 'blank'} ${typeof row.next?.newLine !== 'number' ? '' : 'commentable'}`}
                        onClick={() =>
                          choose(
                            typeof row.next?.newLine !== 'number'
                              ? undefined
                              : { side: 'new', line: row.next.newLine },
                          )
                        }
                      >
                        <pre>
                          {row.next
                            ? (highlighted[index]?.get(row.next) ??
                              (row.next.text || ' '))
                            : ' '}
                        </pre>
                      </td>
                    </tr>
                    {threads(row.old?.oldLine, row.next?.newLine)}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </div>
  );
}
type Line = FileDiff['hunks'][number]['lines'][number];
function splitLines(lines: Line[]) {
  const rows: { old?: Line; next?: Line }[] = [];
  for (let i = 0; i < lines.length; ) {
    const line = lines[i]!;
    if (line.kind === 'context' || line.kind === 'note') {
      rows.push({ old: line, next: line });
      i++;
      continue;
    }
    const old: Line[] = [];
    const next: Line[] = [];
    while (lines[i]?.kind === 'deletion') old.push(lines[i++]!);
    while (lines[i]?.kind === 'addition') next.push(lines[i++]!);
    for (let j = 0; j < Math.max(old.length, next.length); j++)
      rows.push({
        ...(old[j] ? { old: old[j] } : {}),
        ...(next[j] ? { next: next[j] } : {}),
      });
  }
  return rows;
}
