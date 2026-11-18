import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const entry = fileURLToPath(import.meta.url);
const alreadyWatching = process.execArgv.includes('--watch') || process.argv.includes('--no-watch');

if (!alreadyWatching) {
  const child = spawn(
    process.execPath,
    ['--watch', '--watch-path=./src', entry, '--no-watch'],
    { stdio: 'inherit', cwd: process.cwd() },
  );
  child.on('exit', (code) => process.exit(code ?? 0));
} else {
  const { startServer } = await import('./src/server.js');
  startServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
