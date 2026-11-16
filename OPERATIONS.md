# Operasi Windows lokal, hardening, dan SOP insiden

## Menjalankan dan memperbarui rilis

Semua proses berjalan dengan akun Windows yang menjalankan terminal; bukan
instalasi service Windows baru. Prasyarat Node.js 24, public config Supabase valid,
dan port 8081/9091 kosong. Tidak mengubah database Supabase atau firewall host.

Terminal pertama:

```powershell
npm.cmd run build
npm.cmd run ops:serve
```

Frontend: http://127.0.0.1:8081. Collector/metrics: http://127.0.0.1:9091/metrics.
Monitor memeriksa health setiap 2 detik; tiga kegagalan berurutan menghasilkan
alert critical lokal. Ctrl+C menghentikan proses. Restart proses membuat baseline
baru dari dist; ini belum service auto-start/recovery Windows.

Terminal kedua, setelah memperbarui source dan melewati gate:

```powershell
npm.cmd run build
npm.cmd run ops:deploy
```

Client menyalin dist ke release baru di `.runtime/local/releases/` dan mengirim
permintaan melalui file lokal. Directory release tidak ditimpa. Daemon mengganti
pointer aktif, memeriksa halaman dan asset JS/CSS melalui HTTP, lalu kembali ke
release sebelumnya jika smoke test gagal. Manifest setiap file diperiksa sebelum
aktivasi maupun rollback. Deployment diproses satu per satu. CLI hanya menyatakan
sukses setelah konfirmasi; timeout tidak berarti deployment berhasil.

Rollback manual ke ID release yang diketahui sehat:

```powershell
npm.cmd run ops:deploy -- build-ID-DARI-RELEASE-SEBELUMNYA
```

Permintaan file lokal memakai akses akun Windows ke workspace; belum ada ACL
operator terpisah. Jangan membagikan folder runtime dengan akun tidak terpercaya.
Release lama dipertahankan untuk rollback; pembersihan release dilakukan setelah
verifikasi dan kebutuhan retensi ditentukan. Proses ini bukan rollback schema DB.

## Log, monitoring, dan alert

`.runtime/local/logs/events.ndjson` menggabungkan event frontend, monitor, dan
deployment. Field event dibatasi; query, token, header Authorization, body request,
email, dan alamat IP pengguna tidak dicatat. Collector menolak penulisan tanpa
Bearer token internal per proses serta payload di atas 16 KiB. Token tidak dicetak.
Log aktif dan satu file rotasi masing-masing dibatasi sekitar 5 MiB.

`.runtime/local/logs/alerts.ndjson` mencatat kode dan tingkat eskalasi:

| Kode | Kondisi | Tingkat |
|---|---|---|
| HTTP_404_BURST | Minimal 5 respons 404 dalam 10 detik; deduplikasi 30 detik | warning |
| DEPLOYMENT_HEALTH_FAILED | Pemeriksaan rilis kandidat gagal | high |
| AVAILABILITY_DOWN | Tiga probe health gagal berurutan | critical |
| ROLLBACK_FAILED | Release sebelumnya tidak dapat diverifikasi/dipulihkan | critical |

Alert tersedia sebagai file lokal dan counter metrics. **Belum ada pengiriman
email/Slack/pager, SOC, ELK/Loki, atau SIEM eksternal.** `observability/prometheus.yml`
dan `alerts.yml` disiapkan untuk Prometheus native Windows, tetapi Prometheus dan
Alertmanager belum dipasang/dijalankan. Ini baseline collector dan monitoring lokal,
bukan klaim seluruh aspek observabilitas rubrik selesai.

## Latihan insiden yang aman

```powershell
npm.cmd run ops:drill
```

Drill memakai dist nyata pada port loopback acak dalam `.runtime/drill-*`, membuat
kandidat terpisah yang merujuk JS tidak tersedia, lalu menguji HTTP 404 dan rollback.
Tidak menyentuh server ops:serve yang sedang berjalan. Drill juga menguji injeksi
log tanpa autentikasi, lonjakan 404, dan kegagalan probe setelah server dihentikan.
Ringkasan, events, serta alerts yang disaring disalin ke `reports/ops/`; semua proses
drill dihentikan dan file kerja sementara dibersihkan. Durasi recovery adalah
pengukuran simulasi lokal, tidak mewakili MTTR produksi.

