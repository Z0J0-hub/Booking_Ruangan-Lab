# PR security CI, bukti fail-fast, dan DAST staging

Lingkungan: Jenkins Windows, Node.js 24, Git, curl.exe, PowerShell, Java 17+.
Docker/WSL tidak diperlukan. Tidak ada deployment produksi dalam alur ini.

## Alur aktif yang ditambahkan

`Jenkinsfile.dev`: gate source -> quality/auth -> build produksi -> **DAST
Staging** -> archive dist. Temuan High atau error DAST menghentikan pipeline;
Medium/Low tetap tercatat. Laporan DAST hanya JSON/teks yang sudah disaring.
Kegagalan download/setup juga gagal, bukan status scan bersih.

`pollSCM('H/5 * * * *')` memeriksa perubahan pada branch/revisi job setiap sekitar
5 menit. Berlaku setelah Jenkinsfile baru pertama kali dijalankan. Untuk PR baru,
tetap diperlukan Multibranch indexing. Jenkins lokal tidak perlu dibuka ke internet:
periodic indexing 15 menit menemukan PR baru dan polling mendeteksi pembaruannya.
Polling dapat menggabungkan beberapa push berdekatan menjadi satu build revisi
terbaru; ini bukan jaminan satu build untuk setiap commit individual.

## Multibranch dan required checks

Template `scripts/jenkins/multibranch.xml` menggunakan GitHub Branch Source:

- Branch `ilyas` dan `development`, PR origin dengan revisi **merge dengan target**.
- Fork PR tidak ditemukan oleh template. Policy source menolak target selain development.
- Script path `Jenkinsfile.dev`; periodic discovery 15 menit.
- Dibuat **disabled** sampai agent PR terisolasi siap. Source PR dapat mengubah
  Jenkinsfile; guard dalam repo bukan batas keamanan.

Sebelum enable: gunakan agent Windows khusus dengan akun OS terbatas, tanpa akses
JENKINS_HOME, `.env` developer, credential database/deploy, atau workspace terpercaya.
Jangan menjalankan PR otomatis pada controller `NT AUTHORITY\SYSTEM` yang sekarang.
Konfigurasikan pembatasan penjadwalan job ke agent itu pada controller; label dalam
Jenkinsfile saja dapat diubah PR. Job trusted database harus terpisah.

Sediakan `CI_SUPABASE_URL` dan `CI_SUPABASE_PUBLIC_KEY` sebagai konfigurasi publik
job/folder/agent, bukan service_role. Untuk publikasi commit status, isi credential
GitHub Jenkins dengan izin minimal repository status dan pembacaan PR. Template
tanpa credential dapat membaca repo publik, tetapi tidak memublikasikan required check.

Setelah PR sungguhan menghasilkan status GitHub, **pemilik/admin repository** perlu
mengaktifkan branch protection/ruleset development: require pull request, require
status checks, pilih nama status yang benar-benar muncul, dan wajibkan branch up to
date bila menggunakan merge revision. Pertahankan review/check yang sudah ada.
Jangan memakai job proof yang sengaja gagal sebagai required check.
Uji merge terblokir saat status gagal/pending dan terbuka setelah status sukses.

Akun connector `ilysTelu` memiliki push, **tanpa admin**, pada repository tim.
Karena itu kode repo ini tidak mengklaim branch protection sudah diaktifkan.

## Autentikasi dan helper Jenkins

Buat API token dari profil Jenkins -> Security -> API Token. Simpan secara lokal
di `.jenkins-auth.local.json`: `url`, `username`, `token`. URL helper dibatasi ke
`http://localhost:8080`. `*.local.json` diabaikan Git; jangan commit atau kirim token
ke chat. API token memakai autentikasi HTTP Basic dan tidak memerlukan CSRF crumb.

```powershell
node scripts/jenkins/control.mjs inspect
node scripts/jenkins/control.mjs validate
node scripts/jenkins/control.mjs create-proof reservasi-security-proof <branch>
node scripts/jenkins/control.mjs start reservasi-security-proof
node scripts/jenkins/control.mjs build-proof reservasi-security-proof sast
node scripts/jenkins/control.mjs verify-proof reservasi-security-proof <build-secret> secret
node scripts/jenkins/control.mjs verify-proof reservasi-security-proof <build-sast> sast
node scripts/jenkins/control.mjs prepare-multibranch reservasi-pr-security <credential-id>
```

Helper membuat job baru, tidak menimpa job yang sudah ada. Untuk job validasi source
terpercaya terpisah: `create-validation <job> <branch>`, lalu `start <job>` untuk
registrasi parameter pertama kali dan `build-validation <job>` untuk menyalin
**hanya konfigurasi publik Supabase** dari build sukses reservasi-pipeline.
RUN_STRIDE_DATABASE selalu false. Build inisialisasi tanpa parameter mungkin gagal
di Supabase Configuration; jangan menyebutnya kegagalan scanner.

`enable-polling reservasi-pipeline` mempertahankan SCM/parameter job lama dan hanya
menambahkan trigger SCM 5 menit untuk branch ilyas. Backup konfigurasi ada dalam
`.jenkins-config-backup.local.json` (diabaikan Git), bukan artifact publik.
`tail`, `evidence`, dan `scan-report` membaca hasil build; `verify-proof` melakukan
verifikasi tambahan sebelum menyebut kegagalan sebagai bukti gate.

