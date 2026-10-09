import { useState } from 'react';
import type { Comparison } from '@gpeek/contracts';
export interface Annotation {
  ok: boolean;
  comments: string[];
}
export function annotationKey(
  comparison: Comparison,
  file: Comparison['files'][number],
): string {
  return (
    'gpeek:review:v1:' +
    JSON.stringify([
      comparison.baseCommit,
      comparison.headCommit,
      comparison.fromCommit,
      comparison.mode,
      comparison.ignoreWhitespace,
      file.oldPath,
      file.newPath,
      file.status,
    ])
  );
}
export function parseAnnotation(raw: string | null): Annotation {
  try {
    const value: unknown = JSON.parse(raw ?? 'null');
    if (
      value &&
      typeof value === 'object' &&
      'ok' in value &&
      typeof value.ok === 'boolean' &&
      'comments' in value &&
      Array.isArray(value.comments) &&
      value.comments.length <= 100 &&
      value.comments.every(
        (text: unknown) =>
          typeof text === 'string' && text.length > 0 && text.length <= 10000,
      )
    )
      return { ok: value.ok, comments: value.comments as string[] };
  } catch {
    /* Invalid browser data must not break the review. */
  }
  return { ok: false, comments: [] };
}
export function ReviewNotes({
  value,
  onChange,
}: {
  value: Annotation;
  onChange: (value: Annotation) => void;
}) {
  const [draft, setDraft] = useState('');
  return (
    <section className="review-notes" aria-label="Revisão pessoal do arquivo">
      <label className="checkbox">
        <input
          type="checkbox"
          checked={value.ok}
          onChange={(event) => onChange({ ...value, ok: event.target.checked })}
        />
        Arquivo OK
      </label>
      <details>
        <summary>Comentários pessoais ({value.comments.length})</summary>
        <ul className="personal-comments">
          {value.comments.map((text, index) => (
            <li key={index}>
              <p>{text}</p>
              <button
                className="quiet"
                aria-label={`Excluir comentário ${index + 1}`}
                onClick={() =>
                  onChange({
                    ...value,
                    comments: value.comments.filter((_, i) => i !== index),
                  })
                }
              >
                Excluir
              </button>
            </li>
          ))}
        </ul>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const text = draft.trim();
            if (!text || value.comments.length >= 100) return;
            onChange({ ...value, comments: [...value.comments, text] });
            setDraft('');
          }}
        >
          <label>
            Seu comentário
            <textarea
              maxLength={10000}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={3}
            />
          </label>
          <button disabled={!draft.trim() || value.comments.length >= 100}>
            Adicionar comentário
          </button>
        </form>
      </details>
    </section>
  );
}
