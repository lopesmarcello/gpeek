import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startLocalServer, createReview } from '@gpeek/server';
import { checkGitVersion, openRepository } from '@gpeek/git';

async function openBrowser(url: string): Promise<void> {
  const command =
    process.platform === 'win32'
      ? 'rundll32'
      : process.platform === 'darwin'
        ? 'open'
        : 'xdg-open';
  const args =
    process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url];
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error('Browser launcher failed'));
    });
  });
}
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log(
      'Uso: gpeek [--repo /caminho] [--no-open]\nSem --repo, usa a pasta atual.\n--no-open inicia o serviço sem abrir uma sessão no navegador.',
    );
    return;
  }
  let repositoryPath = process.cwd();
  let explicitRepo = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--no-open') continue;
    if (args[i] === '--repo' && args[i + 1]) {
      repositoryPath = args[++i]!;
      explicitRepo = true;
      continue;
    }
    throw new Error('Argumento desconhecido ou caminho ausente. Use --help.');
  }
  let review;
  try {
    review = createReview(await openRepository(repositoryPath));
  } catch (error) {
    if (explicitRepo) throw error;
    console.log(
      'Nenhum repositório detectado. Use --repo /caminho para comparar branches.',
    );
  }
  const gitVersion = await checkGitVersion();
  const server = await startLocalServer({
    assetsDirectory: fileURLToPath(new URL('../../web/dist/', import.meta.url)),
    gitVersion,
    ...(review ? { review } : {}),
  });
  const shutdown = (): void => {
    void server.stop();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  console.log(`Serviço local: ${server.url}`);
  if (!args.includes('--no-open')) {
    try {
      await openBrowser(server.bootstrapUrl);
    } catch {
      await server.stop();
      throw new Error(
        'Não foi possível abrir o navegador. Verifique o launcher padrão do sistema.',
      );
    }
  }
  await server.closed;
  process.removeListener('SIGINT', shutdown);
  process.removeListener('SIGTERM', shutdown);
}
main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'Falha iniciando o serviço.',
  );
  process.exitCode = 1;
});
