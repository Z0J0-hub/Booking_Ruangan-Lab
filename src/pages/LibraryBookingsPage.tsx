import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/features/auth';
import type { Booking, BookingStatus } from '@/lib/types';
import { BookingStatusBadge } from '@/components/StatusBadge';
import { Modal } from '@/components/Modal';
import { CalendarDays, Clock3, Inbox, Loader2, MapPin, X } from 'lucide-react';
import { format, parseISO } from 'date-fns';

const filterOptions: { value: BookingStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Semua' },
  { value: 'pending', label: 'Menunggu' },
  { value: 'approved', label: 'Disetujui' },
  { value: 'in_progress', label: 'Berlangsung' },
  { value: 'completed', label: 'Selesai' },
  { value: 'cancelled', label: 'Dibatalkan' },
];

export function LibraryBookingsPage() {
  const { user } = useAuthStore();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [filter, setFilter] = useState<BookingStatus | 'all'>('all');
  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const isAdmin = user?.role === 'admin';
  const userId = user?.id;

  useEffect(() => {
    const fetchBookings = async () => {
      if (!userId) return;
      setLoading(true);
      let query = supabase
        .from('bookings')
        .select(isAdmin ? '*, room:rooms(*), profile:profiles(*)' : '*, room:rooms(*)')
        .not('room_id', 'is', null)
        .order('start_time', { ascending: true });
      if (!isAdmin) query = query.eq('user_id', userId);
      const { data, error: queryError } = await query;
      setError(queryError?.message || '');
      setBookings((data as unknown as Booking[] | null) || []);
      setLoading(false);
    };

    void fetchBookings();
  }, [isAdmin, userId]);

  const updateStatus = async (bookingId: string, status: BookingStatus, cancellationReason?: string) => {
    setActionLoading(bookingId);
    setError('');
    const values: { status: BookingStatus; cancellation_reason?: string } = { status };
    if (cancellationReason) values.cancellation_reason = cancellationReason;
    const { error: updateError } = await supabase.from('bookings').update(values).eq('id', bookingId);
    setActionLoading(null);
    if (updateError) setError(updateError.message);
    else {
      let query = supabase
        .from('bookings')
        .select(isAdmin ? '*, room:rooms(*), profile:profiles(*)' : '*, room:rooms(*)')
        .not('room_id', 'is', null)
        .order('start_time', { ascending: true });
      if (!isAdmin && userId) query = query.eq('user_id', userId);
      const { data } = await query;
      setBookings((data as unknown as Booking[] | null) || []);
    }
    return !updateError;
  };

  const confirmCancellation = async () => {
    if (!cancelTarget || !cancelReason.trim()) return;
    const saved = await updateStatus(cancelTarget.id, 'cancelled', cancelReason.trim());
    if (saved) {
      setCancelTarget(null);
      setCancelReason('');
    }
  };

  const filteredBookings = useMemo(() =>
    filter === 'all' ? bookings : bookings.filter((booking) => booking.status === filter),
  [bookings, filter]);

  return (
    <div className="mx-auto max-w-7xl space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-800">Jadwal perpustakaan</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">{isAdmin ? 'Kelola Sesi Booking' : 'Booking Saya'}</h1>
          <p className="mt-1 text-sm text-slate-600">{isAdmin ? 'Tinjau permintaan dan kelola sesi penggunaan ruangan.' : 'Pantau status dan jadwal ruangan yang Anda ajukan.'}</p>
        </div>
        {isAdmin && <span className="border-l-2 border-teal-700 pl-3 text-sm text-slate-600">Admin dapat membatalkan sesi dengan alasan.</span>}
      </header>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-4">
        {filterOptions.map((option) => (
          <button key={option.value} onClick={() => setFilter(option.value)} aria-pressed={filter === option.value} className={`px-3 py-2 text-sm ${filter === option.value ? 'bg-teal-900 text-white' : 'border border-slate-300 text-slate-700 hover:bg-slate-100'}`}>
            {option.label}
          </button>
        ))}
      </div>

      {error && <p role="alert" className="border-l-4 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}

      {loading ? (
        <div className="flex items-center gap-2 py-12 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Memuat booking...</div>
      ) : filteredBookings.length === 0 ? (
        <div className="border-y border-slate-200 py-14 text-center">
          <Inbox className="mx-auto h-9 w-9 text-slate-400" />
          <p className="mt-3 font-medium text-slate-900">Belum ada booking</p>
          <p className="mt-1 text-sm text-slate-500">Permintaan booking akan tampil di sini.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-200 border-y border-slate-200">
          {filteredBookings.map((booking) => {
            const start = parseISO(booking.start_time);
            const end = parseISO(booking.end_time);
            const cancellable = isAdmin && start > new Date() && !['cancelled', 'completed'].includes(booking.status);
            return (
              <article key={booking.id} className="grid gap-4 py-5 md:grid-cols-[minmax(0,1fr)_auto]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="font-semibold text-slate-900">{booking.room?.name || 'Ruangan'}</h2>
                    <BookingStatusBadge status={booking.status} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-600">
                    <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4" />{format(start, 'EEEE, dd MMMM yyyy')}</span>
                    <span className="inline-flex items-center gap-1.5"><Clock3 className="h-4 w-4" />{format(start, 'HH:mm')}–{format(end, 'HH:mm')}</span>
                    {booking.room?.location && <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" />{booking.room.location}</span>}
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{booking.purpose}</p>
                  {isAdmin && booking.profile && <p className="mt-2 text-xs text-slate-500">Diajukan oleh {booking.profile.full_name}</p>}
                  {booking.cancellation_reason && <p className="mt-2 border-l-2 border-red-500 pl-3 text-sm text-red-800">Alasan pembatalan: {booking.cancellation_reason}</p>}
                </div>
                {isAdmin && (
                  <div className="flex items-start gap-2 md:justify-end">
                    {booking.status === 'pending' && (
                      <button disabled={actionLoading === booking.id} onClick={() => void updateStatus(booking.id, 'approved')} className="px-3 py-2 text-sm font-medium text-emerald-900 hover:bg-emerald-50 disabled:opacity-50">Setujui</button>
                    )}
                    {cancellable && (
                      <button disabled={actionLoading === booking.id} onClick={() => setCancelTarget(booking)} title="Batalkan sesi dengan alasan" className="inline-flex items-center gap-1.5 border border-red-200 px-3 py-2 text-sm font-medium text-red-800 hover:bg-red-50 disabled:opacity-50"><X className="h-4 w-4" /> Batalkan</button>
                    )}
                    {actionLoading === booking.id && <Loader2 className="mt-2 h-4 w-4 animate-spin text-slate-500" />}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      <Modal open={!!cancelTarget} onClose={() => { setCancelTarget(null); setCancelReason(''); }} title="Batalkan Sesi" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Masukkan alasan pembatalan. Alasan ini akan ditampilkan pada detail booking mahasiswa.</p>
          <textarea required autoFocus rows={4} maxLength={500} value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder="Alasan pembatalan sesi..." className="w-full border border-slate-300 px-3 py-2.5 text-sm focus:border-red-600 focus:outline-none focus:ring-2 focus:ring-red-600/15" />
          <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
            <button onClick={() => { setCancelTarget(null); setCancelReason(''); }} className="px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">Kembali</button>
            <button disabled={!cancelReason.trim() || !!actionLoading} onClick={() => void confirmCancellation()} className="inline-flex items-center gap-2 bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50">
              {actionLoading && <Loader2 className="h-4 w-4 animate-spin" />}Batalkan Sesi
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}