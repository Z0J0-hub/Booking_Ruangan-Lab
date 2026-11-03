# Development lokal (Windows / PowerShell)

Jalankan semua perintah dari folder `Booking_Ruangan-Lab`, tempat `package.json`
dan `.git` proyek berada. Folder induk `app_z` adalah repository terpisah.

## Persiapan

Gunakan Node.js 24 dan MySQL (MySQL XAMPP/MariaDB bisa dipakai untuk lokal).
Di PowerShell gunakan `npm.cmd` apabila `npm.ps1` diblokir execution policy.

```powershell
npm.cmd ci
npm.cmd --prefix backend ci
npm.cmd run setup
```

Setup membuat `.env` dengan password acak dan tidak menimpa file yang sudah ada.
File ini diabaikan Git. Jangan commit atau membagikan isinya.

Nyalakan MySQL melalui XAMPP Control Panel. Pastikan port database sesuai
`DB_PORT` di `.env` (default 3306). Kemudian:

```powershell
npm.cmd run setup:db
```

Script ini membuat database `DB_NAME` dan user `DB_USER` sesuai `.env`, serta
memberikan hak akses hanya ke database aplikasi. Default akun provisioning
adalah `root` tanpa password, mengikuti konfigurasi awal XAMPP. Kalau root
memiliki password, isi `$env:DB_SETUP_PASSWORD` di terminal sebelum menjalankan
script. User yang sudah ada tidak diubah; password `.env` harus cocok.

## Menjalankan aplikasi

Terminal pertama:

```powershell
npm.cmd run dev:backend
```

Backend otomatis membuat tabel dan akun admin saat startup pertama. Ia membaca
`.env` di akar proyek, termasuk saat dijalankan dari folder `backend`.

Terminal kedua:

```powershell
npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Buka http://127.0.0.1:5173. Login menggunakan `ADMIN_EMAIL` dan `ADMIN_PASSWORD`
di `.env`. Admin dapat menambahkan ruangan; pengguna biasa bisa mendaftar dari
halaman aplikasi. Akun admin hanya dibuat jika belum ada admin di database.
Mengubah password di `.env` tidak mengganti password admin yang sudah dibuat.

Vite meneruskan `/api` ke backend port 3000. Cek koneksi database dan API:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/health
Invoke-RestMethod http://127.0.0.1:5173/api/health
```

SMTP dikosongkan oleh setup lokal. Fitur lupa password membutuhkan konfigurasi
SMTP sungguhan agar email terkirim. Hentikan frontend/backend dengan Ctrl+C.

## Pemeriksaan sebelum push / Jenkins

```powershell
npm.cmd run check
```

Mencakup TypeScript, ESLint, build frontend, pemeriksaan sintaks backend, dan tes
aturan booking. Ini belum menggantikan pengujian UI serta integrasi database.

## Persiapan Jenkins development

Gunakan `Jenkinsfile.dev` sebagai Script Path job Pipeline from SCM, dengan repo
GitHub proyek dan branch `*/development`. File berada di akar repo GitHub, sehingga
Script Path tetap `Jenkinsfile.dev`, bukan `Booking_Ruangan-Lab/Jenkinsfile.dev`.
Agent membutuhkan Git, Node.js 24, npm dan akses registry npm. Pipeline mendukung
agent Windows maupun Linux: checkout, install, types/lint, tes, build, audit,
dan arsip artefak.
Pipeline ini tidak membutuhkan `.env` atau database karena belum menjalankan
tes integrasi API. Ia belum melakukan deployment; hasil build bisa diunduh dari
Artifacts. Panduan setup server dan job ada di [JENKINS_DEVELOPMENT.md](JENKINS_DEVELOPMENT.md).
Jenkinsfile utama masih merupakan template deployment
lama yang membutuhkan penyesuaian registry, credentials, dan alat tambahan.
