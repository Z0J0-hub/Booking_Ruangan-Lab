import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { apiRequest } from '@/lib/api';

interface CheckInPageProps {
  bookingId: string;
  token: string;
}

export function CheckInPage({ bookingId, token }: CheckInPageProps) {
  const [message, setMessage] = useState('Memverifikasi booking dan QR check-in...');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void apiRequest<{ message: string }>(`/bookings/${encodeURIComponent(bookingId)}/check-in`, {
      method: 'POST',
      body: JSON.stringify({ token }),
    }).then((result) => {
      if (active) setMessage(result.message);
    }).catch((requestError: unknown) => {
      if (active) {
        setError(requestError instanceof Error ? requestError.message : 'Check-in gagal.');
      }
    });

    return () => {
      active = false;
    };
  }, [bookingId, token]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <section className="w-full max-w-md border-t-4 border-teal-800 bg-white p-8 text-center shadow-sm">
        {error ? (
          <XCircle className="mx-auto h-12 w-12 text-red-600" />
        ) : message.startsWith('Memverifikasi') ? (
          <Loader2 className="mx-auto h-12 w-12 animate-spin text-teal-800" />
        ) : (
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-700" />
        )}
        <h1 className="mt-4 text-xl font-semibold text-slate-900">
          {error ? 'Check-in tidak berhasil' : 'Check-in ruangan'}
        </h1>
        <p role={error ? 'alert' : 'status'} className={`mt-2 text-sm ${error ? 'text-red-700' : 'text-slate-600'}`}>
          {error || message}
        </p>
        <a href="/" className="mt-6 inline-flex bg-teal-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-950">
          Kembali ke aplikasi
        </a>
      </section>
    </main>
  );
}
