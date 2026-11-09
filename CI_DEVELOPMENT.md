# CI Development

`Jenkinsfile.dev` harus dijalankan pada agent Jenkins Windows karena menggunakan
perintah `bat`. Dukungan untuk sistem operasi selain Windows belum dikembangkan.
Docker dan WSL tidak diperlukan untuk pipeline ini.

## Persiapan

Siapkan Jenkins dengan plugin Pipeline dan Git, Node.js 24 beserta npm, serta
Git for Windows pada komputer agent. Agent memerlukan akses ke GitHub dan
registry npm. Lingkungan yang sudah diuji: Node.js 24.17.0 dan npm 11.13.0.

Cek melalui Command Prompt:

```bat
node --version
npm.cmd --version
git --version
```

Jika semua menampilkan versi, alat sudah tersedia. Jika belum:

- **Node.js dan npm:** gunakan [installer resmi Node.js](https://nodejs.org/en/download),
  pilih versi 24 untuk Windows. Sertakan npm dan opsi penambahan ke PATH.
  [Panduan instalasi](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm/).
- **Git:** gunakan [installer resmi Git for Windows](https://git-scm.com/install/windows)
  dan pilih opsi agar Git dapat digunakan dari command line dan aplikasi lain.

PATH adalah daftar folder tempat sistem mencari program saat perintah dipanggil.
Pastikan folder instalasi dapat diakses oleh akun yang menjalankan Jenkins.
Untuk mengecek lokasinya:

```bat
where.exe node
where.exe npm.cmd
where.exe git
```

Jika program sudah terpasang tetapi belum ditemukan, tambahkan folder instalasinya
ke **Environment Variables → Path**, tanpa menghapus entri yang ada. Buka terminal
baru setelah perubahan; restart service Jenkins/agent bila diperlukan dan tidak
ada build berjalan. Jalankan stage `Cek Lingkungan` untuk memverifikasi akses dari
Jenkins, karena akun service dapat berbeda dari akun terminal pribadi.

## Menjalankan pipeline

1. Pastikan perubahan pipeline dan modul audit sudah di-push ke branch `ilyas`.
2. Pada job Jenkins, pilih **Pipeline script from SCM → Git**.
3. Isi repo `https://github.com/Z0J0-hub/Booking_Ruangan-Lab.git`, branch `*/ilyas`,
   dan **Script Path** `Jenkinsfile.dev`.
4. Pilih **Save → Build Now**, lalu periksa **Console Output** dan **Build Artifacts**.

Alur: checkout → install dependency → tes modul CI → audit → lint/typecheck →
tes backend → build → archive frontend. Checkout hanya sekali melalui
`checkout scm`, mengikuti repo dan revisi dari konfigurasi job. Pembacaan file
pipeline dari SCM bukan checkout workspace tambahan.
`agent any` belum membatasi pemilihan agent; jalankan job pada agent Windows.
Untuk menguji branch lain, ubah Branch Specifier job. Penemuan dan trigger PR
belum tersedia. Checkout bisa berupa detached HEAD; gunakan commit SHA pada
log untuk memastikan revisi yang diperiksa.

## Audit dependency

Pipeline memanggil `npm run ci:audit`. Modul `scripts/ci/audit.mjs` menangani
audit frontend dan backend, penyimpanan laporan, serta keputusan akhir.
Kedua audit tetap dijalankan meskipun salah satunya gagal. Tidak ada perbaikan
dependency otomatis; setiap audit dibatasi 120 detik.

| Status modul | Arti |
|---|---|
| `0` | Tidak ditemukan temuan high/critical pada kedua audit |
| `1` | Minimal satu audit menemukan high/critical |
| `2` | Minimal satu audit mengalami error eksekusi atau respons tidak valid |

Laporan disimpan di `reports/audit/`: `frontend.txt`, `backend.txt`,
`summary.txt`, dan `summary.json`. Jenkins mengarsipkannya meskipun audit gagal.
Folder laporan diabaikan oleh Git.

Kegagalan command audit ditangkap oleh `catchError` dengan hasil stage dan build
tetap `FAILURE`; lint, tes, dan build dapat dilanjutkan untuk mengumpulkan bukti.
Pembatalan manual tidak ditangkap. Kegagalan persiapan, tes modul CI, pengarsipan,
atau tahap lain tetap dapat menghentikan pipeline. Artifact `dist/` bisa tersedia
pada build merah dan bukan bukti bahwa pemeriksaan keamanan lolos.

## Pemeriksaan STRIDE

Lihat [matriks STRIDE](STRIDE_MATRIX.md) untuk ancaman, kontrol yang terlihat,
skenario tes, dan status buktinya. Matriks bukan scanner atau hasil tes otomatis.
Tes keamanan API belum ditambahkan; unit test booking yang ada tidak membuktikan
autentikasi, otorisasi, atau pencatatan aktivitas.

Pengembangan berikutnya dimulai dari token tidak valid dan akses admin, kemudian
kepemilikan booking, pembatasan data respons, serta batas request. Tes API perlu
server dan MySQL khusus pengujian dengan data sintetis. Detail prasyarat ada di
matriks; jangan memakai database kerja atau production.

## Validasi lokal

Jalankan dari root proyek:

```bat
node --test scripts/ci/audit.test.mjs
npm.cmd run ci:audit
```

Perintah pertama menguji logika modul tanpa jaringan; perintah kedua menjalankan
audit asli. Hasil gagal memang diharapkan jika ada temuan high/critical.
Trigger PR, pemeriksaan STRIDE, build image Docker, dan deployment belum tersedia.

Setelah perubahan ini di-push, jalankan ulang Jenkins: pastikan tidak ada stage
`Declarative: Checkout SCM`, hanya satu stage `Checkout`, tes modul CI lolos,
laporan kedua audit diarsipkan, dan tahap sesudah audit berjalan meskipun audit
merah. Selama temuan high masih ada, hasil akhir harus tetap `FAILURE`.

Referensi: [checkout SCM](https://www.jenkins.io/doc/book/pipeline/jenkinsfile/)
dan [catchError](https://www.jenkins.io/doc/pipeline/steps/workflow-basic-steps/).
