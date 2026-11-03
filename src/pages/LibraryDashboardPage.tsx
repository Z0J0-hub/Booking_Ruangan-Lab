import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import type { Booking, Room } from '@/lib/types';
import { ArrowRight, CalendarDays, Clock3, DoorOpen, MapPin } from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface LibraryDashboardPageProps {
  onNavigate: (page: 'bookings' | 'rooms') => void;
}

export function LibraryDashboardPage({ onNavigate }: LibraryDashboardPageProps) {
  const { user } = useAuthStore();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const isAdmin = user?.role === 'admin';
  const userId = user?.id;

  useEffect(() => {
    const fetchDashboard = async () => {
      if (!userId) return;
      setLoading(true);
      let bookingQuery = supabase
        .from('bookings')
        .select(isAdmin ? '*, room:rooms(*), profile:profiles(*)' : '*, room:rooms(*)')
        .not('room_id', 'is', null)
        .order('start_time', { ascending: true })
        .limit(12);
      if (!isAdmin) bookingQuery = bookingQuery.eq('user_id', userId);

      const [bookingResult, roomResult] = await Promise.all([
        bookingQuery,
        supabase.from('rooms').select('*').order('name'),
      ]);
      setError(bookingResult.error?.message || roomResult.error?.message || '');
      setBookings((bookingResult.data as unknown as Booking[] | null) || []);
      setRooms((roomResult.data as Room[] | null) || []);
      setLoading(false);
    };

    void fetchDashboard();
  }, [isAdmin, userId]);

  const upcomingBookings = bookings.filter((booking) =>
    parseISO(booking.start_time) >= new Date() && booking.status !== 'cancelled' && booking.status !== 'completed'
  );
  const pendingBookings = bookings.filter((booking) => booking.status === 'pending');

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-800">Library Booking The Room</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Selamat datang, {user?.full_name.split(' ')[0]}</h1>
          <p className="mt-2 text-sm text-slate-600">Kelola jadwal penggunaan ruang perpustakaan Anda.</p>
        </div>
        <div className="flex items-center gap-2 border-l-2 border-teal-700 pl-3 text-sm text-slate-700">
          <Clock3 className="h-4 w-4 text-teal-800" />
          <span>Senin–Jumat, 08.00–18.00</span>
        </div>
      </header>

      {error && <p role="alert" className="border-l-4 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}

      <section className="grid gap-6 border-b border-slate-200 pb-7 sm:grid-cols-3">
        <button onClick={() => onNavigate('bookings')} className="text-left group">
          <span className="flex h-9 w-9 items-center justify-center bg-teal-50 text-teal-900"><CalendarDays className="h-5 w-5" /></span>
          <span className="mt-3 block text-3xl font-semibold text-slate-900">{loading ? '—' : upcomingBookings.length}</span>
          <span className="mt-1 flex items-center gap-1 text-sm text-slate-600">{isAdmin ? 'Sesi mendatang' : 'Booking mendatang'}<ArrowRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" /></span>
        </button>
        <button onClick={() => onNavigate('bookings')} className="text-left group">
          <span className="flex h-9 w-9 items-center justify-center bg-amber-50 text-amber-900"><Clock3 className="h-5 w-5" /></span>
          <span className="mt-3 block text-3xl font-semibold text-slate-900">{loading ? '—' : isAdmin ? pendingBookings.length : '—'}</span>
          <span className="mt-1 flex items-center gap-1 text-sm text-slate-600">{isAdmin ? 'Menunggu persetujuan' : 'Status permintaan'}<ArrowRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" /></span>
        </button>
        <button onClick={() => onNavigate('rooms')} className="text-left group">
          <span className="flex h-9 w-9 items-center justify-center bg-sky-50 text-sky-900"><DoorOpen className="h-5 w-5" /></span>
          <span className="mt-3 block text-3xl font-semibold text-slate-900">{loading ? '—' : rooms.length}</span>
          <span className="mt-1 flex items-center gap-1 text-sm text-slate-600">Ruangan tersedia untuk dipilih<ArrowRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" /></span>
        </button>
      </section>

      <section className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{isAdmin ? 'Sesi penggunaan mendatang' : 'Booking mendatang'}</h2>
              <p className="mt-1 text-sm text-slate-500">{isAdmin ? 'Jadwal seluruh ruangan perpustakaan.' : 'Jadwal ruangan yang Anda ajukan.'}</p>
            </div>
            <button onClick={() => onNavigate('bookings')} className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-teal-900 hover:underline">Semua booking<ArrowRight className="h-4 w-4" /></button>
          </div>
          {loading ? <p className="py-8 text-sm text-slate-500">Memuat jadwal...</p> : upcomingBookings.length === 0 ? (
            <div className="border-y border-slate-200 py-8 text-sm text-slate-500">Belum ada jadwal mendatang.</div>
          ) : (
            <div className="divide-y divide-slate-200 border-y border-slate-200">
              {upcomingBookings.slice(0, 6).map((booking) => (
                <article key={booking.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div>
                    <h3 className="font-medium text-slate-900">{booking.room?.name || 'Ruangan'}</h3>
                    <p className="mt-1 text-sm text-slate-600">{booking.purpose}</p>
                    {isAdmin && booking.profile && <p className="mt-1 text-xs text-slate-500">{booking.profile.full_name}</p>}
                  </div>
                  <div className="text-right text-sm text-slate-600">
                    <p>{format(parseISO(booking.start_time), 'EEE, dd MMM yyyy')}</p>
                    <p className="mt-1">{format(parseISO(booking.start_time), 'HH:mm')}–{format(parseISO(booking.end_time), 'HH:mm')}</p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <aside>
          <h2 className="text-lg font-semibold text-slate-900">Ruang perpustakaan</h2>
          <p className="mt-1 text-sm text-slate-500">Pilih ruangan untuk melihat jadwal.</p>
          <div className="mt-4 divide-y divide-slate-200 border-y border-slate-200">
            {rooms.slice(0, 5).map((room) => (
              <button key={room.id} onClick={() => onNavigate('rooms')} className="flex w-full items-start gap-3 py-3 text-left hover:bg-slate-50">
                <DoorOpen className="mt-0.5 h-4 w-4 shrink-0 text-teal-800" />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-slate-900">{room.name}</span><span className="mt-1 flex items-center gap-1 text-xs text-slate-500"><MapPin className="h-3 w-3" />{room.location}</span></span>
              </button>
            ))}
            {!loading && rooms.length === 0 && <p className="py-4 text-sm text-slate-500">Belum ada ruangan terdaftar.</p>}
          </div>
          <button onClick={() => onNavigate('rooms')} className="mt-4 text-sm font-medium text-teal-900 hover:underline">Lihat semua ruangan</button>
        </aside>
      </section>
    </div>
  );
}