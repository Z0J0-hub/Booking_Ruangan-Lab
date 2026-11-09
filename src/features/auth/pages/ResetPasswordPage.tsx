import { useState } from 'react';
import { LibraryBig, Lock, CheckCircle2, ArrowRight, Loader2 } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

export function ResetPasswordPage() {
  const { updatePassword, completePasswordRecovery, loading } = useAuthStore();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [updated, setUpdated] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('Kata sandi minimal 6 karakter.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Konfirmasi kata sandi belum sama.');
      return;
    }
    const result = await updatePassword(password);
    if (result.error) setError(result.error);
    else setUpdated(true);
  };

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-6 py-4">
          <span className="flex h-10 w-10 items-center justify-center bg-teal-900 text-white"><LibraryBig className="h-5 w-5" /></span>
          <div>
            <p className="font-semibold text-slate-900">Library Booking The Room</p>
            <p className="text-xs text-slate-500">Perpustakaan · Universitas Telkom</p>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-lg px-6 py-16 sm:py-24">
        {updated ? (
          <div className="border-t-4 border-emerald-600 bg-white p-7 shadow-sm">
            <CheckCircle2 className="h-9 w-9 text-emerald-700" />
            <h1 className="mt-4 text-2xl font-semibold text-slate-900">Kata sandi diperbarui</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">Gunakan kata sandi baru saat masuk kembali ke akun Anda.</p>
            {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
            <button onClick={async () => {
              const result = await completePasswordRecovery();
              if (result.error) setError(result.error);
            }} className="mt-6 inline-flex items-center gap-2 bg-teal-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-950">
              Kembali ke halaman masuk <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="border-t-4 border-teal-800 bg-white p-7 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-teal-800">Pemulihan akun</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900">Buat kata sandi baru</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">Gunakan minimal 6 karakter dan konfirmasi kata sandi Anda.</p>

            <label className="mt-6 block text-sm font-medium text-slate-700">
              Kata sandi baru
              <span className="relative mt-1.5 block">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input type="password" autoComplete="new-password" minLength={6} required value={password} onChange={(event) => setPassword(event.target.value)} className="w-full border border-slate-300 py-2.5 pl-10 pr-3 text-sm focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15" />
              </span>
            </label>

            <label className="mt-4 block text-sm font-medium text-slate-700">
              Ulangi kata sandi baru
              <span className="relative mt-1.5 block">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input type="password" autoComplete="new-password" minLength={6} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="w-full border border-slate-300 py-2.5 pl-10 pr-3 text-sm focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15" />
              </span>
            </label>

            {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}

            <button type="submit" disabled={loading} className="mt-6 inline-flex w-full items-center justify-center gap-2 bg-teal-900 px-4 py-3 text-sm font-medium text-white hover:bg-teal-950 disabled:cursor-not-allowed disabled:opacity-60">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Simpan kata sandi baru'}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
