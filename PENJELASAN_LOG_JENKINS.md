# Arti log Jenkins yang diperiksa pada 16 November 2026

Log yang dilampirkan berakhir dengan **Finished: SUCCESS**, yaitu semua tahap yang
wajib dijalankan pada build tersebut selesai dan memenuhi batas pemeriksaan.
Yang dipilih adalah **pemeriksaan aplikasi asli**, bukan pemeriksaan PR dan bukan
percobaan contoh OWASP. Kode yang dipakai berasal dari ilyas versi `cecae640`.

## Ringkasan tahap

| Tulisan di log | Arti sederhana dan hasil pada log ini |
|---|---|
| Started by user | Build dimulai secara manual oleh pengguna. |
| Checkout / Checking out Revision / detached | Jenkins mengambil salinan kode pada nomor versi tertentu, bukan otomatis versi terbaru suatu branch. Tidak mengubah branch GitHub. |
| Cek Lingkungan | Memastikan Node.js, npm, dan Git tersedia di komputer Jenkins. |
| Pipeline Policy passed; database=not run | Aturan pelaksanaan terpenuhi; pengujian database tidak dijalankan. |
| Install Dependencies; added 344 packages | Memasang 344 paket pendukung yang dibutuhkan proyek. Angka ini bukan jumlah masalah. |
| SAST Toolchain | Menyiapkan Semgrep, alat pemeriksa kode. |
| Infrastructure config: passed; checks=62; findings=0 | 62 pemeriksaan konfigurasi Docker/Compose dijalankan; tidak ditemukan masalah dalam cakupan aturan ini. Ini belum membuktikan container berhasil dijalankan. |
| CI Module Tests; tests 45; pass 45; fail 0 | Semua 45 tes perilaku skrip pemeriksaan berhasil. Nama tes adalah skenario yang diuji, bukan daftar masalah yang sedang terjadi pada aplikasi. |
| Secret scan: passed; findings=0 | Tidak ditemukan kunci rahasia oleh pemeriksaan yang digunakan. |
| Dependency Audit; high=0; critical=0; moderate=9; low=2 | Ada 9 temuan tingkat sedang dan 2 tingkat rendah pada paket pendukung. Tidak ada tingkat tinggi/kritis. Build masih lolos karena batas pemblokiran saat ini tinggi/kritis. Temuan sedang/rendah tetap perlu ditinjau. |
| SAST: passed; files=67; findings=0 | 67 file kode diperiksa oleh aturan keamanan kita; tidak ada temuan dari aturan tersebut. Ini bukan jaminan aplikasi bebas semua masalah keamanan. |
| Quality Checks | Pemeriksaan penulisan kode dan kecocokan tipe data selesai tanpa error. |
| Supabase public configuration: valid shape | Format alamat dan kunci publik Supabase sesuai. Ini belum menguji login langsung, isi database, atau aturan hak akses database. |
| Auth Module Tests; pass 7; fail 0 | Tujuh tes modul akun/login berhasil. Tes menggunakan pengganti layanan, bukan bukti login langsung ke Supabase berhasil. |
| Build; built in 2.32s | Kode berhasil diubah menjadi berkas aplikasi siap disajikan pada folder dist. Ini belum berarti aplikasi sudah dipublikasikan. |
| DAST: passed; Staging stopped | Pemeriksaan keamanan dasar pada aplikasi yang dijalankan sementara di komputer lokal memenuhi batasnya, lalu layanan pengujian dihentikan. Passed tidak berarti tidak ada temuan tingkat lebih rendah; rincian ada di reports/dast. |
| Operations drill: passed | Latihan logging, pemantauan dan pemulihan lokal memenuhi pemeriksaannya. Bukan pengukuran sistem produksi. |
| Archive Build / Archiving artifacts | Menyimpan hasil build dan laporan agar dapat diunduh dari halaman build Jenkins. |
| Finished: SUCCESS | Build selesai dan seluruh pemeriksaan wajib memenuhi batas yang ditetapkan. |

## Kenapa ada bagian skipped?

**Skipped due to when conditional** berarti bagian tersebut sengaja dilewati
karena tidak sesuai pilihan build, bukan karena error. Pada log ini:

- Pencarian PR dilewati: kamu memilih pemeriksaan aplikasi.
- Persiapan contoh OWASP dilewati: kode aplikasi diperiksa tanpa tambahan contoh.
- STRIDE Database dilewati: pengujian database tidak diminta/diaktifkan.

Pada bagian tes, kata seperti "rejects", "failed", dan "error" sering muncul
dalam **nama skenario tes**. Misalnya, tes "scanner errors ... cannot become a clean
scan" memeriksa bahwa alat yang error tidak boleh menghasilkan laporan lolos.
Jika tes itu bertanda berhasil dan `fail 0`, perilaku penolakan tersebut bekerja.

## Pesan peringatan yang terlihat

- **Selected Git installation does not exist. Using Default**: nama instalasi Git
  yang dipilih belum cocok dengan pengaturan Jenkins. Jenkins berhasil menggunakan
  Git bawaan/default yang tersedia; terlihat versi Git dan pengambilan kode berhasil.
- **The recommended git tool is: NONE**: tidak ada nama alat Git rekomendasi yang
  dipilih. Bukan berarti Git tidak terpasang.
- **No credentials specified**: Jenkins mengambil repo tanpa akun/token khusus.
  Pengambilan pada log ini berhasil; ini bukan pesan password salah.
- **npm warn deprecated glob@10.5.0**: ada paket pendukung versi lama yang diberi
  peringatan oleh pengelolanya. Ini bukan kegagalan instalasi, tetapi perlu ditinjau
  bersama hasil audit paket. Tidak diperbaiki hanya dengan menerjemahkan log ini.
- Simbol seperti **âœ”**: tanda centang/informasi tampil rusak karena perbedaan
  pembacaan karakter teks. Bukan hasil tes gagal.
- **Timeout set to expire in 30 min**: batas waktu maksimal, bukan lama build aktual.

## Melihat laporan tanpa membaca seluruh log

Buka nomor build pada reservasi-pipeline, lalu **Artifacts**:

- `reports/sast/summary.html`: hasil pemeriksaan kode.
- `reports/audit/frontend.txt`: rincian temuan paket pendukung.
- `reports/dast/summary.txt`: hasil pemeriksaan aplikasi yang dijalankan lokal.
- `reports/infra/summary.json`: hasil konfigurasi container.

Form dan aturan PR terbaru dijelaskan di [PR_OWASP_2025.md](PR_OWASP_2025.md).
Log ini memakai aturan PR lama; versi baru menerima branch asal mana pun dalam
repo tim, dengan tujuan tetap development.

Pilihan pemeriksaan aplikasi juga sudah diperbarui menjadi **Periksa kode branch
ilyas terbaru**. Log contoh di atas tetap merupakan catatan build lama. Build branch
baru mengambil source terbaru dari GitHub; nomor versinya terlihat di keterangan
build dan `reports/source/summary.txt`, bukan ditentukan oleh pin pipeline.
