# Tes STRIDE database

`npm run ci:stride` menyiapkan 14 skenario RLS, trigger, dan constraint pada
schema reservasi Supabase yang sudah terpasang. Berdasarkan hasil yang dibagikan
pengguna pada 10 November 2026, 14 skenario lolos melalui eksekusi manual ke
project Supabase pengujian terpisah dengan `rollback=confirmed`.
Eksekusi stage database lewat Jenkins belum diuji. Tes lokal runner memakai
client pengganti dan berbeda dari hasil pengujian database tersebut.

## Lingkup

| Kelompok | Yang diperiksa |
|---|---|
| E-01 | Metadata signup tidak memberi admin; student tidak bisa menaikkan role/membuat room; admin tetap dapat mengelola room/booking |
| I-01 | Student hanya melihat profil/booking sendiri; log hanya admin; anon tidak melihat fixture |
| T-01 | Tidak dapat booking sebagai pengguna lain atau menyetujui booking sendiri |
| T-02 | Tolak overlap tersembunyi RLS, jadwal lampau, dan pembatalan tanpa alasan |
| R-01 | Catat actor/waktu/before-after; admin aplikasi tidak dapat mengubah/menghapus log |

Tes SQL memakai role `authenticated/anon` dan klaim user sintetis. Ini menguji
batas akses database, bukan validasi JWT atau signup/email melalui API Supabase.
Spoofing API, rate limit/DoS, konkurensi request, dan seluruh ancaman STRIDE belum
tercakup. Tes SQL signup hanya menguji trigger profil.

## Transaksi dan data yang sudah ada

Runner memakai satu client/koneksi dan satu transaksi. Tiga user, satu room,
dan booking sintetis dibuat dengan UUID baru serta email `example.invalid`.
Operasi penulisan langsung hanya menargetkan ID fixture. Tidak ada DROP,
TRUNCATE, penghapusan data lama, migrasi, perubahan grant/policy, atau COMMIT.

Preflight memeriksa RLS, role tanpa superuser/BYPASSRLS, dan kepemilikan tabel
agar role uji tidak melewati RLS. Setiap skenario memakai savepoint yang selalu
di-rollback, termasuk ketika lolos. Transaksi utama diakhiri ROLLBACK; jika tidak
terkonfirmasi, hasil menjadi error. Timeout statement 10 detik dan lock 3 detik.

Utamakan project development khusus tes. Pada project berisi data pengembangan,
review trigger/hook dahulu: rollback database tidak membatalkan efek eksternal
seperti HTTP webhook/email, dan sequence dapat tetap bertambah. Runner tidak
memanggil API email, tetapi trigger custom layanan harus ditinjau.

## Persiapan koneksi

1. Tentukan project development yang disetujui; jangan gunakan production.
2. Dari Supabase Connect, ambil koneksi PostgreSQL langsung atau session pooler.
   Port transaction pooler 6543 ditolak. Akun setup memerlukan izin INSERT
   fixture auth.users, UPDATE profil fixture menjadi admin, akses fixture,
   dan SET ROLE authenticated/anon. Public anon key tidak cukup untuk setup ini.
3. Siapkan credential privat `STRIDE_DATABASE_URL`, hostname yang sama persis
   pada `STRIDE_DB_HOST`, dan `STRIDE_ALLOW_TEST_WRITES=rollback-only`.
   Host guard mengurangi salah target, bukan pengganti kontrol akses credential.
4. TLS diverifikasi. Bila CA belum dipercaya Node.js, isi `STRIDE_CA_FILE` dengan
   root certificate resmi project. Hapus parameter sslmode/sslcert/sslrootcert/
   options dari URL; jangan menonaktifkan verifikasi TLS.

Jangan kirim password/connection string ke chat, parameter publik Jenkins, repo,
atau frontend. Jangan menjalankan schema instalasi ulang untuk menyiapkan tes.
Kegagalan schema/grant dilaporkan sebagai error, bukan diperbaiki otomatis.

## Validasi lokal tanpa database

```bat
npm.cmd run test:stride-runner
```

Tes ini memeriksa guard, sanitasi laporan, savepoint, rollback, dan penanganan
kegagalan dengan client pengganti. Tidak terhubung ke Supabase. Command runner
tanpa konfigurasi menghasilkan error/not_run; tidak boleh dianggap lolos.

## Menjalankan database setelah disetujui

Salin `supabase/stride.env.example` ke `.env.stride.local`, isi secara lokal,
lalu jalankan dari root:

```bat
node --env-file=.env.stride.local scripts/stride/run.mjs
```

File tersebut diabaikan Git. `.env` frontend tidak otomatis dibaca runner.
Gunakan password yang di-URL-encode jika menyusun connection string sendiri.

Untuk Jenkins, siapkan plugin Credentials Binding dan credential **Secret text**
dengan ID `supabase-stride-database-url`. Jalankan hanya job/branch terpercaya:
credential setup dapat memiliki izin database luas dan tidak boleh diberikan
kepada PR dari kode tak tepercaya. Setelah tes remote disetujui, centang
`RUN_STRIDE_DATABASE` dan isi `STRIDE_DB_HOST`. Default false membuat stage
dilewati, bukan lolos. Menyiapkan modul tidak mengaktifkan stage secara otomatis.
Jika custom CA dibutuhkan, pasang file terpercaya pada agent dan set
STRIDE_CA_FILE pada environment job; jangan menaruh private key di repo.

## Hasil

`reports/stride/` berisi `summary.json`, `summary.txt`, dan `junit.xml`.
Status per skenario: passed, failed, error, atau not_run. Assertion keamanan
memakai SQLSTATE P7501; error koneksi/schema/grant dipisahkan. Laporan tidak
memuat connection string, password, data pengguna, SQL mentah, atau detail error
server. Commit SHA dicatat jika environment GIT_COMMIT tersedia.

Exit modul: 0 semua skenario lolos dan rollback terkonfirmasi; 1 ekspektasi
keamanan gagal; 2 error atau skenario belum dijalankan. Jenkins mengarsipkan
laporan saat stage aktif dan tetap mempertahankan FAILURE untuk gagal/error.
JUnit XML baru disimpan sebagai artifact; publishing UI JUnit belum dikonfigurasi.

Kode konfigurasi utama: APPROVAL_REQUIRED (belum mengizinkan fixture),
DATABASE_URL_REQUIRED/INVALID_DATABASE_URL (koneksi belum valid), HOST_MISMATCH
(target berbeda), POOLER_UNSUPPORTED, dan URL_OPTIONS_FORBIDDEN (opsi SSL URL).
Kode seperti 42501 berarti izin database tidak cukup; detail mentah sengaja
tidak dicetak agar credential/data tidak ikut masuk laporan.

Referensi: [transaksi node-postgres](https://node-postgres.com/features/transactions),
[PostgreSQL SET ROLE](https://www.postgresql.org/docs/current/sql-set-role.html),
[RLS Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security).
