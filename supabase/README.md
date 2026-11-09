# Setup proyek Supabase baru

## Proyek yang sudah pernah dipakai

Untuk runner pemeriksaan RLS dengan fixture dan ROLLBACK, baca
[STRIDE_TESTS.md](STRIDE_TESTS.md). Modul sudah disiapkan; eksekusi database
memerlukan persetujuan project dan credential khusus, bukan public key frontend.

Jika login dan database sudah bekerja pada project yang sama, **jangan jalankan
ulang `initial_schema.sql` atau migrasi lama**. Periksa konfigurasi lokal dengan
`npm run supabase:check`, lalu `npm run supabase:check -- --remote` untuk
pemeriksaan read-only endpoint Auth. Perintah kedua tidak mendaftarkan akun,
tidak login, dan tidak membuktikan schema/RLS sudah cocok.

Jalankan [inspect_schema.sql](inspect_schema.sql) di SQL Editor untuk melihat
tabel, kolom, RLS, policy, dan trigger yang sudah terpasang. File itu hanya SELECT.
Cocokkan dengan schema sumber sebelum merencanakan migrasi; jangan menghapus
atau menimpa tabel untuk menyamakan versi. SQL deployment belum dijalankan oleh CI.

## Instalasi pada project baru

Gunakan `initial_schema.sql` untuk database baru. File ini berdiri sendiri dan
tidak memerlukan tabel dari sistem booking alat.

1. Buka proyek di dashboard Supabase, pilih **SQL Editor > New query**.
2. Salin seluruh isi `initial_schema.sql`, lalu klik **Run** sekali.
3. Periksa tabel `profiles`, `rooms`, `bookings`, dan `audit_logs` di Table Editor.
4. Daftarkan akun melalui aplikasi. Jika konfirmasi email aktif, konfirmasikan
   email sebelum login. Profil otomatis dibuat dengan peran `student`.
5. Untuk menjadikan akunmu admin, jalankan SQL berikut di SQL Editor. Ganti alamat
   email dengan email akun yang sudah terdaftar:

```sql
UPDATE public.profiles
SET role = 'admin'
WHERE id = (SELECT id FROM auth.users WHERE email = 'email-kamu@example.com')
RETURNING id, email, role;
```

Pastikan hasilnya satu baris. Logout lalu login kembali agar aplikasi membaca
peran baru. Buka menu ruangan untuk menambahkan ruang melalui akun admin.
Tidak ada akun admin atau data ruang contoh yang dibuat oleh SQL instalasi.

Isi `.env` dengan `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` (anon key lama
atau publishable key publik; bukan service_role/secret key). Di dashboard,
atur **Authentication > URL Configuration**: gunakan `http://localhost:8080`
sebagai Site URL dan tambahkan alamat tersebut ke Redirect URLs untuk Docker lokal.
Tambahkan `http://localhost:5173` jika menjalankan Vite langsung. Untuk server
production, gunakan alamat website sebenarnya.

Jalankan `docker compose up -d --build`, lalu buka `http://localhost:8080`.
Tanpa Docker, gunakan `npm ci` lalu `npm run dev` dan buka alamat Vite yang tampil.

## Perbedaan dengan migrasi lama

`library_booking_migration.sql` hanya untuk database sistem booking alat yang
sudah memiliki tabel `profiles` dan `bookings`. **Jangan jalankan kedua file SQL
tersebut berurutan.** Pada proyek baru cukup gunakan `initial_schema.sql`.
Instalasi akan gagal tanpa menimpa data jika tabel aplikasi sudah ada. Jika SQL
Editor masih berada dalam transaksi gagal, jalankan `ROLLBACK;` sebelum mencoba
lagi setelah memperbaiki penyebabnya. Jangan menghapus tabel untuk mengatasi
error tanpa memeriksa data yang sudah ada.

## Aturan yang disiapkan

Mahasiswa hanya dapat membaca profil dan booking sendiri serta mengajukan booking
berstatus pending. Admin dapat mengelola ruangan, membaca semua booking dan
mengubah statusnya. Peran akun hanya diubah melalui SQL Editor, bukan dari browser
atau metadata pendaftaran. Aplikasi tidak mendapat izin mengedit log audit.

Database menolak jadwal yang sudah lewat, bentrok, di luar Senin-Jumat pukul
08.00-18.00 WIB, atau tidak sesuai interval 30 menit. Booking harus selesai pada
hari yang sama dan pembatalan wajib memiliki alasan. Slot bersebelahan boleh
dipesan. Semua status selain cancelled tetap memblokir slot, sesuai migrasi lama.

Karena booking pengguna lain bersifat privat, pemeriksaan ketersediaan di frontend
saat ini hanya melihat booking sendiri untuk mahasiswa. Bentrok dengan pengguna
lain tetap ditolak database, tetapi saran slot frontend belum memperhitungkannya.
Menampilkan ketersediaan lintas pengguna tanpa membuka data pribadi memerlukan
fitur terpisah.

Untuk pemeriksaan tambahan, jalankan `schema_smoke_test.sql` di SQL Editor setelah
instalasi, pada proyek pengembangan. Tes memakai transaksi dan diakhiri ROLLBACK
agar data uji tidak tersimpan. Jika gagal, jalankan `ROLLBACK;` sebelum mencoba lagi.

Referensi: [profil otomatis dari Supabase Auth](https://supabase.com/docs/guides/auth/managing-user-data)
dan [aturan akses RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
