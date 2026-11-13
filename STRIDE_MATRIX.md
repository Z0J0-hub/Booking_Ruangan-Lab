# Matriks STRIDE - Supabase Auth / PostgreSQL

Lingkup: React berkomunikasi langsung dengan Supabase Auth dan Data API.

Hubungan ancaman proposal dengan gate CI dan batas tes dijelaskan pada
[rencana CI dan keamanan](CI_SECURITY_PLAN.md). SAST terpilih melengkapi kontrol
source; tidak menggantikan tes JWT/Auth API, RLS, atau seluruh kategori STRIDE.
PostgreSQL menerapkan RLS, trigger profil/audit, dan constraint booking.
Express/MySQL bukan backend aktif. Matriks ini menggantikan rencana tes API
MySQL pada commit CI sebelumnya. Hasil di bawah berlaku sesuai lingkungan dan
cakupan tes yang disebutkan, bukan klaim seluruh aplikasi aman.

Status **review kode** berarti kontrol terlihat dalam source yang dipulihkan.
**Belum diuji remote** berarti belum dibuktikan pada project Supabase pengguna.
**Gap** berarti kontrol yang diperlukan belum tersedia/dibuktikan. Pemeriksaan
konfigurasi dan build tidak membuktikan schema remote sama dengan file SQL.

Inventaris live yang dibagikan pengguna menunjukkan RLS aktif pada empat tabel,
delapan policy sesuai rancangan, dan trigger profil/audit/jadwal/updated_at
terpasang. Ini konfirmasi metadata, belum bukti isi fungsi, grant, atau perilaku
akses. Runner [tes database](supabase/STRIDE_TESTS.md) kini disiapkan dengan
14 skenario. Berdasarkan hasil eksekusi manual yang dibagikan pengguna pada
10 November 2026, seluruh 14 skenario lolos pada **project Supabase pengujian
terpisah** dengan `rollback=confirmed`. Ini bukan hasil Jenkins atau bukti
bahwa konfigurasi project aplikasi utama sama dengan project pengujian.

| ID | Ancaman | Kontrol sumber | Pemeriksaan berikutnya | Status |
|---|---|---|---|---|
| S-01 | Identitas/token palsu atau sesi kedaluwarsa | Supabase Auth; policy memakai auth.uid() | Token kosong/palsu ditolak; sesi valid dapat membaca profil sendiri; logout/recovery diperiksa melalui SDK | Belum diuji remote |
| E-01 | Metadata signup mengangkat pengguna menjadi admin | Trigger tidak mengambil role metadata; default student; tidak ada grant edit profiles | Metadata INSERT auth.users tetap menghasilkan student; user tidak mengubah role atau menambah room; admin memiliki akses positif | Skenario SQL lolos manual pada project tes; signup melalui Auth API belum diuji |
| T-01 | Menulis booking sebagai orang lain atau mengubah status tanpa izin | RLS insert own pending; UPDATE hanya kolom status/alasan dan hanya admin | Student A gagal booking sebagai B dan gagal approve; admin dapat approve | Skenario SQL lolos manual pada project tes |
| T-02 | Jadwal bentrok atau di luar ketentuan | Exclusion constraint PostgreSQL; validasi jam/hari/future; alasan pembatalan wajib | Runner memeriksa overlap tersembunyi, jadwal lampau, dan alasan pembatalan; tes SQL lama juga memeriksa slot bersebelahan | Tiga skenario runner lolos manual pada project tes; slot bersebelahan, semua batas jadwal, dan konkurensi request belum dibuktikan oleh run ini |
| R-01 | Pelaku menyangkal perubahan booking | Trigger mencatat auth.uid(), action, resource, waktu, dan before/after; grant audit hanya SELECT admin | Perubahan mencatat actor/waktu/before-after; admin aplikasi tidak dapat mengubah/menghapus log | Skenario SQL lolos manual pada project tes |
| I-01 | Profil/booking pengguna lain atau audit log terbuka | SELECT RLS own-or-admin; anon tidak mendapat grant tabel | A/B membaca data sendiri tetapi bukan pengguna lain; anon ditolak; log hanya admin | Skenario SQL lolos manual pada project tes |
| I-02 | Key privileged bocor ke browser atau artifact | Template memakai public key; validator menolak secret/service_role; .env tidak dilacak; Gitleaks memeriksa source kerja | Jalankan ci:secrets; tinjau rule/file/baris; periksa artifact dan konfigurasi publik terpisah | Scanner source tersedia; pemeriksaan riwayat Git dan artifact belum ada; hasil mengikuti laporan setiap run |
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

`npm run ci:secrets` menambah bukti terbatas untuk I-02 dari source kerja.
Scanner memakai pola/rule, bukan pengujian login, akses data, RLS, atau semua
kategori STRIDE. Laporan dengan temuan atau error membuat CI tetap gagal.

CI belum menjalankan SQL atau mengubah project Supabase. Hasil audit dependency
sebelumnya tidak dapat dijadikan angka acuan untuk lockfile Supabase yang berbeda.
Ancaman yang gagal harus dicatat dan diperbaiki, bukan ditandai lolos agar CI hijau.

Stage STRIDE Database default tidak aktif. Passed/failed baru dicatat setelah
SQL dijalankan, sedangkan tes lokal `test:stride-runner` hanya membuktikan
orchestrator dengan client pengganti. Validasi JWT, email, dan rate limit tetap
pekerjaan terpisah; hasil SQL tidak boleh dianggap semua STRIDE sudah lolos.
