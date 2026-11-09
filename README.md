# Reservasi Ruangan Perpustakaan

React + TypeScript + Vite dengan Supabase Auth dan PostgreSQL. Versi ini
memulihkan aplikasi dari branch lokal `kirim-supabase`, sambil mempertahankan
pipeline CI. Browser mengakses Supabase langsung; Express/MySQL di `backend/`
adalah legacy dan tidak dipakai aplikasi aktif.

## Menjalankan lokal

Prasyarat: Node.js 24 dan npm. Tidak perlu Docker, WSL, atau database lokal.

```bat
npm.cmd ci
copy .env.example .env
```

Jika `.env` sudah ada dan benar, jangan ditimpa. Isi URL project serta public
anon/publishable key dari Supabase, lalu:

```bat
npm.cmd run supabase:check
npm.cmd run supabase:check -- --remote
npm.cmd run dev
```

Buka alamat yang ditampilkan Vite, biasanya `http://localhost:5173`.
Konfigurasi `.env` lama yang sudah dipakai tidak diubah oleh pemulihan kode.
Secret/service_role key tidak boleh digunakan sebagai nilai `VITE_*`.

## Supabase

[Setup dan pemeriksaan database](supabase/README.md) menjelaskan project baru
serta pemeriksaan read-only untuk project yang sudah berisi data. Jangan
menjalankan ulang schema instalasi pada project yang sudah bekerja.

Di Authentication, aktifkan email/password. Atur Site URL dan Redirect URLs
sesuai origin frontend, termasuk port Vite yang benar. Signup, login, refresh
session, reset password, dan logout disediakan Supabase Auth. Profil aplikasi
tersimpan di `profiles` dan dibuat oleh trigger pada `auth.users`.

Role aplikasi pada versi yang dipulihkan adalah `student` dan `admin`. Role
privileged tidak diambil dari metadata signup. Booking baru berstatus `pending`
untuk diproses admin; QR check-in dan auto-approval dari versi MySQL belum
termasuk versi Supabase ini. Pengguna biasa hanya melihat booking sendiri;
constraint database tetap menolak bentrok lintas pengguna.

## Validasi dan CI

[Modul auth](src/features/auth/README.md) mengelompokkan halaman, service Supabase,
dan store sesi. Fitur lain memakai interface `@/features/auth`.

```bat
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test:auth
npm.cmd run build
npm.cmd run ci:audit
npm.cmd run ci:secrets
node --test scripts/ci/audit.test.mjs scripts/supabase/check.test.mjs
```

[CI_DEVELOPMENT.md](CI_DEVELOPMENT.md) menjelaskan Jenkins Windows. Audit memeriksa
paket frontend aktif; dependency server legacy tidak ikut dianggap backend aktif.
Scan secret memeriksa source kerja menggunakan Gitleaks portable, dengan laporan
tanpa nilai credential. Pengembangan CI dilakukan di `ilyas`, lalu PR ke `development`.
[Matriks STRIDE](STRIDE_MATRIX.md) membedakan kontrol sumber dan bukti yang belum diuji.
Build/lint bukan bukti login, database, atau RLS sudah berjalan pada project remote.

## Docker opsional

Compose hanya menjalankan frontend Nginx, dengan Supabase terkelola di luar
container. Gunakan `docker compose up -d --build` bila Docker tersedia. Konfigurasi
publik disisipkan saat build; rebuild setelah menggantinya. Compose staging dan
production berdiri sendiri. Docker belum diuji pada lingkungan Windows latihan.

`Jenkinsfile` utama dan panduan deployment lama masih merupakan referensi
arsitektur Express/MySQL; gunakan `Jenkinsfile.dev` untuk pipeline aktif ini.