## Bukti fail-fast yang benar

`Jenkinsfile.security-proof` adalah job manual terpisah. Pilih `secret` atau `sast`:

1. Checkout source yang direview, npm ci, bersihkan laporan lama.
2. Buat satu fixture sintetis dalam `src/__security_gate_proof__/`.
3. Jalankan Gitleaks/SAST asli; exit 1 harus membuat stage **Enforce Gate** gagal.
4. Stage **Must Be Skipped** harus dilewati, build akhir **FAILURE**.
5. Arsipkan laporan yang disaring; fixture dibersihkan pada post always.

`verify-proof` memeriksa build FAILURE, laporan blocked/exit 1 dengan temuan,
pesan exit code 1, dan pesan stage berikutnya dilewati. Kegagalan npm/download
tidak memenuhi bukti. JSON hasil verifikasi disimpan di `reports/jenkins/`.
Jangan commit fixture. Build normal yang sukses menjadi pembanding setelah fixture
dibersihkan. Proof memakai blok `bat` yang sama dengan gate utama, tanpa catchError.

## DAST staging native Windows

```powershell
npm.cmd run ci:dast:setup
npm.cmd run build
npm.cmd run ci:dast
# Opsional: tinjau frontend secara manual, Ctrl+C untuk berhenti.
npm.cmd run staging
```

Setup mengunduh ZAP **2.17.0 Crossplatform**, memverifikasi SHA-256 rilis resmi,
dan mengekstraknya dalam `.tools/zap/`; tidak mengubah PATH atau memasang service.
Archive cache diverifikasi dan diekstrak ulang tiap setup. Unduhan pertama sekitar
287 MB. `ZAP_ARCHIVE_CACHE` opsional menunjuk arsip lokal yang sudah tersedia;
checksum tetap wajib cocok sebelum disalin/dipakai. Download memakai resume/retry
terbatas untuk gangguan koneksi. Opsi ExecutionPolicy Bypass hanya untuk proses PowerShell tersebut.

Jika perubahan belum di-commit, helper `create-snapshot <job> validation|proof`
dan `update-snapshot` hanya menerima nama job berawalan `reservasi-local-`.
Job checkout parent ilyas, lalu menyalin allowlist source lokal tanpa file credential.
Hash SHA-256 snapshot tercatat pada deskripsi build dan laporan DAST. Ini menguji
source lokal melalui Jenkins, **bukan bukti PR atau commit baru di GitHub**.
Mode snapshot tidak memasang trigger polling. Job validasi pertama bisa langsung
dijalankan dengan `build-validation <job>`; tidak perlu build inisialisasi.

Runner menjalankan `dist` pada loopback dengan port otomatis, memberikan security
headers, dan menolak method tulis, dotfile, traversal, serta symlink keluar dist.
ZAP memakai port proxy loopback sendiri agar tidak bentrok dengan Jenkins 8080.
Automation Framework meminta halaman, health, JS/CSS hasil build, melakukan spider,
menunggu passive scanner, menghasilkan JSON, lalu menerapkan gate High.
Timeout keseluruhan scanner 8 menit; tahap Jenkins 12 menit; staging dihentikan
dan raw report/session dihapus setelah run. Log diagnosis privat terakhir ada di
`.tools/zap/last-run.local.log`, tidak diarsipkan Jenkins.

**Cakupan:** baseline pasif tanpa login pada frontend staging Node. Spider tidak
menjalankan JavaScript atau menavigasi seluruh SPA. Tidak ada active attack,
pengujian login/RLS, ataupun pemindaian API Supabase/layanan eksternal. Headers
server staging ini bukan bukti konfigurasi Nginx/hosting produksi. Baseline ini
adalah penerapan awal DAST, belum pemenuhan seluruh pengujian dinamis aplikasi.

Hasil lokal awal: 0 High, 2 Medium (`style-src unsafe-inline`, SRI resource
eksternal belum ada), 0 Low, 2 Informational. Inline style masih diperlukan komponen
React; hosting font lokal dan pengetatan CSP menjadi tindak lanjut. Tidak ada rule
yang dikecualikan agar laporan terlihat bersih.

## Bukti untuk rubrik

Simpan nomor build, commit, penyebab pemicu otomatis, screenshot konfigurasi job,
Stage View/Console, dan artifact. Baseline Jenkins sebelum DAST:
`reservasi-pipeline #15`, commit `6e64c55`, SUCCESS, 108.815 detik.
Bedakan bukti lokal, hasil Jenkins, dan konfigurasi yang masih menunggu admin.
Screenshot PR gagal/pending yang memblokir merge diperlukan untuk required checks.

Referensi implementasi: [Jenkins Multibranch](https://www.jenkins.io/doc/book/pipeline/multibranch/),
[keamanan kredensial Multibranch](https://www.jenkins.io/doc/book/security/securing-org-folders-and-multibranch-pipelines/),
[ZAP Automation Framework](https://www.zaproxy.org/docs/automate/automation-framework/),
[ZAP exitStatus](https://www.zaproxy.org/docs/desktop/addons/automation-framework/job-exitstatus/),
[rilis dan checksum ZAP 2.17.0](https://github.com/zaproxy/zaproxy/releases/tag/v2.17.0).
