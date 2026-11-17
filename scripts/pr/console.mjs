import { coverage } from '../sast/semgrep.mjs';

// Allowlisted metadata only; no raw process output, matched source or credentials.
const safe = value => String(value ?? '-').replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 400);
const levels = { critical: 'kritis', high: 'tinggi', moderate: 'sedang', low: 'rendah', info: 'informasi' };
const resultLabel = report => report.status === 'error' ? 'ERROR: pemeriksaan tidak selesai; bukan hasil lolos.'
  : report.status === 'blocked' ? 'DITOLAK: ditemukan masalah yang memblokir pipeline.'
    : report.status === 'passed' ? 'LOLOS batas pemeriksaan yang digunakan.' : 'Hasil belum tersedia.';
const categoryDescriptions = {
  A01: 'Hak akses: penggunaan API admin pada kode browser',
  A02: 'Pengaturan: CORS yang terlalu bebas dengan credentials',
  A03: 'Rantai pasok: penggunaan API Buffer yang sudah usang',
  A04: 'Kriptografi: penggunaan hash MD5/SHA1',
  A05: 'Injection: eval, input ke perintah shell, dan innerHTML dinamis',
  A06: 'Desain: mempercayai role dari input atau metadata pengguna',
  A07: 'Autentikasi: JWT tanpa verifikasi, bypass kedaluwarsa, TLS dinonaktifkan',
  A08: 'Integritas: pemilihan modul/deserialisasi dari input tidak terpercaya',
  A09: 'Pencatatan: password/token/header autentikasi masuk ke log',
  A10: 'Penanganan error: catch kosong atau akses diizinkan saat gagal',
};

export function auditConsole(report) {
  const counts = report.vulnerabilities || {};
  const findings = [...(report.findings || [])].sort((a, b) =>
    ['critical', 'high', 'moderate', 'low', 'info'].indexOf(a.severity) - ['critical', 'high', 'moderate', 'low', 'info'].indexOf(b.severity));
  const lines = ['[DEPENDENCY AUDIT - RINGKASAN]',
    'Diperiksa: package.json dan package-lock.json dari gabungan kode PR + development.',
    'Cakupan: paket frontend dan paket development, termasuk dependency tidak langsung.',
    'Metode: npm audit membaca daftar paket; tidak memasang paket atau menjalankan skrip PR.',
    `Entri paket di lockfile: ${report.lockfilePackages ?? 'belum tersedia'} (termasuk paket opsional/tidak langsung; bukan jumlah paket terpasang).`,
    'Batas gagal: ada temuan tinggi/kritis, atau alat/data pemeriksaan error.',
    `Hasil: ${resultLabel(report)}`,
    `Temuan: kritis=${counts.critical ?? '-'}, tinggi=${counts.high ?? '-'}, sedang=${counts.moderate ?? '-'}, rendah=${counts.low ?? '-'}, informasi=${counts.info ?? '-'}.`];
  if (report.status === 'passed' && findings.length) lines.push('Lolos tidak berarti nol masalah: temuan sedang/rendah berikut tetap perlu ditinjau.');
  if (report.code) lines.push(`Kode error: ${safe(report.code)}`);
  for (const finding of findings.slice(0, 20)) {
    lines.push(`- ${safe(finding.package)} | ${levels[finding.severity] || 'tidak diketahui'} | ${finding.direct ? 'paket langsung' : 'paket tidak langsung'} | saran perbaikan npm: ${finding.fixAvailable ? 'tersedia; perlu review' : 'belum tersedia'}`);
    if (finding.titles?.length) lines.push(`  Masalah: ${safe(finding.titles.join('; '))}`);
  }
  if (findings.length > 20) lines.push(`Ada ${findings.length - 20} paket lain; lihat laporan lengkap.`);
  lines.push('Laporan lengkap: Artifacts -> reports/audit/summary.html', 'Ringkasan teks: Artifacts -> reports/audit/ringkasan.txt');
  return lines.join('\n');
}

export function sastConsole(report) {
  const mapping = coverage(report.findings || []);
  const semgrepAvailable = ['passed', 'blocked'].includes(report.engines?.semgrep?.status);
  const lines = ['[SAST OWASP TOP 10 - RINGKASAN]',
    'Diperiksa: kode JavaScript/TypeScript dalam src, scripts, backend dan file konfigurasi JS/TS terpilih dari PR.',
    `Alat: ${safe(report.tool)}`,
    'Acuan: OWASP Top 10:2025. Aturan Semgrep ditambah aturan ESLint security.',
    'Pola yang dicari per kelompok OWASP (cakupan sebagian):'];
  for (const entry of mapping.categories) {
    const id = entry.category.slice(0, 3);
    lines.push(`- ${id} ${categoryDescriptions[id]} | ${entry.rules.length} aturan Semgrep | temuan Semgrep: ${semgrepAvailable ? entry.findings : 'belum dapat disimpulkan'}`);
  }
  lines.push(`File diperiksa: ${report.scannedFiles ?? 0}; total temuan SAST: ${report.findings?.length ?? 0}.`,
    `Hasil: ${resultLabel(report)}`, 'Batas gagal: ada temuan dari aturan SAST atau alat pemeriksa error.');
  if (report.code) lines.push(`Kode error: ${safe(report.code)}`);
  for (const finding of (report.findings || []).slice(0, 20)) {
    lines.push(`- ${safe(finding.file)}:${finding.line} | ${safe(finding.engine)} | aturan ${safe(finding.rule)}`);
    if (finding.owasp?.length) lines.push(`  Kelompok: ${safe(finding.owasp.join('; '))}; jenis kelemahan: ${safe((finding.cwe || []).join(', '))}`);
  }
  if ((report.findings?.length || 0) > 20) lines.push('Temuan lain ada pada laporan lengkap.');
  lines.push('Nol temuan berarti aturan terpilih tidak menemukan masalah; bukan jaminan seluruh risiko OWASP aman.',
    'Laporan lengkap: Artifacts -> reports/sast/summary.html', 'Ringkasan teks: Artifacts -> reports/sast/ringkasan.txt');
  return lines.join('\n');
}
