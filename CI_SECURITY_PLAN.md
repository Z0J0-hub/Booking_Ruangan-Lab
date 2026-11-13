# Baseline CI dan pengujian keamanan

Proposal tetap menjadi dasar kebutuhan. Perubahan ini menyempurnakan CI, alat
build, dan tes keamanan; tidak mengubah fitur, halaman, auth, atau schema.
Baseline sebelum perubahan: branch `ilyas`, commit `80cfc92`.

Penyesuaian situasional alat build: Vite 5.4.21 diganti 7.3.8 dan plugin React
diganti 5.2.0 untuk mengatasi advisory high pada toolchain lama. Ini perubahan
major alat pengembangan, bukan fitur produk; Node.js 24 tetap dipakai. Build,
lint, typecheck, dan tes harus diperiksa ulang. Dependency runtime dipertahankan.

## Alur dan syarat lulus

`Jenkinsfile.dev` tetap menjadi pipeline aktif Windows/Node.js 24:

1. Periksa agent, checkout revisi SCM, bersihkan laporan hasil run lama.
2. Validasi PR: target development; PR tidak boleh meminta tes DB.
3. npm ci, tes modul CI, scan source dan tes gate Gitleaks nyata.
4. Audit seluruh dependency aktif termasuk dev dependency: high/critical atau error gagal.
5. SAST terpilih: temuan, parsing/config error, atau scan kosong gagal.
6. Lint, typecheck, validasi public config Supabase, tes modul auth.
7. STRIDE database opsional pada development terpercaya, lalu build dan archive.

Gate wajib fail-fast. Laporan tahap yang gagal tetap diarsipkan; tahap yang belum
dijalankan tidak dianggap lolos. dist baru diarsipkan setelah tahap wajib lolos.
Build tanpa tes DB bukan bukti RLS remote sudah lolos. Tidak ada deploy.

## PR menuju development: konfigurasi eksternal

File repo menyiapkan policy/stage; pemicu otomatis memerlukan konfigurasi Jenkins
dan GitHub. Belum ada klaim webhook atau job live sudah aktif.

1. Pasang GitHub Branch Source. Buat Multibranch Pipeline dengan Script Path
   Jenkinsfile.dev dan repository yang sama dengan job lama.
2. Aktifkan discovery PR origin, pilih menguji revisi merge PR dengan target.
   Aktifkan discovery branch development untuk validasi setelah merge. Filter
   nama job saja tidak menjamin target PR; policy menolak target selain development.
   Filter target di Branch Source bila plugin terpasang mendukungnya; jika tidak,
   PR lain akan ditolak oleh policy, bukan dianggap lolos.
3. Aktifkan webhook GitHub ke endpoint /github-webhook/ Jenkins yang dapat dijangkau,
   events push dan pull_request, HTTPS, dan izin integrasi minimum. Jalankan Scan
   Multibranch Pipeline Now.
4. Sediakan CI_SUPABASE_URL dan CI_SUPABASE_PUBLIC_KEY pada environment job/folder
   untuk build PR pertama. Hanya public anon/publishable key. Parameter manual
   SUPABASE_URL/SUPABASE_PUBLIC_KEY tetap tersedia pada job lama.
5. Buka PR ke development; catat status check Jenkins yang benar-benar muncul,
   lalu jadikan required pada branch protection/ruleset development. Jangan menebak
   nama check atau mengklaim protection aktif sebelum diperiksa.
6. Uji perubahan bersih dan kegagalan gate terkontrol pada branch percobaan.
   Simpan nomor build, revisi merge/head yang diuji, log tahap, dan laporan.

PR adalah kode tak terpercaya, termasuk PR repository sendiri. **Guard Jenkinsfile
bukan batas keamanan**, karena PR dapat mengubah Jenkinsfile/script. Jangan
sediakan credential database/deploy/global secret pada job PR. Gunakan folder dan
agent PR terisolasi tanpa secret tersebut, tanpa .env lokal, dan tanpa workspace
job terpercaya. Tinjau trust fork PR; jangan mengeksekusi fork dengan secret sensitif.

Tes DB memakai job development di folder/agent terpercaya terpisah yang hanya
menemukan branch development, dengan Jenkinsfile yang sudah direview. Credential
Secret text supabase-stride-database-url hanya pada folder tersebut. Default
RUN_STRIDE_DATABASE=false; branch development, host tepat, dan persetujuan project
tes tetap wajib. Job classic ilyas tetap dapat menguji source, tetapi tidak DB.

## SAST pada lingkungan sekarang

