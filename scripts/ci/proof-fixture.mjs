import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const directory = path.join(root, 'src', '__security_gate_proof__');
const mode = process.argv[2];
if (mode === 'clean') {
  // This generated fixture directory is the only cleanup target.
  rmSync(directory, { recursive: true, force: true });
} else if (['secret', 'sast', 'owasp'].includes(mode)) {
  mkdirSync(directory, { recursive: true });
  const source = mode === 'owasp' ? readFileSync(path.join(root, 'security', 'semgrep', 'fixtures', 'vulnerable.txt'), 'utf8') : mode === 'secret'
    ? `export const synthetic = '${['sb', 'secret', 'JenkinsProofOnlyNotARealCredential123456789'].join('_')}';\n`
    : `${['ev', 'al'].join('')}('1 + 1');\n`;
  writeFileSync(path.join(directory, 'fixture.mjs'), source);
  console.log(`Created synthetic ${mode} fixture; never a real credential; do not commit generated files.`);
} else {
  throw new Error('Expected secret, sast, owasp, or clean.');
}
