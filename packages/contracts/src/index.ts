import { z } from 'zod';
export const sessionSchema = z
  .object({
    application: z.literal('gpeek'),
    phase: z.literal('bootstrap'),
    gitVersion: z.string().min(1),
  })
  .strict();
export type Session = z.infer<typeof sessionSchema>;
export const bootstrapSchema = z
  .object({ token: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict();
export const errorSchema = z
  .object({
    code: z.enum([
      'FORBIDDEN',
      'UNAUTHORIZED',
      'INVALID_REQUEST',
      'NOT_FOUND',
      'INTERNAL_ERROR',
      'NOT_REPOSITORY',
      'REF_NOT_FOUND',
      'NO_MERGE_BASE',
      'AMBIGUOUS_BASE',
      'INCOMPLETE_HISTORY',
      'GIT_ERROR',
      'TIMEOUT',
      'CONTENT_LIMIT',
      'CANCELLED',
    ]),
    message: z.string(),
  })
  .strict();
export type ApiError = z.infer<typeof errorSchema>;

export const compareInputSchema = z
  .object({
    baseRef: z.string().min(1).max(512),
    headRef: z.string().min(1).max(512),
    mode: z.enum(['merge-base', 'direct']),
    ignoreWhitespace: z.boolean(),
  })
  .strict();
const refSchema = z
  .object({
    name: z.string(),
    commitId: z.string(),
    kind: z.enum(['local', 'remote']),
  })
  .strict();
export const repositorySchema = z
  .object({
    name: z.string(),
    refs: z.array(refSchema),
    currentRef: z.string().nullable(),
    suggestedBase: z.string().nullable(),
    remotes: z.array(z.string()),
    shallow: z.boolean(),
    lastFetch: z.string().nullable(),
  })
  .strict();
export type RepositoryInfo = z.infer<typeof repositorySchema>;
const fileSchema = z
  .object({
    id: z.string(),
    oldPath: z.string(),
    newPath: z.string(),
    status: z.string(),
    oldMode: z.string(),
    newMode: z.string(),
    additions: z.number().nullable(),
    deletions: z.number().nullable(),
    kind: z.enum(['text', 'binary', 'submodule']),
    pathEncoding: z.enum(['utf8', 'lossy']),
  })
  .strict();
export const comparisonSchema = compareInputSchema
  .extend({
    id: z.string(),
    baseCommit: z.string(),
    headCommit: z.string(),
    fromCommit: z.string(),
    files: z.array(fileSchema),
  })
  .strict();
export type Comparison = z.infer<typeof comparisonSchema>;
export const fileDiffSchema = z
  .object({
    fileId: z.string(),
    notice: z.string().nullable(),
    hunks: z.array(
      z
        .object({
          header: z.string(),
          lines: z.array(
            z
              .object({
                kind: z.enum(['context', 'addition', 'deletion', 'note']),
                text: z.string(),
                oldLine: z.number().nullable(),
                newLine: z.number().nullable(),
              })
              .strict(),
          ),
        })
        .strict(),
    ),
  })
  .strict();
export type FileDiff = z.infer<typeof fileDiffSchema>;
export const fetchInputSchema = z
  .object({ remote: z.string().min(1).max(512) })
  .strict();

export const conflictAnalysisSchema = z
  .object({
    clean: z.boolean(),
    files: z.array(
      z
        .object({
          path: z.string(),
          pathEncoding: z.enum(['utf8', 'lossy']),
          content: z.string().nullable(),
          notice: z.string().nullable(),
        })
        .strict(),
    ),
    messages: z.array(
      z
        .object({
          paths: z.array(z.string()),
          type: z.string(),
          message: z.string(),
        })
        .strict(),
    ),
  })
  .strict();
export type ConflictAnalysis = z.infer<typeof conflictAnalysisSchema>;

export const fileContextSchema = z.enum(['changes', 'full']);

export const annotationSchema = z
  .object({
    ok: z.boolean(),
    comments: z
      .array(
        z.union([
          z.string().min(1).max(10000),
          z
            .object({
              side: z.enum(['old', 'new']),
              line: z.number().int().positive().safe(),
              text: z.string().min(1).max(10000),
            })
            .strict(),
        ]),
      )
      .max(100),
  })
  .strict();
export const annotationsSchema = z.record(annotationSchema);
