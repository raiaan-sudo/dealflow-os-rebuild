import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';

function commandExists(command) {
  const result = spawnSync('sh', ['-lc', `command -v ${command}`], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return result.status === 0 && result.stdout.trim().length > 0;
}

const semgrepCommand = commandExists('semgrep')
  ? { command: 'semgrep', args: ['scan', '--quiet', '--config', '.semgrep.yml', '--error'] }
  : fs.existsSync(`${os.homedir()}/Library/Python/3.9/bin/semgrep`)
    ? { command: `${os.homedir()}/Library/Python/3.9/bin/semgrep`, args: ['scan', '--quiet', '--config', '.semgrep.yml', '--error'] }
    : commandExists('npx')
      ? { command: 'npx', args: ['--yes', 'semgrep', 'scan', '--quiet', '--config', '.semgrep.yml', '--error'] }
      : null;

if (!semgrepCommand) {
  console.error(
    [
      'Semgrep CLI is not installed in this environment.',
      'npx is also unavailable, so the local fallback cannot run.',
      'Install Semgrep locally or rely on the GitHub security-audit workflow Semgrep job.',
      'Expected command once available: semgrep scan --config .semgrep.yml --error',
    ].join('\n')
  );
  process.exit(1);
}

const result = spawnSync(semgrepCommand.command, semgrepCommand.args, {
  stdio: 'inherit',
  env: {
    ...process.env,
    PATH: `${os.homedir()}/Library/Python/3.9/bin:${process.env.PATH ?? ''}`,
    PYTHONWARNINGS: [
      'ignore:urllib3 v2 only supports OpenSSL',
      process.env.PYTHONWARNINGS ?? '',
    ].filter(Boolean).join(','),
  },
});

process.exit(result.status ?? 1);
