# Integrasi Gate Keamanan dan Pengujian Pemulihan pada Aplikasi Reservasi Berbasis Supabase

**Draf bahan paper, belum siap dikumpulkan/publikasi.** Identitas penulis, template
kampus/jurnal, proposal awal, tinjauan pustaka ilmiah, dan persetujuan tim perlu
dilengkapi. Angka berikut berasal dari bukti pengujian proyek, bukan eksperimen
produksi atau klaim keamanan menyeluruh.

## Abstrak

Proyek ini menerapkan pemeriksaan keamanan pada pipeline aplikasi reservasi
ruangan berbasis React dan Supabase. Pipeline Jenkins Windows menggabungkan
pemeriksaan dependency, secret, pola kode berisiko, konfigurasi infrastruktur,
baseline DAST, dan latihan pemulihan. Dua pengujian negatif menunjukkan bahwa
temuan secret sintetis dan SAST menghentikan tahap berikutnya. Pengujian
infrastruktur setelah hardening menghasilkan nol temuan pada 62 kontrol, sedangkan
baseline konfigurasi menghasilkan 25 temuan pada 57 kontrol; lima kontrol tambahan
memeriksa pengecualian build context. Drill operasi menguji agregasi log lokal,
deteksi gangguan, serta rollback frontend setelah kegagalan asset. Pipeline
gabungan berhasil pada Jenkins dengan durasi 86,540 detik. Hasil menunjukkan
kelayakan integrasi pada lingkungan lokal; image runtime, SIEM eksternal,
notifikasi operator, serta proteksi merge PR belum dibuktikan.

## 1. Pendahuluan

Build yang berhasil tidak membuktikan aplikasi aman. Source dapat mengandung
credential atau pola berisiko, dependency dapat memiliki advisory, konfigurasi
container dapat berlebihan, dan artifact yang terbentuk dapat gagal ketika
dijalankan. Proyek memisahkan pemeriksaan source, konfigurasi, perilaku HTTP,
dan pemulihan agar setiap hasil mempunyai cakupan bukti yang jelas.

Pertanyaan evaluasi: apakah gate menghentikan proses ketika scanner menemukan
masalah; apakah konfigurasi aktif memenuhi kontrol yang dipilih; dan apakah
frontend dapat kembali ke release sehat saat pemeriksaan kandidat gagal?

## 2. Metode

Aplikasi menggunakan React/TypeScript, Supabase Auth, Data API, PostgreSQL, RLS,
constraint, serta trigger audit. Browser mengakses Supabase secara langsung.
Frontend lokal hanya melayani file statis. Arsitektur dan batas kepercayaan
terdokumentasi pada ARCHITECTURE.md dan STRIDE_MATRIX.md.

Pipeline menerapkan Gitleaks 8.30.1, npm audit dengan ambang High/Critical, SAST
terpilih menggunakan ESLint security, Trivy 0.76.2 untuk Dockerfile, policy Compose
proyek, serta ZAP 2.17.0 untuk baseline pasif. Scanner dipin; error atau laporan
tidak valid tidak boleh dikonversi menjadi hasil bersih. Policy Compose bukan
scanner resmi Trivy atau audit CIS lengkap.

Pengujian negatif menggunakan fixture sintetis dalam workspace job terpisah.
Verifikasi memeriksa status build, artifact blocked, exit code 1, dan tahap
lanjutan yang dilewati. Pengujian konfigurasi membandingkan Dockerfile/Compose
committed HEAD dengan perubahan lokal. Pengecualian build context ditambahkan
sebagai lima kontrol terpisah.

Drill operasi menjalankan dist pada loopback, membuat kandidat yang merujuk asset
JavaScript tidak tersedia, dan melakukan smoke test HTTP. Pengelola rilis
memverifikasi manifest SHA-256, mengaktifkan kandidat, kemudian memulihkan rilis
sebelumnya jika pemeriksaan gagal. Collector lokal hanya menerima field event
terbatas; query/token tidak dicatat. Probe gangguan dan lonjakan 404 menghasilkan
alert lokal dengan tingkat eskalasi yang ditentukan.

## 3. Hasil

| Pengujian | Hasil |
|---|---|
| Jenkins secret proof #1 | Scanner blocked, build FAILURE, tahap berikutnya dilewati |
| Jenkins SAST proof #2 | Scanner blocked, build FAILURE, tahap berikutnya dilewati |
| Konfigurasi sebelum hardening | 25 temuan / 57 kontrol pada cakupan Dockerfile dan Compose |
| Konfigurasi sesudah hardening | 0 temuan / 62 kontrol, termasuk 5 kontrol build context tambahan |
| Tes modul CI/ops/staging/runner | 38 lolos |
| Tes modul auth dan integrasi Gitleaks | 7 + 1 lolos |
| Drill operasi | 8 kondisi lolos; tiga jenis alert tercatat |
| Rollback pada drill Jenkins | Release baseline pulih; durasi simulasi 94 ms |
| Pipeline gabungan Jenkins | reservasi-local-ops #2, SUCCESS, 86,540 detik |

Source diuji sebagai snapshot lokal, SHA-256
`290de7bc3dbc5b75f096b28a23083e636669be49063101c0f692ff64728c01f3`,
di atas parent commit `6e64c55`. Perubahan belum dipublikasikan sebagai commit/PR.
Artifact infra dan operasi tersedia pada build Jenkins terkait. Bukti rinci ada
di reports/jenkins/, reports/infra/, dan reports/ops/.

## 4. Diskusi dan keterbatasan

Kegagalan negatif yang diharapkan berbeda dari error infrastruktur. Percobaan
sebelumnya pernah berhenti karena unduhan scanner atau layanan audit; kondisi
tersebut dicatat sebagai error dan tidak dihitung sebagai bukti deteksi temuan.
Keberhasilan pipeline juga tidak berarti seluruh vulnerability dihilangkan:
baseline DAST sebelumnya mencatat dua Medium, sedangkan audit dependency mencatat
sembilan Moderate dan dua Low. Hasil mengikuti artifact setiap run.

Durasi satu run bukan benchmark kinerja. Cache, jaringan, dan jumlah dependency
mempengaruhi waktu; angka recovery 94 ms berasal dari drill frontend lokal dan
tidak mewakili MTTR produksi. Studi belum menguji authenticated SPA/API DAST,
container runtime, image aplikasi, cloud firewall, backup database, SIEM, maupun
notifikasi eksternal. Tes SQL 14 skenario terdahulu berasal dari project Supabase
pengujian terpisah, tidak membuktikan project utama identik.

## 5. Kesimpulan sementara

Gate source, konfigurasi, baseline DAST, dan drill pemulihan berhasil digabungkan
pada Jenkins Windows. Langkah berikutnya adalah memublikasikan perubahan melalui
ilyas ke development, menyiapkan agent PR terisolasi dan required checks, menjalankan
image scan pada mesin Docker, serta mengintegrasikan observabilitas operasional.

## Referensi implementasi awal

- [Jenkins Pipeline](https://www.jenkins.io/doc/book/pipeline/)
- [Trivy misconfiguration scanning](https://trivy.dev/docs/latest/scanner/misconfiguration/)
- [ZAP Automation Framework](https://www.zaproxy.org/docs/automate/automation-framework/)
- [Docker Compose service controls](https://docs.docker.com/reference/compose-file/services/)
- [Prometheus alerting rules](https://prometheus.io/docs/prometheus/latest/configuration/alerting_rules/)

Lengkapi kajian ilmiah dan format sitasi sesuai ketentuan paper sebelum pengumpulan.
