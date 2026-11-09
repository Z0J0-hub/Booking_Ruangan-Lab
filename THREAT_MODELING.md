# Threat Modeling

Aplikasi aktif menggunakan React, Supabase Auth, Data API, dan PostgreSQL.
Gunakan [STRIDE_MATRIX.md](STRIDE_MATRIX.md) sebagai matriks ancaman dan bukti.

Batas kepercayaan utama:

- Browser ke Supabase Auth untuk identitas dan sesi.
- Browser ke Data API menggunakan public key dan token sesi.
- Data API ke PostgreSQL dengan grant, RLS, constraint, dan trigger.
- GitHub ke Jenkins untuk checkout, dependency, build, dan laporan.

Aset utama: akun, profil, sesi, reservasi, room, dan catatan audit. Password
pengguna dikelola Supabase Auth; metadata pendaftaran bukan sumber role privileged.
URL dan public key frontend bukan kredensial admin. Secret/service_role key serta
kredensial database tidak boleh dimasukkan ke variabel VITE_*.

Kontrol pada file SQL belum otomatis menjadi kontrol yang terpasang di project
remote. Periksa inventory live dan jalankan pengujian sesuai panduan Supabase.
Pengaturan HTTPS, Auth rate limits, backup, dan retensi log layanan perlu
verifikasi dashboard tersendiri; jangan mengklaimnya dari build yang berhasil.

Jenkinsfile utama, backend MySQL, serta dokumen deployment/audit legacy bukan
bukti konfigurasi aktif versi Supabase. Riwayatnya tersedia pada Git.

Referensi: [RLS Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security)
dan [Supabase Auth user data](https://supabase.com/docs/guides/auth/managing-user-data).
