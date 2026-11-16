import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runSast } from './sast.mjs';
import { coverage, rules } from '../sast/semgrep.mjs';

export function validateDemo(report) {
const mapping = coverage(report.findings);
const matches = report.findings.filter(f => f.file === 'src/__security_gate_proof__/fixture.mjs' && f.engine === 'Semgrep CE');
const detected = new Set(matches.flatMap(f => f.owasp || []));
const passed = report.status === 'blocked' && report.exitCode === 1 && report.engines?.semgrep?.status === 'blocked' &&
  mapping.categories.length === 10 && detected.size === 10 && rules.every(rule => matches.some(f => f.rule === rule.id));
return { passed, mapping, detected };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
// Only inspect the synthetic file; never execute it or build/deploy an app.
const report = await runSast({ files: ['src/__security_gate_proof__/fixture.mjs'] });
const { passed, mapping, detected } = validateDemo(report);
const explanation = passed
  ? 'Percobaan BERHASIL: alat mendeteksi dan menolak contoh masalah pada 10 dari 10 kelompok OWASP. Ini bukan hasil pemeriksaan aplikasi.'
  : 'Percobaan GAGAL: alat error atau belum mendeteksi semua contoh. Ini bukan bukti aplikasi bermasalah. Periksa summary.json dan semgrep.json.';
writeFileSync('reports/sast/hasil-percobaan.json', JSON.stringify({ passed, kind: 'contoh-bukan-aplikasi', explanation, detectedCategories: detected.size, expectedCategories: 10, sourceVersion: process.env.GIT_COMMIT || null }, null, 2) + '\n');
writeFileSync('reports/sast/summary.html', '<!doctype html><meta charset="utf-8"><title>Percobaan alat pendeteksi OWASP</title>' +
  `<h1>${passed ? 'Percobaan BERHASIL' : 'Percobaan GAGAL'}</h1><p>${explanation}</p>` +
  '<p>Yang diperiksa: file contoh sementara src/__security_gate_proof__/fixture.mjs. File ini tidak dijalankan sebagai aplikasi dan dibersihkan sesudah tes.</p>' +
  '<p>Status blocked pada laporan teknis berarti contoh berhasil ditolak. Status error berarti alat tidak berhasil memeriksa.</p>' +
  '<table border="1"><tr><th>Kelompok masalah OWASP 2025</th><th>Contoh terdeteksi?</th></tr>' +
  mapping.categories.map(c => `<tr><td>${c.category}</td><td>${detected.has(c.category) ? 'Ya' : 'Belum'}</td></tr>`).join('') + '</table>' +
  '<p>Percobaan ini membuktikan pendeteksian pola contoh. Cakupan setiap kelompok masih sebagian; ini tidak membuktikan aplikasi bebas masalah.</p>');
console.log(explanation);
process.exitCode = passed ? 0 : 2;
}
