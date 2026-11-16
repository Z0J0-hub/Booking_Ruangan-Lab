# Urutan demo dan bukti penilaian

Penggunaan sekarang: reservasi-pipeline, PROOF_GATE=none (CI lengkap), secret/sast
(demo negatif). Job lokal di tautan bukti lama sudah nonaktif di arsip-reservasi;
nomor buildnya tetap menjadi bukti historis.

Gunakan data/akun tes dan jelaskan batas cakupan setiap alat. Tidak perlu
memperlihatkan file token Jenkins atau credential database.

1. Tampilkan ARCHITECTURE.md dan STRIDE_MATRIX.md: browser langsung ke Supabase,
   trust boundary, role student/admin, ancaman, mitigasi, dan gap pengujian.
2. Tampilkan [reservasi-local-ops #2](http://localhost:8080/job/arsip-reservasi/job/reservasi-local-ops/2/):
   Console/Artifacts, Infrastructure Configuration, DAST Staging, Operations Drill,
   serta Archive Build. Source adalah snapshot lokal, bukan commit baru.
3. Bandingkan reports/infra/before.json dengan summary.json: 25 temuan baseline
   Dockerfile/Compose, lalu nol pada cakupan yang diperkeras plus kontrol ignore.
   Perlihatkan UID, read-only, cap_drop, loopback, internal network, dan image digest.
   Jelaskan image belum dibangun/discan karena Docker belum tersedia.
4. Tampilkan proof #1/#2 di job reservasi-local-proof. FAILURE diharapkan; tunjukkan
   laporan blocked dan Must Be Skipped, bukan hanya warna merah build.
5. Jalankan `npm.cmd run ops:drill`, tampilkan reports/ops/summary.json serta
   alerts.ndjson: 404 burst, deployment failure, availability critical, rollback.
   Nilai recovery adalah simulasi lokal, bukan ukuran produksi.
6. Untuk demo interaktif: `npm.cmd run build`, `npm.cmd run ops:serve`; buka
   http://127.0.0.1:8081 dan http://127.0.0.1:9091/metrics. Di terminal kedua jalankan
   `npm.cmd run ops:deploy`. Perlihatkan konfirmasi deployed dan log terstruktur;
   hentikan layanan dengan Ctrl+C setelah demo.
7. Tampilkan RUBRIK_STATUS.md: bedakan bukti yang tersedia dari PR/required checks,
   image runtime, SIEM/notifikasi, dan dokumen/pengumpulan yang masih tertunda.

Simpan screenshot konfigurasi, alur, dan hasil beserta nomor build/hash. Simpan
bukti presentasi/pengumpulan LMS secara terpisah. PAPER_DRAFT.md masih bahan awal,
bukan paper final yang sudah diperiksa/diserahkan.
