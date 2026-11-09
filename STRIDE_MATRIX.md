# Matriks pemeriksaan STRIDE

Lingkup: frontend React, backend Express, dan MySQL untuk reservasi ruangan.
Peran saat ini adalah `user` dan `admin`; mahasiswa/pegawai adalah jenis anggota.
STRIDE mengelompokkan ancaman untuk menentukan pemeriksaan, bukan satu scanner
yang membuktikan seluruh aplikasi aman. [Referensi Microsoft](https://learn.microsoft.com/en-us/azure/security/develop/threat-modeling-tool-threats).

## Status bukti

- **Review kode, belum diuji:** kontrol terlihat pada source; belum ada bukti tes API.
- **Gap:** kontrol yang diperlukan belum ditemukan pada source/schema yang direview.
- **Lolos/Gagal:** hanya digunakan setelah skenario dijalankan dan laporannya ada.
- **Error:** pemeriksaan tidak dapat dijalankan; bukan hasil lolos.

Semua skenario API di bawah masih rencana. Tidak ada kategori STRIDE yang sudah
dinyatakan lolos. Laporan audit dependency terpisah dari bukti perilaku API.

## Ancaman, kontrol, dan skenario

| ID | Kategori dan ancaman | Kontrol yang terlihat | Skenario dan bukti yang diharapkan | Status saat ini |
|---|---|---|---|---|
| S-01 | Spoofing: mengakses API dengan identitas palsu | `authenticate` memverifikasi JWT dan pengguna database | `/api/auth/me` menolak token kosong, salah signature, kedaluwarsa, atau pengguna yang tidak ada dengan 401; token valid diterima | Review kode, belum diuji |
| S-02 | Spoofing: memakai token pemulihan atau sesi logout sebagai sesi aktif | Token reset memakai `purpose`; token logout dicatat di `revoked_tokens` | Token reset tidak dapat membaca rooms/bookings atau melakukan check-in; token logout ditolak pada akses berikutnya | Review kode, belum diuji pada semua route |
| T-01 | Tampering: user A mengubah atau check-in booking user B | PATCH booking memakai `requireAdmin`; check-in memeriksa pemilik/admin dan token QR | A melakukan PATCH/check-in pada booking B: 403, termasuk saat mengetahui token QR; bandingkan database sebelum/sesudah agar tidak ada perubahan | Review kode, belum diuji |
| T-02 | Tampering: input atau booking tumpang tindih | Validasi jadwal, query parameter, transaksi, dan kunci room | Jadwal tidak valid ditolak 400; dua request bersamaan ke slot sama menghasilkan satu booking dan satu konflik 409; periksa jumlah row | Review kode; unit test jadwal ada, konkurensi API belum diuji |
| R-01 | Repudiation: tidak dapat menelusuri perubahan booking | `created_at`/`updated_at` ada, tetapi bukan audit trail lengkap | Buat/ubah/batalkan booking: tersedia catatan actor, action, booking ID, waktu, dan perubahan; user biasa tidak bisa mengubah catatan | Gap: audit event booking dan penyimpanan audit trail belum ditemukan |
| I-01 | Information Disclosure: respons membocorkan credential atau data booking orang lain | `sanitizeUser`, pilihan kolom user, filter booking milik user, proyeksi jadwal aktif | Login/me tidak mengembalikan password hash; daftar booking A tidak memuat detail privat B; `status=active` hanya memuat field jadwal publik dan tanpa token QR | Review kode, belum diuji; jadwal aktif lintas-user memang disediakan |
| I-02 | Information Disclosure: secret atau error internal terekspos | JWT secret berasal dari environment, sebagian error respons generik; JWT frontend di localStorage | Scan secret pada file terlacak; picu error API dan periksa tidak ada stack, SQL, atau credential pada respons; review akses token browser terpisah | Belum ada scanner/tes; token localStorage bukan HttpOnly cookie |
| D-01 | Denial of Service: request berlebihan/payload besar | Rate limit `/api` dan batas JSON 32 KB | Pada instance uji, request melebihi batas menerima 429; JSON lebih besar dari 32 KB ditolak 413 dan tidak mencapai operasi database | Review kode, belum diuji; handler error global mengirim 500 sehingga status payload perlu dibuktikan |
| E-01 | Elevation of Privilege: user biasa melakukan operasi admin | `requireAdmin`; role dibaca dari database; registrasi menetapkan role `user` | User melakukan POST/PUT rooms dan PATCH booking: 403 tanpa perubahan; admin berhasil dengan data valid; registrasi dengan `role=admin` tetap membuat user biasa | Review kode, belum diuji |

Lokasi bukti source: [backend/server.mjs](backend/server.mjs),
[backend/schema.sql](backend/schema.sql), [frontend API client](src/lib/api.ts),
dan [unit test booking](backend/test/booking-policy.test.mjs).
Penilaian ini bukan audit keamanan lengkap dan bukan klaim eksploitasi.

## Lingkungan untuk tes API berikutnya

Gunakan backend lokal yang hanya dapat diakses lingkungan uji dan database MySQL
khusus CI. Siapkan admin, user A, user B, room, dan booking sintetis. Kredensial
diatur melalui environment/kredensial Jenkins; jangan ditulis ke repo atau laporan.
Token palsu dan token kedaluwarsa dibuat dari fixture uji yang terkontrol.

Setiap run perlu data terisolasi, pemeriksaan readiness, batas waktu, dan cleanup
yang hanya menyentuh database uji. Backend saat ini menyiapkan tabel dan job
pembatalan otomatis saat startup; jangan arahkan tes ke database yang berisi data
nyata. Tes rate limit dijalankan pada instance terpisah dengan batas kecil agar
tidak mengganggu skenario lain; ini bukan stress test atau pembuktian tahan DDoS.

## Urutan implementasi dan keputusan

1. Tambahkan runner tes API sebagai deep module dengan satu perintah npm;
   tahap Jenkins hanya memanggil perintah dan mengarsipkan hasil.
2. Implementasikan S-01 dan E-01 terlebih dahulu, lalu S-02, T-01, dan I-01.
3. Tambahkan D-01 serta tes konkurensi T-02 pada instance/data terisolasi.
4. Tambahkan scanner kode/secret dengan versi dan aturan yang ditetapkan.
   Scanner mendukung review, tetapi tidak menggantikan tes perilaku pada matriks.
5. R-01 memerlukan pekerjaan aplikasi tersendiri jika kontrol memang belum ada.
   Jangan membuat tes selalu lolos atau memberi label aman saat kontrol belum tersedia.

Kontrol aplikasi tidak perlu diperbaiki sebelum mulai menulis tes. Jika perilaku
tidak memenuhi ekspektasi aman, simpan hasil gagal dan buat pekerjaan perbaikan.
Jika tes belum bisa dijalankan, laporkan belum diuji/error, bukan lolos. Setelah
perbaikan aplikasi, jalankan ulang skenario yang sama untuk membuktikan hasilnya.
Audit dependency dan tes keamanan yang gagal tetap harus membuat hasil akhir CI
gagal, walaupun pemeriksaan lain dilanjutkan untuk mengumpulkan laporan.

Laporan berikutnya minimal mencatat ID skenario, commit SHA, hasil, dan bukti
yang sudah disaring dari credential/token. Keberadaan matriks ini belum
menambahkan pemeriksaan keamanan otomatis ke Jenkins.
