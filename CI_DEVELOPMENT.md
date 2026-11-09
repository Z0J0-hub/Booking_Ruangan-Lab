# CI Development - Supabase

`Jenkinsfile.dev` berjalan pada agent Jenkins Windows karena memakai `bat`.
Dukungan sistem operasi lain belum dikembangkan. Docker dan WSL tidak diperlukan.

## Persiapan

Siapkan plugin Pipeline dan Git, Node.js 24 beserta npm, dan Git for Windows pada
agent. Node.js 24.17.0 serta npm 11.13.0 sudah dipakai pada latihan sebelumnya.

```bat
node --version
npm.cmd --version
git --version
where.exe node
where.exe npm.cmd
where.exe git
```

Jika belum tersedia, gunakan [installer Node.js](https://nodejs.org/en/download)
(sertakan npm) dan [Git for Windows](https://git-scm.com/install/windows).
PATH berisi folder tempat shell mencari program. Pastikan folder instalasi
tersedia bagi akun service Jenkins; buka terminal baru/restart service bila
perlu setelah perubahan, lalu verifikasi melalui stage Cek Lingkungan.

## Konfigurasi job

1. Pilih Pipeline script from SCM, SCM Git, dan repo
   `https://github.com/Z0J0-hub/Booking_Ruangan-Lab.git`.
2. Untuk pengembangan CI ini, gunakan Branch Specifier `*/ilyas` dan Script Path
   `Jenkinsfile.dev` setelah perubahan di-push. Branch `ilyas` sudah mengikuti
   versi Supabase dari `development`; hasil integrasi tim diuji dari `*/development`.
3. Setelah Jenkins membaca file ini, isi Build with Parameters:
   `SUPABASE_URL` dan `SUPABASE_PUBLIC_KEY` (anon/publishable key publik).
   Jangan gunakan service_role/secret key. Nilai publik tertanam pada artifact.
4. Build pertama dengan parameter kosong akan gagal pada Supabase Configuration;
   isi parameter lalu jalankan ulang. File `.env` lokal tidak dikirim ke Jenkins.

Checkout hanya sekali melalui SCM. Branch/commit mengikuti konfigurasi job,
termasuk jika berupa detached HEAD. `agent any` belum membatasi label Windows.

Alur: cek lingkungan -> checkout -> install -> tes modul CI -> scan secret -> audit ->
lint/typecheck -> konfigurasi Supabase -> tes modul auth -> build frontend -> archive.
Tidak ada install, tes, build, atau deployment backend MySQL pada versi aktif.

## Audit dan hasil

`npm run ci:audit` memeriksa dependency frontend aktif, menyimpan output di
`reports/audit/`, dan menghasilkan ringkasan JSON/teks. Audit backend MySQL tidak
aktif; laporan backend lama dibersihkan agar tidak terbaca sebagai hasil baru.
Temuan high/critical membuat modul keluar dengan status 1, error audit dengan 2,
dan hasil di bawah ambang dengan 0. Tidak ada perbaikan dependency otomatis.

Jenkins mengarsipkan laporan meskipun gagal. catchError membuat audit tetap merah
sambil membolehkan pemeriksaan berikutnya berjalan; hasil akhir tetap FAILURE.
Pembatalan manual dan kegagalan persiapan tidak diabaikan. Artifact dist pada
build merah bukan bukti kelulusan keamanan. Tidak ada deployment.

## Validasi

```bat
node --test scripts/ci/audit.test.mjs scripts/ci/secrets.test.mjs scripts/supabase/check.test.mjs
npm.cmd run test:auth
npm.cmd run supabase:check
npm.cmd run supabase:check -- --remote
npm.cmd run ci:audit
npm.cmd run ci:secrets
```

Pemeriksaan konfigurasi lokal hanya memvalidasi URL dan jenis key publik.
Mode remote melakukan GET endpoint Auth settings dengan public key dan memastikan
email auth aktif; tidak mengubah akun/data, tidak menguji signup/login/RLS.
CI memakai pemeriksaan lokal mode production agar sesuai environment Vite build.
Tes modul auth memakai service/SDK pengganti pada Node.js 24 tanpa mengakses
akun asli. Tes ini memeriksa perilaku integrasi lokal, bukan bukti Auth/RLS live.

Schema/trigger/policy dan tes SQL diperiksa lewat [panduan Supabase](supabase/README.md).
[Matriks STRIDE](STRIDE_MATRIX.md) sudah disesuaikan ke Supabase/PostgreSQL;
menjalankan tes unit modul tidak berarti tes RLS pada database sudah dijalankan.
Trigger PR, scanner keamanan kode, tes Auth/RLS remote otomatis, dan deployment
belum tersedia. Jenkinsfile utama adalah template legacy, bukan pipeline aktif.

## Scan secret

`npm run ci:secrets` menangani snapshot source, Gitleaks, dan laporan melalui satu
modul. Target saat ini Windows x64. Gitleaks portable **8.30.1** diunduh dari rilis
resmi ke `.tools/` pada pemakaian pertama; checksum arsip dan executable diverifikasi.
Run berikutnya memverifikasi binary cache. Tidak mengubah PATH atau memasang
program secara global. Akses GitHub diperlukan saat download pertama; scan
berjalan lokal dan tidak mengunggah source. Setup terpisah bisa dicoba dengan
`npm run ci:secrets:setup`.

Lingkup scan: file kerja terlacak Git dan file baru yang tidak diabaikan Git,
termasuk backend legacy. `.env` lokal, dependency terpasang, dan artifact yang
diabaikan tidak ikut disalin. Jika `.env` tidak sengaja terlacak Git, file itu
tetap diperiksa. File yang sudah dihapus tidak ikut; riwayat commit dan artifact
build tidak diperiksa. Symlink/submodule tidak didukung dan membuat scan error.

Aturan ada di `.gitleaks.toml`: aturan bawaan ditambah deteksi Supabase secret key.
Public anon/publishable key bukan kredensial admin; temuan perlu ditinjau menurut
aturan yang melaporkannya. Tidak ada allowlist project yang menutupi temuan secara
umum. Komentar bypass `gitleaks:allow` dan file ignore fingerprint tidak dipakai.

Hasil modul: `0` lolos, `1` temuan, `2` error alat/config/report. Error bukan hasil
bersih. Jenkins mempertahankan stage/build FAILURE tetapi melanjutkan pemeriksaan
lain. `reports/secrets/` diarsipkan meskipun gagal: `findings.json` hanya berisi
rule/file/baris, ditambah `summary.json` dan `summary.txt`. Nilai secret, teks
match, baris source, serta output mentah alat tidak diarsipkan atau dicetak.

Jika ada temuan, review lokasi secara lokal. Credential nyata yang sudah bocor
perlu dicabut/dirotasi; sekadar menghapusnya dari versi terbaru tidak membersihkan
riwayat Git. Jangan menyalin nilai credential ke diskusi PR atau log Jenkins.
Scan bersih bukan bukti tidak ada semua jenis secret atau bahwa STRIDE sudah lolos.

Setelah push, arahkan job ke `*/ilyas`, jalankan build, periksa Secret Scan dan
Build Artifacts. Pertahankan parameter publik Supabase yang sebelumnya dipakai.
Audit dependency masih dapat membuat hasil akhir merah walaupun secret scan lolos.

Referensi: [Gitleaks](https://github.com/gitleaks/gitleaks) dan
[rilis yang digunakan](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1).
