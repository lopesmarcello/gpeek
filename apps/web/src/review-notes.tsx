import { useState } from 'react';
import { annotationSchema } from '@gpeek/contracts';
export interface LineAnchor {
  side: 'old' | 'new';
  line: number;
}
export type PersonalComment = string | (LineAnchor & { text: string });
export function commentText(comment: PersonalComment): string {
  return typeof comment === 'string' ? comment : comment.text;
}
export function anchorLabel(anchor: LineAnchor): string {
  return `Linha ${anchor.line} · ${anchor.side === 'old' ? 'Antes' : 'Depois'}`;
}
export interface Annotation {
  ok: boolean;
  comments: PersonalComment[];
}
export function parseAnnotation(raw: string | null): Annotation {
  try {
    const result = annotationSchema.safeParse(JSON.parse(raw ?? 'null'));
    if (result.success) return result.data;
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
      <p className="line-comment-hint">
        Clique no código ou no número de uma linha para comentar aquele trecho.
      </p>
      <details>
        <summary>Comentários pessoais ({value.comments.length})</summary>
        <ul className="personal-comments">
          {value.comments.map((comment, index) => (
            <li key={index}>
              {typeof comment !== 'string' && (
                <p className="comment-reference">{anchorLabel(comment)}</p>
              )}
              <p>{commentText(comment)}</p>
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
        <CommentForm
          disabled={value.comments.length >= 100}
          onAdd={(text) =>
            onChange({ ...value, comments: [...value.comments, text] })
          }
        />
      </details>
    </section>
  );
}

export function CommentForm({
  disabled,
  onAdd,
  onCancel,
}: {
  disabled: boolean;
  onAdd: (text: string) => void;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState('');
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const text = draft.trim();
        if (!text || disabled) return;
        onAdd(text);
        setDraft('');
      }}
    >
      <label>
        Seu comentário
        <textarea
          autoFocus={Boolean(onCancel)}
          maxLength={10000}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={3}
        />
      </label>
      {disabled && (
        <p role="status">Limite de 100 comentários por arquivo atingido.</p>
      )}
      <div className="comment-actions">
        <button disabled={!draft.trim() || disabled}>
          Adicionar comentário
        </button>
        {onCancel && (
          <button type="button" className="quiet" onClick={onCancel}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
