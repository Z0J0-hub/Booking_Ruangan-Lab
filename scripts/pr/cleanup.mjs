import { existsSync, readFileSync, lstatSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const runtime = fileURLToPath(new URL('../../.runtime/pr/', import.meta.url)).replace(/[\\/]$/, '');
export function cleanupPr() {
  const context = path.join(runtime, 'active.local.json');
  if (!existsSync(context)) return;
  const state = JSON.parse(readFileSync(context, 'utf8'));
  if (path.dirname(state.work) !== runtime || !/^work-[a-zA-Z0-9]+$/.test(path.basename(state.work)) || (existsSync(state.work) && lstatSync(state.work).isSymbolicLink())) throw new Error('INVALID_PR_CLEANUP_PATH');
  rmSync(state.work, { recursive: true, force: true }); rmSync(context, { force: true });
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) cleanupPr();
