import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDemo } from './owasp-demo.mjs';
import { rules } from '../sast/semgrep.mjs';

const complete = () => ({ status: 'blocked', exitCode: 1, engines: { semgrep: { status: 'blocked' } },
  findings: rules.map(rule => ({ engine: 'Semgrep CE', rule: rule.id, file: 'src/__security_gate_proof__/fixture.mjs', owasp: rule.metadata.owasp })) });
test('detector demonstration succeeds only when every example rule is detected', () => {
  assert.equal(validateDemo(complete()).passed, true);
  const missing = complete(); missing.findings.pop();
  assert.equal(validateDemo(missing).passed, false);
});
test('scanner errors and findings in real application code cannot pass the demonstration', () => {
  const error = complete(); error.status = 'error'; error.exitCode = 2;
  assert.equal(validateDemo(error).passed, false);
  const wrongFile = complete(); wrongFile.findings.forEach(f => { f.file = 'src/App.tsx'; });
  assert.equal(validateDemo(wrongFile).passed, false);
  assert.equal(validateDemo({ status: 'passed', exitCode: 0, findings: [] }).passed, false);
});
