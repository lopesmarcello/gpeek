import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const execute = promisify(execFile);
export async function createRepositoryFixture() {
  const root = await mkdtemp(join(tmpdir(), 'gpeek-fixture-'));
  const repo = join(root, 'repo');
  const remote = join(root, 'remote.git');
  const globalConfig = join(root, 'empty-gitconfig');
  await mkdir(repo);
  await writeFile(globalConfig, '');
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(env))
    if (key.startsWith('GIT_')) delete env[key];
  Object.assign(env, {
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: globalConfig,
    GIT_TERMINAL_PROMPT: '0',
    GIT_AUTHOR_NAME: 'Harness',
    GIT_AUTHOR_EMAIL: 'harness@example.invalid',
    GIT_COMMITTER_NAME: 'Harness',
    GIT_COMMITTER_EMAIL: 'harness@example.invalid',
    GIT_AUTHOR_DATE: '2020-01-01T00:00:00Z',
    GIT_COMMITTER_DATE: '2020-01-01T00:00:00Z',
  });
  async function git(args: string[], cwd = repo, input?: Buffer) {
    const execution = execute(
      'git',
      [
        '-c',
        'core.autocrlf=false',
        '-c',
        'core.hooksPath=' + join(root, 'no-hooks'),
        ...args,
      ],
      { cwd, env, timeout: 5000, maxBuffer: 1024 * 1024, windowsHide: true },
    );
    execution.child.stdin?.end(input);
    return (await execution).stdout.trim();
  }
  const dispose = () => rm(root, { recursive: true, force: true });
  try {
    await git(['init', '--initial-branch=main']);
    await writeFile(join(repo, 'hello.txt'), 'base\n');
    await git(['add', '--', 'hello.txt']);
    await git(['commit', '-m', 'base']);
    await git(['init', '--bare', '--initial-branch=main', remote]);
    await git(['remote', 'add', 'origin', remote]);
    await git(['push', '-u', 'origin', 'main']);
    await git(['switch', '-c', 'feature']);
    await writeFile(join(repo, 'hello.txt'), 'feature\n');
    await git(['commit', '-am', 'feature']);
    return { root, repo, remote, git, dispose };
  } catch (error) {
    await dispose();
    throw error;
  }
}
