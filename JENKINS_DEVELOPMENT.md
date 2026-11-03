# Workspace Jenkins development di Windows

## Baseline dan alur kerja

Baseline aplikasi adalah hasil teman satu tim, ditambah penyesuaian setup lokal.
Aturan reservasi dan pilihan database belum diselaraskan dengan PDF rancangan.
Branch `development` menjadi tempat integrasi development; `main` tetap baseline
sebelum perubahan disepakati tim. Branch fitur dapat dibuat dari `development`.

```text
feature/... -> development -> Jenkins checkout ke workspace sendiri
                           -> tools -> npm ci -> types/lint -> tes
                           -> build -> audit -> artefak development
```

Pipeline sekarang menjalankan CI dan menyimpan hasil build (delivery artefak).
Deployment aplikasi full stack otomatis belum diaktifkan. Database, `.env`,
dan proses Vite lokal bukan bagian workspace build Jenkins.

## Jenkins lokal

Runtime portable disimpan dalam `.jenkins-local/`, yang diabaikan Git:

- `jre/`: Temurin Java 21 khusus Jenkins, tanpa mengganti Java sistem.
- `jenkins.war`: Jenkins LTS.
- `home/`: konfigurasi, plugin, credentials, job, dan workspace Jenkins.
- `stdout.log` / `stderr.log`: log server lokal.

Download diverifikasi SHA256. Instalasi pertama membutuhkan internet dan ruang
disk untuk Java, Jenkins, plugin, dependensi Node, dan riwayat build.

Jalankan dari akar repository:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/jenkins-local.ps1 -Action Install
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/jenkins-local.ps1 -Action Start
```

`ExecutionPolicy Bypass` berlaku hanya pada proses perintah tersebut, bukan
perubahan policy Windows permanen. Jenkins berjalan di http://127.0.0.1:8081,
hanya menerima koneksi localhost. Tidak dibuat Windows service atau auto-start.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/jenkins-local.ps1 -Action Status
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/jenkins-local.ps1 -Action Stop
```

Stop digunakan setelah build selesai. Menutup chat tidak otomatis menghapus
runtime atau konfigurasi Jenkins.

## Setup awal melalui browser

1. Buka http://127.0.0.1:8081.
2. Ambil password unlock dari `.jenkins-local/home/secrets/initialAdminPassword`.
   Baca secara lokal; jangan commit, kirim ke chat, atau masukkan ke dokumentasi.
3. Pilih **Install suggested plugins**. Pastikan plugin **Pipeline** dan **Git**
   berhasil terpasang.
4. Buat akun admin Jenkins milikmu. Akun ini berbeda dari admin aplikasi booking.
5. Isi Jenkins URL `http://127.0.0.1:8081/`, lalu selesaikan setup.

Untuk latihan lokal awal, job berjalan pada built-in node Windows. Node dan Git
diambil dari PATH proses yang menjalankan Jenkins. Untuk server tim nanti,
pisahkan controller dan build agent. Pipeline memeriksa Node major version 24.

## Memasukkan pipeline ke GitHub

Jenkins Pipeline from SCM membaca file yang sudah di-commit pada branch sumber;
ia tidak membaca perubahan yang belum di-commit di folder coding ini.
Periksa diff dan sepakati baseline tim sebelum commit/push. Contoh langkah:

```powershell
git status
git diff
# Stage file yang sudah ditinjau, kemudian commit.
git commit -m "Set up local development and Jenkins CI"
git push -u origin development
```

Perintah commit memerlukan staging terlebih dahulu. Jangan memasukkan `.env`,
`.jenkins-local`, `node_modules`, atau `dist`. Jika tidak punya izin push ke
repository teman, gunakan fork dan sesuaikan URL job.

## Membuat job

1. **New Item** -> `booking-development` -> **Pipeline**.
2. Bagian Pipeline: **Definition** = **Pipeline script from SCM**.
3. **SCM** = **Git**.
4. Repository URL: `https://github.com/Z0J0-hub/Booking_Ruangan-Lab`.
5. Credentials: kosong untuk clone repo publik. Untuk repo privat gunakan
   credentials Jenkins dengan akses baca. Jangan tulis token dalam URL.
6. **Branch Specifier** = `*/development`.
7. **Script Path** = `Jenkinsfile.dev` (file berada di akar repo GitHub).
8. Save -> **Build Now** untuk build pertama.

Build pertama mengaktifkan konfigurasi polling dari Jenkinsfile. Berikutnya
Jenkins memeriksa perubahan SCM kira-kira setiap lima menit. Push tidak langsung
memicu build melalui webhook karena Jenkins lokal belum dapat dijangkau GitHub.
Tombol **Build Now** bisa dipakai kapan saja.

## Membaca hasil

- **Checkout**: commit yang dibuild tertera di log.
- **Tools**: Git, Node 24, dan npm harus tersedia.
- **Install**: dua lockfile dipasang dengan `npm ci` secara terpisah.
- **Types and lint**: TypeScript dan ESLint.
- **Backend tests**: tes aturan booking yang sudah ada.
- **Build**: output frontend `dist` dan pemeriksaan sintaks backend.
- **Dependency audit**: audit frontend dan backend. Exit code bukan nol,
  termasuk temuan high/critical atau kegagalan registry, membuat build
  **UNSTABLE**, bukan hijau. Penyebab dibaca di Console Output. Ini kebijakan
  baseline awal; setelah temuan ditangani, gate dapat diperketat menjadi gagal.
- **Archive development build**: frontend dan file runtime backend disimpan
  tanpa `.env`. Artefak backend masih membutuhkan `npm ci --omit=dev`,
  konfigurasi runtime, serta database untuk deployment.

Build **SUCCESS** berarti pemeriksaan yang ada lulus. Ia belum membuktikan
kesesuaian PDF, keamanan menyeluruh, integrasi database, browser, atau kapasitas
300 pengguna. Job ini tidak menghubungi database dan tidak menjalankan backend.

## Setelah build pertama

1. Tinjau hasil audit dependensi dan catat backlog.
2. Sepakati gap PDF yang akan dikerjakan lebih dahulu.
3. Kerjakan fitur di branch fitur, lalu integrasikan ke `development`.
4. Tambahkan tes integrasi dan deployment development dengan database dan
   credentials khusus setelah target deployment disepakati.

Rujukan resmi:
- [Menjalankan Jenkins WAR](https://www.jenkins.io/doc/book/installing/war-file/)
- [Java yang didukung Jenkins](https://www.jenkins.io/doc/book/platform-information/support-policy-java/)
- [Pipeline from SCM](https://www.jenkins.io/doc/book/pipeline/getting-started/)
- [Sintaks pipeline dan polling SCM](https://www.jenkins.io/doc/book/pipeline/syntax/)
