# Modul Auth

Login, signup, sesi, logout, dan pemulihan password berada dalam satu modul.
Supabase tetap mengelola akun/password/token/email. Client tunggal tetap di
`src/lib/supabase.ts` dan dipakai bersama query ruangan/booking.

```text
features/auth/
  index.ts                    # Interface untuk fitur lain
  types.ts                    # Kontrak input/hasil
  pages/                      # Form login/signup/forgot dan reset password
  services/authService.ts     # Adapter Supabase dan pengambilan profil
  store/createAuthStore.ts    # State dan lifecycle sesi, dapat diuji terpisah
  store/authStore.ts          # Satu instance store dengan client aplikasi
  auth.test.mjs               # Tes lokal tanpa layanan remote
```

Fitur lain memakai `import { useAuthStore } from '@/features/auth'`.
UI memanggil `signIn`, `signUp`, `requestPasswordReset`, `updatePassword`,
`signOut`, dan `completePasswordRecovery`; hasil action memiliki `error`.
Signup juga memberi `requiresEmailConfirmation`. Jangan memanggil Supabase Auth
langsung dari halaman. Detail SDK dan retry profil dikelola service.

`App` memanggil `initialize()` melalui effect dan mengembalikan fungsi cleanup.
Satu listener aktif dipertahankan; listener/timer dilepas saat cleanup, termasuk
remount StrictMode. Permintaan profil bersamaan untuk akun/generasi sama digabung,
dan hasil yang datang setelah logout/pergantian akun tidak mengisi state lama.
Error tidak membiarkan status loading tertahan. Logout yang gagal tidak berpura-pura
menghapus sesi server; action mengembalikan error untuk ditangani UI.

## Pembagian pengembangan

- Login/signup: kerjakan mode terkait di AuthPage dan metode terkait di service.
- Pemulihan password: kerjakan ResetPasswordPage serta request/update password.
- Koordinasikan perubahan types, store lifecycle, service bersama, dan Supabase
  Redirect URLs. Satu modul tidak berarti setiap developer harus mengubah semua file.

Tidak ada perubahan schema/role/RLS pada pemindahan ini. Profil tetap dibaca dari
`profiles` setelah login; pembuatan profil tetap tugas trigger di Supabase.
Pekerjaan email reset teman satu tim perlu dicocokkan ke lokasi file baru ini.

## Validasi

Jalankan `npm run test:auth`, `npm run typecheck`, `npm run lint`, dan build.
Tes modul memakai SDK/service pengganti, tidak membuat akun atau mengirim email.
Tetap uji manual pada project development: signup dengan/tanpa konfirmasi email,
login salah/benar, reload sesi, logout, lalu tautan reset dan password baru.

Referensi: [Supabase auth events](https://supabase.com/docs/reference/javascript/auth-onauthstatechange)
dan [React effect cleanup](https://react.dev/reference/react/useEffect).
