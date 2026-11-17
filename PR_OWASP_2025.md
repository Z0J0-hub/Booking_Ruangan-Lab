# Pemeriksaan PR development dan OWASP Top 10:2025

## Tempat memeriksa

Semua tetap dalam [reservasi-pipeline](http://localhost:8080/job/reservasi-pipeline/).
Sumber PR yang diterima: **branch mana pun -> development**, repository tim yang sama.
Contoh: `ilyas`, `fitur/login`, atau `perbaikan-booking` -> `development`.
PR ke main dan PR dari fork/repo lain tidak dipindai oleh konfigurasi ini.

Jenkins memeriksa GitHub setiap sekitar 5 menit, tanpa public tunnel/webhook.
PR baru, perubahan head, perubahan base development, atau pembaruan scanner yang
disetujui menghasilkan scan baru. PR yang tidak berubah tidak diulang; build
polling tersebut menjadi NOT_BUILT (abu-abu), bukan hasil scan sukses baru.
Error API, scanner, konflik merge, atau laporan tidak valid tetap gagal; error
boleh dicoba ulang pada polling berikutnya. Keadaan terminal passed/blocked disimpan
di .runtime/pr/completed.json berdasarkan head + base + revisi scanner.

Pada build PR, periksa:

1. Description: nomor PR dan head commit.
2. **Cari PR menuju development**: pemilihan PR yang masih terbuka dari branch mana pun dalam repo.
3. **SAST dan Audit Dependency PR**: pemeriksaan kode dengan Semgrep/ESLint dan pemeriksaan paket frontend dengan npm audit.
4. **Artifacts**: reports/pr/plan.json dan summary.json menyebut nomor PR,
   head/base, merge commit yang diuji, dan revisi scanner.
5. **Artifacts/reports/sast/summary.html**: laporan yang bisa dibaca;
   coverage.json memetakan kategori/rule, findings.json memuat file/baris/CWE.
6. **Artifacts/reports/audit/summary.html**: daftar paket bermasalah beserta
   tingkatnya. summary.json mencatat nomor PR, head/base/merge yang diaudit dan
   jumlah temuan tinggi/kritis/sedang/rendah. summary.txt dan frontend.txt juga tersedia.

PR lolos hanya jika **SAST dan audit dependency keduanya lolos**. Audit memblokir
temuan HIGH/CRITICAL; temuan sedang/rendah tetap dicatat. Error jaringan, lockfile
hilang/rusak, ketidaksesuaian package.json dan lockfile, atau laporan npm tidak valid
menghasilkan error, bukan hasil lolos. Error dapat dicoba ulang oleh jadwal berikutnya.

Hasil hanya tersedia di Jenkins. Runner publik ini belum mengirim status/check
ke GitHub dan belum menetapkan required checks/branch protection. Itu memerlukan
integrasi credential/izin repository tersendiri. Membuka PR bukan berarti merge
otomatis diblokir oleh GitHub. PR tidak di-merge oleh proses ini.

## Pemakaian manual

Di **Build with Parameters**, cukup isi **PILIH_PEMERIKSAAN**:

| Pilihan | Kode yang diperiksa | Cara membaca hasil |
|---|---|---|
| Periksa PR menuju development | Gabungan kode branch asal PR dan development; SAST serta audit dependency frontend | Hijau = SAST lolos dan tidak ada temuan paket tingkat tinggi/kritis. Merah = ada masalah yang memblokir atau pemeriksaan error. |
| Periksa kode branch ilyas terbaru | Versi terbaru yang sudah di-push ke branch ilyas, diambil saat tahap pengambilan kode | Tidak ditambahkan contoh kode bermasalah. Tetap menjalankan pemeriksaan lain, build, DAST lokal dan latihan pemulihan. |
| Coba alat pendeteksi: contoh masalah OWASP | Hanya satu file contoh sementara, bukan kode aplikasi | Hijau = semua 15 pola contoh dari 10 kelompok masalah terdeteksi dan ditolak. Merah = alat error atau ada contoh yang belum terdeteksi. |

Untuk PR, isi **NOMOR_PR** atau kosongkan agar Jenkins mencari PR terbuka
menuju `development` dari branch mana pun dalam repo tim. **PERIKSA_ULANG_PR** memaksa pemeriksaan manual ulang;
jadwal otomatis tetap hanya memeriksa perubahan baru. Bila ada beberapa PR, Jenkins
memeriksa satu PR yang belum diperiksa per jadwal; PR lainnya menyusul pada jadwal
berikutnya. Daftar PR dibaca per halaman agar tidak terbatas pada 100 PR pertama.
Nama branch asal dicatat sesuai PR sebenarnya pada keterangan build dan laporan.
Jika tidak ada PR terbuka,
hasil abu-abu berarti tidak ada kode PR yang diperiksa, bukan pemeriksaan lolos.

Untuk pilihan aplikasi dan percobaan, abaikan dua kolom PR. Biarkan pengaturan
Supabase tersimpan. Pilihan database tidak ditampilkan karena job ini tidak
mendukung tes database yang memerlukan identitas branch development terpercaya.

Pilihan **Periksa kode branch ilyas terbaru** mengambil ujung branch ilyas dari
GitHub pada setiap build, terpisah dari pin pengaturan pipeline. Tidak memerlukan
PR terbuka. Perubahan lokal yang belum di-push tidak ikut. Jika ada push baru
setelah tahap pengambilan kode, perubahan itu ikut build berikutnya.

Lihat tahap **Ambil kode branch ilyas terbaru**, keterangan build, atau
**Artifacts -> reports/source/summary.txt** untuk nomor versi kode yang diperiksa.
`summary.json` di folder yang sama mencatat `branch`, `commit` kode aplikasi,
dan `pipelineCommit` (versi pengaturan pipeline). Kegagalan mengambil branch
menghentikan build, bukan memeriksa salinan lama lalu menyebutnya terbaru.

Mode ini menjalankan dependency, skrip pemeriksaan, tes dan build dari branch
ilyas yang dipilih sebagai branch terpercaya. Karena itu perubahan skrip/rules
di branch tersebut juga berlaku pada build branch berikutnya. Mode PR tetap
membaca source sebagai data dan tidak mengeksekusi skrip dari PR.
Branch development/main belum menjadi pilihan pemeriksaan branch.

Pada percobaan, laporan `reports/sast/summary.html` menjelaskan hasil dalam
bahasa Indonesia; `hasil-percobaan.json` mencatat apakah semua contoh terdeteksi.
Laporan teknis `summary.json` tetap menyebut `blocked` jika contoh berhasil
ditolak. Build hijau berarti **tes alat berhasil**, bukan aplikasi bebas masalah.
File contoh tidak dijalankan atau dibangun menjadi aplikasi, lalu dibersihkan.

Nama lama `RUN_MODE=full` dan `PROOF_GATE` tidak lagi ditampilkan di form.
Build lama #33 tetap merah karena saat itu penolakan contoh sengaja diteruskan
sebagai kegagalan build; percobaan baru menilai hasil penolakan tersebut.

Mode PR hanya menguji source merge dengan scanner terpercaya. Tidak menjalankan
package.json scripts, npm install, Jenkinsfile, auth/database, build, atau DAST
dari PR. Install/test yang terlihat di build PR adalah milik toolchain yang disetujui.
Mode PR tidak boleh diklaim sebagai seluruh CI aplikasi/tes integrasi PR.

Audit PR menggunakan package.json/package-lock.json pada merge yang sama dengan
SAST. Keduanya disalin ke folder sementara khusus audit. Skrip lifecycle dibuang
dari manifest audit, ignore-scripts diaktifkan, dan npm audit berjalan dengan
package-lock-only tanpa npm install/ci. File .npmrc dari PR tidak digunakan;
registry dikunci ke registry.npmjs.org, konfigurasi pengguna/global kosong, dan
credential Jenkins tidak diteruskan. Paket devDependencies ikut diperiksa.
Hanya ringkasan dan detail advisory yang telah dipilih yang menjadi artifacts;
output mentah proses tidak diteruskan. Folder sementara dibersihkan.

Untuk konfigurasi proyek saat ini, audit PR mendukung npm lockfile versi 2/3 dan
paket registry npm publik. Dependency lokal/git, workspace, overrides, atau registry
lain ditolak sebagai konfigurasi belum didukung, bukan dilewatkan lalu dianggap lolos.
Audit ini belum memeriksa backend MySQL yang sudah tidak aktif, lisensi, malware
paket, atau keaslian seluruh rantai pasok.

## Mengapa konfigurasi Jenkins dipin ke commit

Controller Windows masih memakai SYSTEM. Menjalankan Jenkinsfile/npm scripts dari
PR pada controller itu dapat memberi PR akses ke mesin dan credential Jenkins.
Karena itu job mengambil **Jenkinsfile.dev dan toolchain dari commit ilyas yang
direview dan dipin oleh admin**, lalu mengambil JS/TS PR dari objek Git sebagai data.
Lightweight checkout dimatikan untuk pin SHA karena GitSCMFileSystem dapat
memperlakukan SHA sebagai nama branch. Full checkout tetap memakai commit tepat.
Hasil checkout diteruskan eksplisit sebagai GIT_COMMIT untuk identitas scanner.
Cache node_modules, tools, runtime, reports, dan dist dikecualikan dari pemilihan
source; workspace lama tidak menyebabkan dependency dianggap kode aplikasi.

Git hooks dimatikan; tidak ada checkout/smudge filter PR. Symlink, submodule source,
traversal, nama Windows berbahaya, collision huruf besar/kecil, dan source berlebih
ditolak. Source dibatasi 1000 file, 2 MB/file, total 20 MB. Parent merge harus cocok
dengan head dan base API, dan keduanya diperiksa ulang setelah scan. Laporan tidak
menyimpan source mentah, query, atau credential.

Pin ini membatasi eksekusi source PR; bukan isolasi OS/container atau jaminan parser
tidak memiliki kerentanan. Agent dengan hak terbatas masih menjadi peningkatan berikutnya.

Setelah mengubah toolchain/Jenkinsfile/rules dan menyelesaikan review + commit/push,
admin memperbarui pin secara eksplisit dari workspace bersih:

```powershell
node scripts/jenkins/control.mjs activate-pr reservasi-pipeline <SHA-commit-disetujui>
node scripts/jenkins/control.mjs update-build-form reservasi-pipeline
node scripts/jenkins/control.mjs build-validation reservasi-pipeline
```

Perubahan aplikasi biasa dalam PR otomatis dipindai tanpa mengganti pin scanner.
Mode PR dan percobaan memakai alat pada pin tersebut; mode branch mengambil
source terbaru ilyas setelah memuat definisi pipeline dari pin. Perubahan aplikasi
biasa pada ilyas tidak memerlukan pembaruan pin. Pembaruan Jenkinsfile.dev sendiri
memerlukan langkah aktivasi di atas agar definisi pipeline yang dijalankan ikut berubah.
Tidak ada branch baru; pin merujuk commit yang berasal dari ilyas.

## Cakupan OWASP terbaru

Acuan adalah [OWASP Top 10:2025](https://top10.owasp.org/2025/). Rules proyek ada
di security/semgrep/owasp-2025.yaml; dependency Semgrep dikunci beserta hash pada
scripts/sast/requirements.lock. Tidak mengambil rule registry yang berubah setiap run.

| Kategori 2025 | Contoh pemeriksaan terpilih | Batas penting |
|---|---|---|
| A01 Broken Access Control | Pemakaian Auth admin API pada source browser | Tidak membuktikan policy RLS/otorisasi server benar |
| A02 Security Misconfiguration | CORS merefleksikan origin bebas sambil mengizinkan credentials (CWE-942) | Tidak mencakup seluruh konfigurasi cloud |
| A03 Software Supply Chain Failures | Pemakaian API Buffer constructor yang obsolete (CWE-477) | Bukan pengganti audit dependency, provenance, signing |
| A04 Cryptographic Failures | MD5/SHA1 melalui createHash | Konteks penggunaan perlu review; bukan audit kriptografi penuh |
| A05 Injection | eval, request -> shell (taint intrafile), innerHTML dinamis | Tidak semua SQL/XSS atau alur lintas file |
| A06 Insecure Design | Keputusan privileged dari body/user_metadata role | Desain bisnis tetap perlu threat modeling/manual review |
| A07 Authentication Failures | decode JWT tanpa langkah verifikasi, expiration bypass, TLS verification dinonaktifkan | Tidak membuktikan login/session Supabase aman |
| A08 Software or Data Integrity Failures | Request -> unserialize atau module dari input tidak terpercaya | Bukan audit update pipeline/integritas seluruh data |
| A09 Security Logging and Alerting Failures | Logging password/token/header autentikasi | Tidak membuktikan log/alert wajib sudah lengkap |
| A10 Mishandling of Exceptional Conditions | Catch kosong dan fail-open return true | Tidak semua resource exhaustion/error handling |

**Semua kategori berstatus cakupan parsial.** 15 aturan mewakili pola konkret,
bukan sertifikasi atau deteksi penuh Top 10. Temuan adalah pola yang memerlukan
review; false positive perlu diperiksa dalam konteks, bukan dibypass diam-diam.
Rule ambigu seperti MD5 untuk cache nonkeamanan bisa memerlukan penyesuaian yang
direview. Jangan menonaktifkan gate hanya agar build hijau.

Tes nyata menjalankan Semgrep pada fixture positif untuk ke-15 aturan, memeriksa
10 kategori muncul, lalu menjalankan kontrol negatif yang harus lolos. File fixture
ada di security/semgrep/fixtures/ dan tidak dieksekusi/dideploy. ESLint tetap
dipertahankan sebagai pemeriksaan pelengkap. Hasil nol temuan berarti aturan
terpilih tidak menemukan masalah, bukan bukti aplikasi bebas risiko OWASP.