npm run ci:sast memakai ESLint dan eslint-plugin-security 3.0.1 yang dikunci
lockfile. Ini berjalan native pada Node/Windows yang tersedia tanpa server scanner,
Python, WSL, atau Docker.

Aturan di eslint.security.config.js: dynamic evaluation, Function constructor,
script URL, shell exec dinamis, unsafe regex, bidi characters, buffer lama/tanpa
pemeriksaan, pseudo-random API tertentu, penonaktifan escaping Mustache, dan raw
HTML JSX. Temuan menggagalkan gate; eslint-disable tidak mematikan aturan.
Laporan hanya rule/file/baris, tanpa source mentah.

Lingkup: JS/TS aplikasi, script CI, konfigurasi build, backend legacy. Tidak termasuk
SQL, taint analysis lintas file, semua variasi XSS/command execution, atau seluruh
OWASP Top 10. Heuristik object/path dinamis tidak diaktifkan karena perlu analisis
konteks; bukan bukti akses tersebut aman. Ini penerapan SAST awal rubrik, bukan
pengganti seluruh cakupan Semgrep/SonarQube.

## Proposal, ancaman, dan tes

| Ancaman proposal | Bukti yang disiapkan | Batas/gap |
|---|---|---|
| Spoofing | Tes modul auth dan validator key | JWT palsu/kedaluwarsa dan email melalui API belum diuji live |
| Tampering | Runner T-01/T-02 pemilik/status/jadwal; SAST pola kode tertentu | Konkurensi dan seluruh batas jadwal belum tercakup |
| Repudiation | Runner R-01 actor, before/after, pembatasan perubahan audit | Retensi, log terpusat, dan alert belum diverifikasi |
| Information Disclosure | Gitleaks I-02; public key validator; isolasi I-01 | Riwayat Git/artifact dan semua kebocoran belum tercakup |
| Denial of Service | Gate unsafe regex dan audit membantu risiko kode tertentu | Rate limit layanan, load test terbatas, alert tetap terpisah |
| Elevation of Privilege | Runner E-01 metadata/role/admin; isolasi credential job PR | Signup API dan isolasi Jenkins perlu verifikasi |

Empat belas skenario SQL yang ada dipertahankan. Tes unit runner memakai client
pengganti, bukan bukti remote lolos. Rollback fixture database bukan automated
rollback deployment yang dimaksud rubrik.

## Bukti dan pekerjaan lanjutan

- npm run test:ci: kasus positif/negatif audit, policy PR, SAST, secret wrapper,
  konfigurasi Supabase, dan runner rollback dengan client pengganti.
- npm run test:secret-gate: Gitleaks nyata menerima fixture bersih dan menolak key
  sintetis pada direktori sementara; tidak memerlukan credential nyata.
- reports/sast, reports/secrets, reports/audit, dan reports/stride hanya bila DB
  dijalankan. Hubungkan hasil ke nomor build/commit Jenkins.
- Rubrik meminta tampilan konfigurasi, alur, hasil, serta sebaiknya sebelum/sesudah;
  script tersedia bukan berarti bukti Jenkins lengkap.

Belum termasuk DAST staging, scan image/IaC, deployment, monitoring/alert, SOP
insiden, dan pemutakhiran diagram Threat Dragon. Kebutuhan proposal tetap menjadi
backlog; auto-approval dan pembatalan no-show tidak dihapus.

Referensi: [Jenkins Multibranch](https://www.jenkins.io/doc/book/pipeline/multibranch/),
[GitHub Branch Source](https://plugins.jenkins.io/github-branch-source/),
[ESLint security](https://github.com/eslint-community/eslint-plugin-security).

## Hasil validasi lokal, 12 November 2026

- Instalasi ulang npm ci dari lockfile berhasil pada Node.js 24.
- 30 tes modul CI/runner, 7 tes auth, dan 1 tes Gitleaks nyata lolos.
- Lint, typecheck, public config production, dan build Vite 7.3.8 lolos.
- SAST: 44 file, 0 temuan. Scan Gitleaks source kerja juga lolos.
- Audit setelah pembaruan Vite/plugin React dan patch transitif brace-expansion:
  0 high, 0 critical, 9 moderate, 2 low. Gate high/critical lolos; temuan lain
  tetap tercatat, bukan diabaikan atau dinyatakan tidak ada kerentanan.

Ini hasil lokal, bukan hasil Jenkins. Declarative Pipeline belum divalidasi pada
controller Jenkins, dan pemicu PR/required check belum diaktifkan dari sesi ini.
Tidak menjalankan ulang tes DB remote, tidak mengubah konfigurasi project Supabase.
