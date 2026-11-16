# Laporan pengujian CI dan DAST — 15 November 2026

**Nomor 1 selesai sebagian. Nomor 2 sudah diterapkan dan diuji sebagai baseline
DAST pasif.** Pengujian memakai snapshot perubahan lokal melalui Jenkins;
belum ada commit, push, PR baru, atau merge.

## Bukti Jenkins

| Pengujian | Build | Hasil dan bukti |
|---|---|---|
| Baseline sebelum DAST | [reservasi-pipeline #15](http://localhost:8080/job/reservasi-pipeline/15/) | SUCCESS, parent commit 6e64c55 |
| Fail-fast secret | [reservasi-local-proof #1](http://localhost:8080/job/arsip-reservasi/job/reservasi-local-proof/1/) | FAILURE yang diharapkan: Gitleaks menemukan 1 secret sintetis, exit 1, Must Be Skipped dilewati |
| Fail-fast SAST | [reservasi-local-proof #2](http://localhost:8080/job/arsip-reservasi/job/reservasi-local-proof/2/) | FAILURE yang diharapkan: SAST menemukan 1 fixture tidak aman, exit 1, Must Be Skipped dilewati |
| Pipeline lengkap + DAST | [reservasi-local-dast #3](http://localhost:8080/job/arsip-reservasi/job/reservasi-local-dast/3/) | SUCCESS, durasi 115.013 detik; seluruh gate wajib lolos, dist dan laporan diarsipkan |

Kedua bukti negatif diverifikasi melalui status build, artifact scanner, exit code,
dan pesan tahap berikutnya dilewati. Fixture dibersihkan pada post always.
Tes otomatis: 34 tes modul CI/staging/runner, 7 auth, 1 integrasi Gitleaks lolos;
lint, TypeScript, SAST, scan secret, serta build produksi lolos.

Pengujian proof memakai snapshot
`7f522d949fdf9a932e6a2da300e26da4549adfcdcd27852544ad6dea96b7ecbb`.
Build DAST #3 memakai snapshot
`53ccdd5a4c4e8053f5e6c13d80c7f598347ed8a584fe2dfc1ee87dc010aac475`.
Hash ini mengidentifikasi allowlist file lokal yang menimpa checkout parent ilyas,
bukan commit Git baru. Deskripsi build dan laporan DAST mencatat identitas snapshot.
Helper kontrol dan laporan kemudian diperbarui untuk pengambilan bukti; file hasil
snapshot di Jenkins tetap sesuai hash masing-masing build.

Percobaan DAST #1 gagal saat unduhan ZAP terkena connection reset; #2 gagal pada
layanan/configuration audit (exit 2). Keduanya menghentikan tahap berikutnya.
#3 mengulang semua gate; arsip ZAP lokal diverifikasi SHA-256 sebelum dipakai.
Tidak ada gate yang dimatikan untuk mendapatkan SUCCESS.

## Hasil DAST

ZAP 2.17.0, 14 request ke frontend staging loopback, durasi scanner 37 detik:

| Risiko | Jumlah |
|---|---:|
| High | 0 |
| Medium | 2 |
| Low | 0 |
| Informational | 2 |

Medium: `CSP: style-src unsafe-inline` dan `Sub Resource Integrity Attribute
Missing`. Keduanya tetap dilaporkan. Gate menggunakan ambang High; error scanner
juga gagal. Tindak lanjut: tinjau inline style komponen React dan hosting font
lokal/SRI. Informational mencakup komentar bundle dan deteksi aplikasi modern.

Cakupan hanya baseline pasif tanpa login pada server staging Node dan asset dist.
Belum menguji active attack, navigasi SPA berbasis browser, login/API Supabase,
RLS, atau konfigurasi hosting produksi. Staging dan ZAP berhenti setelah run;
raw session/report dihapus, artifact hanya berisi ringkasan yang disaring.
Ini memenuhi penerapan awal DAST di pipeline, belum seluruh cakupan dinamis rubrik.

## Otomatisasi dan pekerjaan yang belum selesai

- **Aktif:** SCM polling branch terpercaya ilyas pada reservasi-pipeline, sekitar
  5 menit. Konfigurasi dibaca ulang setelah disimpan. Belum ada push baru untuk
  membuktikan build yang dipicu perubahan commit.
- **Disiapkan, disabled:** reservasi-pr-security, GitHub Branch Source, origin PR
  memakai merge revision, indexing 15 menit. Source policy menolak target PR
  selain development. Fork PR belum diaktifkan.
- **Belum:** agent Windows PR terisolasi. Controller sekarang memakai SYSTEM;
  job PR belum diaktifkan pada lingkungan tersebut.
- **Belum:** kredensial GitHub Jenkins untuk menulis commit status dan required
  checks pada development. Connector ilysTelu mempunyai push, tanpa admin; owner
  repository perlu mengatur proteksi setelah status check sungguhan muncul.
- **Belum:** commit/push perubahan dan uji PR sungguhan. Connector menolak penulisan
  tree (403); permintaan membuat branch/commit lewat Git lokal ditolak sehingga
  pengujian dilanjutkan sebagai snapshot lokal.

Nomor 1 baru dapat dinyatakan lengkap setelah PR memicu build otomatis, status
gagal/pending memblokir merge, status sukses membuka merge sesuai aturan review,
dan bukti konfigurasi serta hasil disimpan.

JSON bukti lokal ada di `reports/jenkins/`, termasuk verifikasi proof #1/#2,
metadata build DAST #3, hasil scan, dan status konfigurasi otomatisasi.
Panduan menjalankan ulang: [CI_PR_DAST.md](CI_PR_DAST.md).