SOP operator:

1. Catat waktu, kode alert, build/ID release, dan status layanan; simpan events,
   alerts, serta laporan scan. Jangan menyertakan token/password pada laporan.
2. Tahan promosi rilis berikutnya. Bedakan gangguan collector, frontend, dan Auth
   Supabase; health frontend sehat tidak membuktikan login/database sehat.
3. Jika deployment gagal, periksa apakah `rollback_succeeded` tercatat dan asset
   frontend kembali 200. Jika rollback gagal, tangani sebagai critical dan jangan
   mengganti hasil menjadi sukses. Aktifkan release sehat yang integritasnya valid.
4. Jika ada dugaan secret bocor, batasi akses dan rotasi credential di penyedianya;
   simpan bukti, jangan hanya menghapus log. Perubahan project Supabase terpisah
   dari rollback frontend.
5. Setelah pemulihan, jalankan smoke test dan alur pengguna di lingkungan tes,
   catat penyebab, waktu deteksi/pemulihan, tindakan korektif, serta hasil pengujian.

## Konfigurasi container untuk nanti

Frontend memakai base Node dan Nginx unprivileged yang dipin digest. Runtime UID
101:101, port 8080 di container, filesystem read-only, tmpfs /tmp, seluruh capability
dihapus, no-new-privileges, batas PID/memori/CPU, log berotasi, network internal.
Port host loopback: local 8081, staging 8082, prod 8083. Prod memerlukan reverse proxy
HTTPS eksternal sebelum dipublikasikan. Container belum dibangun/dijalankan di laptop
ini, sehingga Nginx runtime/healthcheck dan kontrol kernel container belum terbukti.

```powershell
npm.cmd run ci:infra:setup
npm.cmd run ci:infra
node scripts/infra/baseline.mjs
```

Trivy 0.76.2 Windows dipin SHA-256 archive dan executable. Dockerfile dipindai dengan
check bawaan versi tersebut; Compose memakai policy proyek karena Trivy ini tidak
memiliki scanner Compose. Cakupan tersebut bukan audit CIS lengkap. Scan error,
hasil kosong/tidak valid, serta temuan High/Critical/Unknown menghentikan gate.

Setelah Docker tersedia, `Jenkinsfile.container` pada agent windows-docker membangun
image, mengekspor exact image ke `.runtime/images/frontend.tar`, lalu menjalankan
`ci:image` sebelum image dapat dipakai untuk rilis. Pipeline belum dijalankan dan
belum memiliki tahap push registry. Penggunaan manual harus memeriksa exit code:

```powershell
docker compose build
if ($LASTEXITCODE -ne 0) { throw 'Build image gagal' }
New-Item -ItemType Directory -Path .runtime/images -Force
docker save -o .runtime/images/frontend.tar reservasi-frontend:local
if ($LASTEXITCODE -ne 0) { throw 'Export image gagal' }
$env:IMAGE_TAR = '.runtime/images/frontend.tar'
npm.cmd run ci:image
if ($LASTEXITCODE -ne 0) { throw 'Image belum boleh dipromosikan' }
docker compose up -d --no-build
```

Staging/prod Compose hanya memakai image bertag rilis yang sudah dibangun/discan;
set RELEASE_TAG sesuai hasil build, lalu jalankan file Compose yang sesuai. File
credential `*.local.json`, `.env*`, `.git`, `.runtime`, dan tools tidak masuk build
context. Jangan menganggap tag tidak dapat ditimpa: registry immutable policy dan
verifikasi digest saat promosi masih perlu diterapkan.

Referensi: [Trivy misconfiguration](https://trivy.dev/latest/docs/scanner/misconfiguration/),
[Trivy release](https://github.com/aquasecurity/trivy/releases/tag/v0.76.2),
[Nginx unprivileged](https://github.com/nginxinc/docker-nginx-unprivileged),
[Compose service controls](https://docs.docker.com/reference/compose-file/services/).
