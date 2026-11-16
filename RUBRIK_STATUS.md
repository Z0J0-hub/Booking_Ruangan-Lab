# Status rubrik DevSecOps — 15 November 2026

Pembaruan SAST/PR 16 November: [PR_OWASP_2025.md](PR_OWASP_2025.md). Semgrep CE
dengan 15 aturan representatif memetakan sepuluh kategori OWASP Top 10:2025.
Cakupan tiap kategori tetap parsial. Job utama disiapkan untuk polling PR ilyas
ke development dengan source-only scanning; hasil aktif mengikuti artifact PR
terbaru. Required checks/status GitHub tetap belum dikonfigurasi. Tabel di bawah
menyimpan inventaris baseline sebelum pembaruan ini.

Sumber: Rubrik_Penilaian_DevSecOps_YDP_2026.xlsx dari dosen. Ini inventaris bukti,
bukan pemberian skor sendiri. Jumlah bobot baris 125%; heading dokumentasi 25%
sedangkan tiga barisnya berjumlah 15%. Normalisasi perlu dikonfirmasi ke dosen.

| Kriteria | Bukti tersedia | Gap |
|---|---|---|
| Application design | ARCHITECTURE.md, diagram aplikasi/Supabase/CI | Review final dan bukti pengumpulan sesuai timeline |
| Threat modeling | STRIDE_MATRIX.md, batas kepercayaan dan mitigasi | Diagram Threat Dragon/format dosen dan verifikasi kontrol cloud utama |
| SAST | ESLint security, hasil Jenkins, proof negatif | Cakupan OWASP Top 10 terbatas; PR otomatis belum terbukti |
| SCA | npm audit, gate High/Critical, artifact | 9 moderate/2 low masih tercatat; PR otomatis belum terbukti |
| Secrets management/detection | Gitleaks, proof negatif, config publik terpisah | Riwayat Git/artifact dan penyimpanan seluruh credential belum diaudit |
| Image scanning | Exact-image scanner dan Jenkinsfile.container siap | Docker tidak tersedia; image aplikasi belum dibangun/discan |
| IaC security/hardening | Trivy Dockerfile + policy Compose, before/after | Bukan audit CIS lengkap; belum validasi container runtime |
| Network/cloud security | Loopback, konfigurasi internal network dan privilege, RLS sumber | Firewall/TLS/cloud live dan agent Jenkins terisolasi belum diverifikasi |
| Quality gates/fail-fast | Bukti Jenkins secret dan SAST memblokir tahap berikut | Required checks GitHub memerlukan admin; bukti PR gagal/sukses belum ada |
| DAST | ZAP pasif frontend berjalan di Jenkins | Belum authenticated/active/API/RLS runtime |
| Pipeline efficiency | Durasi build dan DAST tercatat | Belum benchmark berulang atau evaluasi bottleneck terukur |
| Central logging/SIEM | Collector lokal frontend/monitor/deployment; log terstruktur dan retensi | Belum SIEM eksternal atau ekspor audit Supabase |
| Monitoring/alerting | Probe health, threshold, alert warning/high/critical lokal; metrics | Belum pengiriman notifikasi ke operator, Prometheus/Grafana live |
| Incident response/rollback | SOP, manifest, smoke test HTTP, automatic rollback dan drill | Belum deployment/rollback produksi atau recovery database |
| Dokumen perancangan | ARCHITECTURE.md, threat model, operasi dan CI | Pengumpulan maksimal minggu 6 belum dapat dibuktikan |
| Demo aplikasi | CLI demo, drill, Console/Artifacts Jenkins | Presentasi maksimal minggu 11 belum dapat dibuktikan |
| Paper publikasi | PAPER_DRAFT.md berisi metode, hasil, dan keterbatasan | Template, identitas, kajian ilmiah, review tim, dan pengumpulan minggu 14 belum selesai |

## Ringkasan nomor 3–5

**Nomor 3:** konfigurasi container diperkeras; scan lokal setelah perubahan 62
kontrol, 0 temuan. Baseline committed HEAD memiliki 25 temuan pada 57 kontrol
Dockerfile/Compose. Lima kontrol tambahan setelah perubahan memeriksa pengecualian
build context. Image scan belum dijalankan karena Docker belum tersedia.

**Nomor 4:** drill lokal memverifikasi 8 kondisi, termasuk rollback kandidat dengan
asset rusak, alert gangguan, dan penolakan injeksi log. Unit test tambahan menolak
rollback ke release yang diubah. Collector/alert lokal belum menggantikan SIEM dan
notifikasi operasional eksternal.

**Nomor 5:** dokumen arsitektur, SOP, panduan demo, dan pemetaan rubrik ditambahkan.
PAPER_DRAFT.md disiapkan sebagai bahan awal; paper final/presentasi/pengumpulan LMS
tidak ditandai selesai tanpa bukti dari tim.

Validasi gabungan: [reservasi-local-ops #2](http://localhost:8080/job/arsip-reservasi/job/reservasi-local-ops/2/),
SUCCESS, 86.540 detik, snapshot
`290de7bc3dbc5b75f096b28a23083e636669be49063101c0f692ff64728c01f3`.
38 tes CI/ops + 7 auth + 1 integrasi Gitleaks lolos. Drill Jenkins memulihkan rilis
baseline setelah asset kandidat 404; recovery simulasi 94 ms. Bukan hasil produksi.
Dokumentasi dilengkapi setelah run; file runtime yang diuji tercakup dalam snapshot.

## Bukti yang perlu disimpan untuk penilaian

1. Konfigurasi dan alur job Jenkins, nomor build, hash source, Console, Artifacts.
2. `reports/infra/before.json` dan `summary.json`, beserta scope scanner/policy.
3. `reports/ops/summary.json`, events/alerts, serta demonstrasi rollback dan probe.
4. Screenshot frontend, metrics, log terstruktur, dan hasil perintah deployment.
5. Bukti PR/required checks, image/container runtime, SIEM, dan notifikasi setelah
   lingkungan terkait tersedia. Pisahkan hasil lokal, Jenkins, dan rencana.

Panduan: [OPERATIONS.md](OPERATIONS.md), [ARCHITECTURE.md](ARCHITECTURE.md),
[CI_PR_DAST.md](CI_PR_DAST.md), [LAPORAN_CI_DAST.md](LAPORAN_CI_DAST.md).
