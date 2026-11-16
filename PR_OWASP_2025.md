# Pemeriksaan PR development dan OWASP Top 10:2025

## Tempat memeriksa

Semua tetap dalam [reservasi-pipeline](http://localhost:8080/job/reservasi-pipeline/).
Sumber PR yang diterima: **ilyas -> development**, repository tim yang sama.
PR ke main, branch sumber lain, dan fork tidak dipindai otomatis oleh konfigurasi ini.

Jenkins memeriksa GitHub setiap sekitar 5 menit, tanpa public tunnel/webhook.
PR baru, perubahan head, perubahan base development, atau pembaruan scanner yang
disetujui menghasilkan scan baru. PR yang tidak berubah tidak diulang; build
polling tersebut menjadi NOT_BUILT (abu-abu), bukan hasil scan sukses baru.
Error API, scanner, konflik merge, atau laporan tidak valid tetap gagal; error
boleh dicoba ulang pada polling berikutnya. Keadaan terminal passed/blocked disimpan
di .runtime/pr/completed.json berdasarkan head + base + revisi scanner.

Pada build PR, periksa:

1. Description: nomor PR dan head commit.
2. **Discover Development PR**: pemilihan PR eligible.
3. **SAST**: Semgrep CE 1.185.0 dan ESLint security.
4. **Artifacts**: reports/pr/plan.json dan summary.json menyebut nomor PR,
   head/base, merge commit yang diuji, dan revisi scanner.
5. **Artifacts/reports/sast/summary.html**: laporan yang bisa dibaca;
   coverage.json memetakan kategori/rule, findings.json memuat file/baris/CWE.

Hasil hanya tersedia di Jenkins. Runner publik ini belum mengirim status/check
ke GitHub dan belum menetapkan required checks/branch protection. Itu memerlukan
integrasi credential/izin repository tersendiri. Membuka PR bukan berarti merge
otomatis diblokir oleh GitHub. PR tidak di-merge oleh proses ini.

## Pemakaian manual

Build with Parameters:

- **RUN_MODE=pr**: cari PR eligible; PR_NUMBER opsional untuk nomor tertentu.
  PR_FORCE_RESCAN=true memaksa ulang. PROOF_GATE=none, database=false.
- **RUN_MODE=full**, PROOF_GATE=none: CI lengkap untuk revisi source/toolchain
  yang telah disetujui (scan infra, SCA/secrets, build, DAST, dan operasi).
- **RUN_MODE=full**, PROOF_GATE=owasp: fixture sintetis memicu pemeriksaan
  representatif seluruh 10 kategori; build FAILURE memang diharapkan di SAST.
  Lihat coverage.json: tiap kategori memiliki findings > 0. Fixture dibersihkan.

Mode PR hanya menguji source merge dengan scanner terpercaya. Tidak menjalankan
package.json scripts, npm install, Jenkinsfile, auth/database, build, atau DAST
dari PR. Install/test yang terlihat di build PR adalah milik toolchain yang disetujui.
Mode PR tidak boleh diklaim sebagai seluruh CI aplikasi/tes integrasi PR.

## Mengapa konfigurasi Jenkins dipin ke commit

Controller Windows masih memakai SYSTEM. Menjalankan Jenkinsfile/npm scripts dari
PR pada controller itu dapat memberi PR akses ke mesin dan credential Jenkins.
Karena itu job mengambil **Jenkinsfile.dev dan toolchain dari commit ilyas yang
direview dan dipin oleh admin**, lalu mengambil JS/TS PR dari objek Git sebagai data.
Lightweight checkout dimatikan untuk pin SHA karena GitSCMFileSystem dapat
memperlakukan SHA sebagai nama branch. Full checkout tetap memakai commit tepat.

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
node scripts/jenkins/control.mjs build-validation reservasi-pipeline
```

Perubahan aplikasi biasa dalam PR otomatis dipindai tanpa mengganti pin scanner.
Full/manual build memakai source pada pin tersebut sampai diperbarui dengan sengaja.
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
