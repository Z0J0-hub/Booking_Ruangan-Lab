import { useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { LibraryBig, Mail, Lock, User, Phone, IdCard, ArrowRight, ArrowLeft } from 'lucide-react';

export function AuthPage() {
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [studentId, setStudentId] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const { signIn, signUp, requestPasswordReset, loading } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (mode === 'forgot') {
      const { error } = await requestPasswordReset(email);
      if (error) setError(error);
      else setSuccess('Jika email terdaftar, tautan untuk membuat kata sandi baru akan dikirim.');
    } else if (mode === 'login') {
      const { error } = await signIn(email, password);
      if (error) setError(error);
    } else {
      if (password.length < 6) {
        setError('Kata sandi minimal 6 karakter.');
        return;
      }
      const { error } = await signUp({
        email,
        password,
        username,
        full_name: fullName,
        phone: phone || undefined,
        student_id: studentId || undefined,
      });
      if (error) {
        setError(error);
      } else {
        setSuccess('Akun berhasil dibuat. Silakan masuk.');
        setMode('login');
        setPassword('');
      }
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Panel identitas */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-slate-800 via-slate-900 to-slate-800">
        <div className="absolute inset-0 opacity-20" style={{
          backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(56, 189, 248, 0.3) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(45, 212, 191, 0.2) 0%, transparent 50%)'
        }} />
        <div className="relative z-10 flex flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-sky-500 to-teal-500 flex items-center justify-center shadow-lg">
              <LibraryBig className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Library Booking The Room</h1>
              <p className="text-sm text-slate-400">Reservasi ruang perpustakaan</p>
            </div>
          </div>

          <div className="space-y-6">
            <h2 className="text-4xl font-bold leading-tight">
              Temukan ruang belajar<br />yang sesuai jadwal.
            </h2>
            <p className="text-lg text-slate-300 leading-relaxed">
              Pesan ruang untuk diskusi, belajar kelompok, atau kegiatan akademik
              dengan jadwal yang jelas.
            </p>
            <div className="space-y-3 pt-4">
              {[
                'Jadwal Senin–Jumat, 08.00–18.00',
                'Cek bentrok jadwal secara langsung',
                'Status booking dapat dipantau',
              ].map((feature) => (
                <div key={feature} className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-full bg-teal-500/20 flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-teal-400" />
                  </div>
                  <span className="text-slate-200">{feature}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="text-sm text-slate-400">
            Perpustakaan &middot; Universitas Telkom
          </div>
        </div>
      </div>

      {/* Form masuk */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-teal-500 flex items-center justify-center">
              <LibraryBig className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Library Booking The Room</h1>
              <p className="text-xs text-slate-500">Reservasi ruang perpustakaan</p>
            </div>
          </div>

          <h2 className="text-2xl font-bold text-slate-900 mb-2">
            {mode === 'login' ? 'Selamat datang kembali' : mode === 'signup' ? 'Buat akun mahasiswa' : 'Atur ulang kata sandi'}
          </h2>
          <p className="text-slate-500 mb-8">
            {mode === 'login'
              ? 'Masuk untuk mengatur booking ruangan'
                : mode === 'signup' ? 'Daftar untuk mulai memesan ruangan' : 'Masukkan email akun untuk menerima tautan reset.'}
          </p>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}
          {success && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-700">
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <InputField
                    icon={<User className="w-4 h-4" />}
                    placeholder="Nama lengkap"
                    value={fullName}
                    onChange={setFullName}
                    required
                  />
                  <InputField
                    icon={<User className="w-4 h-4" />}
                    placeholder="Nama pengguna"
                    value={username}
                    onChange={setUsername}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <InputField
                    icon={<Phone className="w-4 h-4" />}
                    placeholder="Telepon (opsional)"
                    value={phone}
                    onChange={setPhone}
                  />
                  <InputField
                    icon={<IdCard className="w-4 h-4" />}
                    placeholder="NIM (opsional)"
                    value={studentId}
                    onChange={setStudentId}
                  />
                </div>
              </>
            )}

            <InputField
              icon={<Mail className="w-4 h-4" />}
              type="email"
              placeholder="Alamat email"
              value={email}
              onChange={setEmail}
              required
            />

            {mode !== 'forgot' && (
              <InputField
                icon={<Lock className="w-4 h-4" />}
                type="password"
                placeholder="Kata sandi"
                value={password}
                onChange={setPassword}
                required
              />
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-sky-600 to-teal-600 text-white font-medium rounded-lg hover:from-sky-700 hover:to-teal-700 transition-all shadow-lg shadow-sky-600/20 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  {mode === 'login' ? 'Masuk' : mode === 'signup' ? 'Daftar' : 'Kirim Tautan Reset'}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 space-y-3 text-center">
            {mode === 'login' && (
              <button type="button" onClick={() => { setMode('forgot'); setError(''); setSuccess(''); }} className="text-sm font-medium text-teal-800 hover:underline">
                Lupa kata sandi?
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'signup' ? 'login' : 'signup');
                if (mode === 'forgot') setMode('login');
                setError('');
                setSuccess('');
              }}
              className="text-sm text-slate-600 hover:text-slate-900 flex items-center justify-center gap-1.5 mx-auto transition-colors"
            >
              {mode === 'signup' ? (
                <><ArrowLeft className="w-3.5 h-3.5" />Sudah punya akun? <span className="font-medium text-sky-600">Masuk</span></>
              ) : mode === 'forgot' ? (
                <><ArrowLeft className="w-3.5 h-3.5" />Kembali ke masuk</>
              ) : (
                <>Belum punya akun? <span className="font-medium text-sky-600">Daftar</span></>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function InputField({
  icon,
  type = 'text',
  placeholder,
  value,
  onChange,
  required,
}: {
  icon: React.ReactNode;
  type?: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <div className="relative">
      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{icon}</div>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all"
      />
    </div>
  );
}
