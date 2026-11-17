# Jenkins: hanya PR menuju development

Job aktif: http://localhost:8080/job/reservasi-pipeline/ dengan Jenkinsfile.dev.
Tidak ada pilihan build branch, contoh OWASP, DAST, deployment atau latihan operasi
pada job ini. File panduan/bukti lama tetap merupakan riwayat, bukan alur aktif.

## Cara menjalankan

Pilih **Build with Parameters**, isi **NOMOR_PR** dengan nomor PR terbuka yang
tujuannya development, lalu Build. Branch asal boleh branch mana pun dalam repo
tim yang sama. Jika nomor kosong Jenkins mencari otomatis. PERIKSA_ULANG_PR
memaksa pemeriksaan manual ulang. Biarkan pengaturan publik Supabase tersimpan.

Jadwal sekitar 5 menit memeriksa PR baru/berubah selama laptop dan Jenkins menyala.
Jika tidak ada PR baru, proses selesai dengan NOT_BUILT setelah pencarian; tidak
membuat tahap pemeriksaan kosong. Tidak ada webhook atau layanan 24 jam.

## Tahap yang benar-benar dijalankan

| Tahap | Yang dilakukan |
|---|---|
| Ambil kode PR | Membaca gabungan PR dengan development dari Git, memeriksa head/base merge sesuai API dan menyalin file sebenarnya tanpa menjalankan Jenkinsfile atau hook PR. |
| Infrastructure Configuration | Trivy membaca Dockerfile PR; aturan proyek membaca Compose dan dockerignore PR. Memeriksa non-root, filesystem read-only, pembatasan privilege, port localhost, jaringan, resource, dan log. Ini pemeriksaan konfigurasi, bukan menjalankan/memindai image container. |
| Dependency Audit | npm audit membaca package.json/package-lock.json PR, termasuk paket development. Tidak memasang paket atau menjalankan skrip lifecycle PR. Tinggi/kritis memblokir; sedang/rendah dilaporkan. Error dan lockfile tidak cocok gagal. |
| SAST OWASP Top 10 | Semgrep dan ESLint memeriksa kode PR sebenarnya. Aturan dipetakan ke OWASP Top 10:2025; semua kategori masih cakupan sebagian. Tidak menyisipkan contoh kerentanan. Nol temuan bukan jaminan aplikasi bebas semua risiko. |
| Build development | Membuat dist frontend dari salinan PR dengan mode development dan tool/dependency yang telah direview. Tidak mempublikasikan aplikasi, menjalankan server produksi, atau melakukan deployment. |
| STRIDE Database | Penguji SQL terpercaya memeriksa RLS, role, trigger/constraint dan bukti audit pada database development yang disetujui. Memakai data uji sementara di transaksi dan selalu rollback. Tidak mengeksekusi SQL/migrasi dari PR. |
| Simpan hasil PR | Memastikan seluruh tahap wajib lolos dan PR belum berubah, lalu mencatat satu hasil akhir. |

Kesalahan pada tahap mana pun menghentikan proses. Laporan dan cleanup tetap
dijalankan. Tahap berikutnya tidak dieksekusi. Ini berbeda dari kondisi lama yang
mematikan tahap berdasarkan mode pilihan. Build tidak boleh hijau jika tahap
wajib belum selesai. Database yang tidak tersedia juga menghasilkan gagal.

## Batas build pada laptop sekarang

Jenkins masih memakai akun SYSTEM. Karena belum ada agent terpisah, build hanya
diizinkan jika file src/public, konfigurasi build, manifest dan lockfile PR sama
persis dengan baseline pipeline yang telah direview. Build memakai kode PR,
bukan mengganti kode PR dengan salinan baseline. Kode/config/dependency yang belum
direview menghasilkan BUILD_SOURCE_REVIEW_REQUIRED, bukan dilewati atau dianggap
lolos. Untuk perubahan aplikasi baru, admin harus mereview dan memperbarui pin
pipeline terlebih dahulu. Build otomatis seluruh kode anggota tanpa batas ini
memerlukan agent yang terpisah dengan hak terbatas.

Password database disimpan di Jenkins Credentials, hanya diberikan pada penguji
STRIDE terpercaya. Password tidak diberikan ke proses build, tidak ditampilkan
di form, dan tidak disimpan ke Git/artifact. CA publik berada pada
security/certificates/prod-ca-2021.crt; verifikasi TLS tetap aktif.

Tes database membuktikan perilaku skema development yang sudah terpasang, bukan
membuktikan migrasi SQL baru pada PR benar. Migrasi tidak diterapkan otomatis.

## Tempat memeriksa hasil

**Console Output** pada tahap Dependency Audit dan SAST sekarang menampilkan
ringkasan bahasa Indonesia: sumber PR/versi merge, cakupan yang diperiksa, jumlah
paket/file, jumlah temuan, batas pemblokiran, serta alasan lolos/ditolak/error.
Audit menampilkan paket dan tingkat masalah; SAST menampilkan pola setiap kategori
OWASP dan lokasi file/baris jika ditemukan masalah. Ringkasan membatasi daftar
temuan pertama agar log tetap terbaca; laporan lengkap tetap tersedia.

Ringkasan yang sama disimpan sebagai `reports/audit/ringkasan.txt` dan
`reports/sast/ringkasan.txt`. Tidak mencetak cuplikan kode, kecocokan rahasia,
credential, atau output mentah scanner. Entri paket pada lockfile mencakup paket
opsional/tidak langsung dan bukan jumlah paket yang dipasang.

Pada nomor build, buka **Artifacts**:

- reports/pr/summary.json: nomor PR, branch asal/tujuan, head/base/merge, versi alat,
  serta status setiap tahap wajib.
- reports/infra/summary.json: temuan konfigurasi container.
- reports/audit/summary.html: laporan paket dalam bahasa Indonesia.
- reports/sast/summary.html: laporan kode dan pemetaan OWASP.
- reports/build/summary.txt dan dist: hasil build development PR.
- reports/stride/summary.txt dan junit.xml: setiap tes SQL dan konfirmasi rollback.

Jenkins menghentikan proses jika gagal. GitHub required checks/branch protection
belum diaktifkan, sehingga hasil Jenkins belum mengunci tombol merge GitHub.
