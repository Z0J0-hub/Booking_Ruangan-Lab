# Matriks STRIDE - Supabase Auth / PostgreSQL

Lingkup: React berkomunikasi langsung dengan Supabase Auth dan Data API.
PostgreSQL menerapkan RLS, trigger profil/audit, dan constraint booking.
Express/MySQL bukan backend aktif. Matriks ini menggantikan rencana tes API
MySQL pada commit CI sebelumnya; ia bukan hasil tes keamanan yang sudah lolos.

Status **review kode** berarti kontrol terlihat dalam source yang dipulihkan.
**Belum diuji remote** berarti belum dibuktikan pada project Supabase pengguna.
**Gap** berarti kontrol yang diperlukan belum tersedia/dibuktikan. Pemeriksaan
konfigurasi dan build tidak membuktikan schema remote sama dengan file SQL.

| ID | Ancaman | Kontrol sumber | Pemeriksaan berikutnya | Status |
|---|---|---|---|---|
| S-01 | Identitas/token palsu atau sesi kedaluwarsa | Supabase Auth; policy memakai auth.uid() | Token kosong/palsu ditolak; sesi valid dapat membaca profil sendiri; logout/recovery diperiksa melalui SDK | Belum diuji remote |
| E-01 | Metadata signup mengangkat pengguna menjadi admin | Trigger tidak mengambil role metadata; default student; tidak ada grant edit profiles | Signup dengan metadata role admin tetap student; user tidak dapat mengubah role sendiri atau menambah room | Review kode; smoke SQL tersedia, belum dijalankan |
| T-01 | Menulis booking sebagai orang lain atau mengubah status tanpa izin | RLS insert own pending; UPDATE hanya kolom status/alasan dan hanya admin | Student A gagal booking sebagai B dan gagal approve; admin dapat approve; database tidak berubah saat akses ditolak | Review kode; smoke SQL tersedia, belum dijalankan |
| T-02 | Jadwal bentrok atau di luar ketentuan | Exclusion constraint PostgreSQL; validasi jam/hari/future; alasan pembatalan wajib | Tolak overlap lintas pengguna, jadwal lampau/tidak valid, dan pembatalan tanpa alasan; terima slot bersebelahan | Review kode; smoke SQL tersedia, konkurensi belum diuji |
| R-01 | Pelaku menyangkal perubahan booking | Trigger mencatat auth.uid(), action, resource, waktu, dan before/after; grant audit hanya SELECT admin | Perubahan mencatat actor dan nilai; student tidak membaca log; client termasuk admin tidak dapat menghapus/mengubah log | Review kode; smoke SQL parsial tersedia, belum dijalankan |
| I-01 | Profil/booking pengguna lain atau audit log terbuka | SELECT RLS own-or-admin; anon tidak mendapat grant tabel | B tidak melihat data A; anon ditolak; admin membaca sesuai izin; audit_logs hanya admin | Review kode; smoke SQL parsial tersedia, belum dijalankan |
| I-02 | Key privileged bocor ke browser atau artifact | Template memakai public key; validator menolak secret/service_role; .env tidak dilacak | Scan secret pada file terlacak; periksa artifact; verifikasi konfigurasi memakai public key dan RLS | Validasi jenis key lokal tersedia; scanner/tes artifact belum ada |
| D-01 | Request berlebihan menghabiskan kapasitas layanan | Pembatasan layanan Supabase bergantung project; tidak ada limiter Express aktif | Review pengaturan rate limit Auth, kebijakan layanan, dan batas query; tes terbatas pada project uji dengan izin | Belum diverifikasi; jangan menganggap limiter versi MySQL berlaku |

Sumber kontrol: [schema instalasi](supabase/initial_schema.sql),
[tes SQL](supabase/schema_smoke_test.sql), [modul auth](src/features/auth/README.md).
Bentuk role pada versi ini student/admin, bukan user/admin. Tidak ada QR check-in.

## Urutan validasi

1. Validasi public config dan endpoint Auth menggunakan npm run supabase:check.
2. Pada project yang sudah bekerja, jalankan inspect_schema.sql yang hanya SELECT.
   Jangan menjalankan schema instalasi ulang atau mengubah policy sebelum hasil dibandingkan.
3. Cocokkan schema, grant, policy, dan trigger live. Perubahan database memerlukan
   rencana migrasi terpisah; initial_schema.sql hanya untuk project baru.
4. Jalankan schema_smoke_test.sql hanya pada project development setelah schema
   dikonfirmasi sesuai. Fixture berakhir ROLLBACK; bila gagal jalankan ROLLBACK.
   Tes SQL dengan impersonasi role tidak menggantikan tes JWT melalui API/Auth.
5. Uji signup, email confirmation, login, reload session, reset password, dan logout
   melalui aplikasi. Lanjutkan dengan user A/B/admin sintetis untuk tes API/RLS.

CI belum menjalankan SQL atau mengubah project Supabase. Hasil audit dependency
sebelumnya tidak dapat dijadikan angka acuan untuk lockfile Supabase yang berbeda.
Ancaman yang gagal harus dicatat dan diperbaiki, bukan ditandai lolos agar CI hijau.
