import {
  DomainError,
  createReviewService,
  type RepositoryReader,
  type ReviewService,
} from '@gpeek/core';
import { isLocalRequest } from './request-policy.js';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import {
  bootstrapSchema,
  sessionSchema,
  compareInputSchema,
  fetchInputSchema,
  type ApiError,
} from '@gpeek/contracts';

interface Asset {
  body: Buffer;
  type: string;
}
export interface LocalServer {
  readonly url: string;
  readonly bootstrapUrl: string;
  readonly closed: Promise<void>;
  stop(): Promise<void>;
}
const contentTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};
async function loadAssets(directory: string): Promise<Map<string, Asset>> {
  const assets = new Map<string, Asset>();
  async function walk(folder: string): Promise<void> {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) {
        const extension = entry.name.slice(entry.name.lastIndexOf('.'));
        const type = contentTypes[extension];
        if (type)
          assets.set('/' + relative(directory, path).split(sep).join('/'), {
            body: await readFile(path),
            type,
          });
      }
    }
  }
  await walk(directory);
  if (!assets.has('/index.html'))
    throw new Error('Interface não compilada. Execute npm run build.');
  return assets;
}
function sendError(
  response: ServerResponse,
  status: number,
  code: ApiError['code'],
  message: string = code,
): void {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({ code, message } satisfies ApiError));
}
async function readBody(request: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk as Uint8Array);
    size += buffer.length;
    if (size <= 4096) chunks.push(buffer);
  }
  if (size > 4096) throw new Error('Body too large');
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}
export async function startLocalServer(options: {
  assetsDirectory: string;
  gitVersion: string;
  review?: ReviewService;
}): Promise<LocalServer> {
  const assets = await loadAssets(options.assetsDirectory);
  const session = sessionSchema.parse({
    application: 'gpeek',
    phase: 'bootstrap',
    gitVersion: options.gitVersion,
  });
  const bootstrapToken = randomBytes(32).toString('hex');
  const cookieToken = randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 5 * 60 * 1000;
  let bootstrapped = false;
  let authority = '';
  let cookieName = '';
  let origin = '';
  let stopping = false;
  let resolveClosed!: () => void;
  const closed = new Promise<void>((resolve) => {
    resolveClosed = resolve;
  });
  async function handle(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    );
    if (
      !isLocalRequest(
        {
          host: request.headers.host,
          origin: request.headers.origin,
          fetchSite: request.headers['sec-fetch-site'],
        },
        origin,
      )
    ) {
      sendError(response, 403, 'FORBIDDEN');
      return;
    }
    const path = request.url;
    const abort = new AbortController();
    response.once('close', () => {
      if (!response.writableFinished) abort.abort();
    });
    if (path === '/api/bootstrap' && request.method === 'POST') {
      if (
        request.headers.origin !== origin ||
        request.headers['content-type'] !== 'application/json'
      ) {
        sendError(response, 403, 'FORBIDDEN');
        return;
      }
      let input;
      try {
        input = bootstrapSchema.safeParse(await readBody(request));
      } catch {
        sendError(response, 400, 'INVALID_REQUEST');
        return;
      }
      if (!input.success) {
        sendError(response, 400, 'INVALID_REQUEST');
        return;
      }
      if (
        bootstrapped ||
        Date.now() > expiresAt ||
        !timingSafeEqual(
          Buffer.from(input.data.token),
          Buffer.from(bootstrapToken),
        )
      ) {
        sendError(response, 401, 'UNAUTHORIZED');
        return;
      }
      bootstrapped = true;
      response.setHeader(
        'Set-Cookie',
        `${cookieName}=${cookieToken}; HttpOnly; SameSite=Strict; Path=/`,
      );
      response.writeHead(204);
      response.end();
      return;
    }
    if (path?.startsWith('/api/')) {
      const cookies =
        request.headers.cookie?.split(';').map((part) => part.trim()) ?? [];
      if (!bootstrapped || !cookies.includes(`${cookieName}=${cookieToken}`)) {
        sendError(response, 401, 'UNAUTHORIZED');
        return;
      }
      if (path === '/api/session' && request.method === 'GET') {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(session));
        return;
      }
      if (
        path === '/api/shutdown' &&
        request.method === 'POST' &&
        request.headers.origin === origin
      ) {
        response.writeHead(204);
        response.once('finish', () => {
          void stop();
        });
        response.end();
        return;
      }
      if (options.review) {
        const review = options.review;
        const json = (value: unknown): void => {
          response.writeHead(200, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify(value));
        };
        if (path === '/api/repository' && request.method === 'GET') {
          json(await review.info(abort.signal));
          return;
        }
        const fileRoute =
          /^\/api\/comparisons\/([a-f0-9-]+)\/files\/([a-f0-9-]+)$/.exec(path);
        if (fileRoute && request.method === 'GET') {
          json(await review.file(fileRoute[1]!, fileRoute[2]!, abort.signal));
          return;
        }
        if (
          (path === '/api/comparisons' || path === '/api/fetch') &&
          request.method === 'POST'
        ) {
          if (
            request.headers.origin !== origin ||
            request.headers['content-type'] !== 'application/json'
          ) {
            sendError(response, 403, 'FORBIDDEN');
            return;
          }
          let body: unknown;
          try {
            body = await readBody(request);
          } catch {
            sendError(response, 400, 'INVALID_REQUEST');
            return;
          }
          if (path === '/api/comparisons') {
            const input = compareInputSchema.safeParse(body);
            if (!input.success) {
              sendError(response, 400, 'INVALID_REQUEST');
              return;
            }
            json(await review.compare(input.data, abort.signal));
          } else {
            const input = fetchInputSchema.safeParse(body);
            if (!input.success) {
              sendError(response, 400, 'INVALID_REQUEST');
              return;
            }
            json(await review.fetch(input.data.remote, abort.signal));
          }
          return;
        }
      }
      sendError(response, 404, 'NOT_FOUND');
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      sendError(response, 404, 'NOT_FOUND');
      return;
    }
    const asset = assets.get(path === '/' ? '/index.html' : (path ?? ''));
    if (!asset) {
      sendError(response, 404, 'NOT_FOUND');
      return;
    }
    response.writeHead(200, { 'Content-Type': asset.type });
    response.end(request.method === 'HEAD' ? undefined : asset.body);
  }
  const server = createServer((request, response) => {
    void handle(request, response).catch((error: unknown) => {
      if (error instanceof DomainError && !response.headersSent) {
        sendError(
          response,
          error.code === 'NOT_FOUND'
            ? 404
            : error.code === 'CONTENT_LIMIT'
              ? 413
              : 422,
          error.code,
          error.message,
        );
        return;
      }
      if (!response.headersSent) sendError(response, 500, 'INTERNAL_ERROR');
      else response.destroy();
    });
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  server.maxHeadersCount = 32;
  server.on('clientError', (_error, socket) => {
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Invalid listen address');
  authority = `127.0.0.1:${address.port}`;
  cookieName = `gpeek_session_${address.port}`;
  origin = `http://${authority}`;
  function stop(): Promise<void> {
    if (!stopping) {
      stopping = true;
      const deadline = setTimeout(() => {
        server.closeAllConnections();
      }, 1000);
      deadline.unref();
      server.close(() => {
        clearTimeout(deadline);
        resolveClosed();
      });
      server.closeIdleConnections();
    }
    return closed;
  }
  return {
    url: origin,
    bootstrapUrl: `${origin}/#token=${bootstrapToken}`,
    closed,
    stop,
  };
}

export function createReview(repository: RepositoryReader): ReviewService {
  return createReviewService(repository, randomUUID);
}
