import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const [command, ...args] = process.argv.slice(2);
if (!['start', 'export', 'run:ios', 'run:android', 'prebuild', 'install', 'config'].includes(command) ||
	args.some(arg => arg === '--tunnel')) {
	console.error('This launcher only allows local Expo commands. Tunnel uploads are disabled.');
	process.exit(1);
}
const child = spawn(process.execPath, [path.join(root, 'node_modules/expo/bin/cli'), command, ...args], {
	cwd: root,
	stdio: 'inherit',
	env: { ...process.env, EXPO_NO_TELEMETRY: '1', EXPO_NO_GIT_STATUS: '1', EXPO_OFFLINE: command === 'install' ? '0' : '1',
		PATH: path.join(root, 'scripts/no-git-bin') + path.delimiter + process.env.PATH },
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
