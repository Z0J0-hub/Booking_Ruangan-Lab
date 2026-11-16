import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse, stringify } from 'yaml';
import { composeFindings, trivyFindings } from './scan.mjs';

test('Compose gate rejects privilege, public exposure, host mounts, and missing isolation', () => {
  const source = readFileSync(new URL('../../docker-compose.yml', import.meta.url), 'utf8');
  const document = parse(source);
  assert.equal(composeFindings(source, 'compose').findings.length, 0);
  document.services.frontend.privileged = true;
  document.services.frontend.ports = ['0.0.0.0:8081:8080'];
  document.services.frontend.volumes = ['/var/run/docker.sock:/var/run/docker.sock'];
  document.networks.frontend.internal = false;
  const result = composeFindings(stringify(document), 'compose');
  assert.deepEqual(result.findings.map((item) => item.rule).sort(), ['ISOLATED_NETWORK', 'LOOPBACK_ONLY', 'NO_HOST_MOUNTS', 'NO_HOST_PRIVILEGES']);
});

test('Trivy results reject empty scans and preserve high severity for gating', () => {
  assert.throws(() => trivyFindings({ Results: [] }, 'config'));
  assert.throws(() => trivyFindings({ Results: [{ Target: 'Dockerfile' }] }, 'config'));
  const result = trivyFindings({ Results: [{ Target: 'Dockerfile', MisconfSummary: { Successes: 1, Failures: 1 }, Misconfigurations: [{ ID: 'root-user', Severity: 'HIGH', Status: 'FAIL' }] }] }, 'config');
  assert.equal(result.checks, 2); assert.equal(result.findings[0].severity, 'HIGH');
  assert.throws(() => trivyFindings({ Results: [{}] }, 'image'));
});
