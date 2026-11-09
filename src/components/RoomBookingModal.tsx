import { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/features/auth';
import type { Booking, Room } from '@/lib/types';
import { Modal } from '@/components/Modal';
import { AlertTriangle, CalendarDays, CheckCircle2, Clock3, Loader2, Users } from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface RoomBookingModalProps {
  open: boolean;
  onClose: () => void;
  room: Room;
  onBooked: () => void;
  existingBookings: Booking[];
}

const OPEN_MINUTES = 8 * 60;
const CLOSE_MINUTES = 18 * 60;

function getNextBookableDate() {
  const date = new Date();
  if (date.getHours() >= 18) date.setDate(date.getDate() + 1);
  while (date.getDay() === 0 || date.getDay() === 6) date.setDate(date.getDate() + 1);
  return format(date, 'yyyy-MM-dd');
}

function minutesToTime(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function RoomBookingModal({ open, onClose, room, onBooked, existingBookings }: RoomBookingModalProps) {
  const { user } = useAuthStore();
  const [date, setDate] = useState(getNextBookableDate);
  const [startTime, setStartTime] = useState('08:00');
  const [durationHours, setDurationHours] = useState(1);
  const [purpose, setPurpose] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const startMinutes = useMemo(() => {
    const [hours, minutes] = startTime.split(':').map(Number);
    return hours * 60 + minutes;
  }, [startTime]);
  const endMinutes = startMinutes + durationHours * 60;
  const endTime = minutesToTime(endMinutes);
  const weekday = date ? new Date(`${date}T12:00:00`).getDay() : 0;
  const requestedStart = date ? new Date(`${date}T${startTime}:00`) : new Date(0);
  const validSchedule =
    weekday >= 1 && weekday <= 5 && startMinutes >= OPEN_MINUTES && endMinutes <= CLOSE_MINUTES && requestedStart > new Date();

  const conflicts = useMemo(() => {
    if (!date || !startTime || !validSchedule) return [];
    const requestedStart = new Date(`${date}T${startTime}:00`);
    const requestedEnd = new Date(`${date}T${endTime}:00`);
    return existingBookings.filter((booking) => {
      if (booking.status === 'cancelled') return false;
      return !(parseISO(booking.end_time) <= requestedStart || parseISO(booking.start_time) >= requestedEnd);
    });
  }, [date, endTime, existingBookings, startTime, validSchedule]);

  const suggestedTimes = useMemo(() => {
    if (conflicts.length === 0 || !date) return [];
    const suggestions: string[] = [];
    for (let slotStart = OPEN_MINUTES; slotStart + durationHours * 60 <= CLOSE_MINUTES; slotStart += 30) {
      const start = new Date(`${date}T${minutesToTime(slotStart)}:00`);
      const end = new Date(`${date}T${minutesToTime(slotStart + durationHours * 60)}:00`);
      const hasConflict = existingBookings.some((booking) => {
        if (booking.status === 'cancelled') return false;
        return !(parseISO(booking.end_time) <= start || parseISO(booking.start_time) >= end);
      }) || start <= new Date();
      if (!hasConflict) suggestions.push(minutesToTime(slotStart));
      if (suggestions.length === 3) break;
    }
    return suggestions;
  }, [conflicts.length, date, durationHours, existingBookings]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (!validSchedule) {
      setError('Pilih jadwal mendatang pada hari Senin–Jumat, pukul 08.00–18.00.');
      return;
    }
    if (conflicts.length > 0) {
      setError('Jadwal tersebut sudah dipesan. Silakan pilih waktu lain.');
      return;
    }
    if (!purpose.trim()) {
      setError('Tuliskan kegiatan yang akan dilakukan di ruangan.');
      return;
    }

    setSubmitting(true);
    const { error: insertError } = await supabase.from('bookings').insert({
      user_id: user?.id,
      room_id: room.id,
      start_time: new Date(`${date}T${startTime}:00`).toISOString(),
      end_time: new Date(`${date}T${endTime}:00`).toISOString(),
      purpose: purpose.trim(),
      status: 'pending',
    });
    setSubmitting(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setSuccess(true);
    window.setTimeout(() => {
      setSuccess(false);
      setPurpose('');
      onClose();
      onBooked();
    }, 1200);
  };

  return (
    <Modal open={open} onClose={onClose} title="Pesan Ruangan" size="lg">
      {success ? (
        <div className="flex flex-col items-center py-10 text-center">
          <CheckCircle2 className="mb-3 h-12 w-12 text-emerald-600" />
          <h3 className="text-lg font-semibold text-slate-900">Permintaan terkirim</h3>
          <p className="mt-1 text-sm text-slate-500">Admin akan memeriksa jadwal booking Anda.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
            <div>
              <h3 className="font-semibold text-slate-900">{room.name}</h3>
              <p className="mt-1 text-sm text-slate-500">{room.location}</p>
            </div>
            <span className="flex shrink-0 items-center gap-1.5 text-sm text-slate-500">
              <Users className="h-4 w-4" /> {room.capacity} orang
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block text-sm font-medium text-slate-700">
              Tanggal
              <span className="relative mt-1.5 block">
                <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="date"
                  value={date}
                  min={format(new Date(), 'yyyy-MM-dd')}
                  onChange={(event) => setDate(event.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/15"
                />
              </span>
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Mulai
              <span className="relative mt-1.5 block">
                <Clock3 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="time"
                  min="08:00"
                  max="17:30"
                  step="1800"
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/15"
                />
              </span>
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Durasi
              <select
                value={durationHours}
                onChange={(event) => setDurationHours(Number(event.target.value))}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/15"
              >
                {Array.from({ length: 20 }, (_, index) => (index + 1) / 2).map((hours) => (
                  <option key={hours} value={hours}>{hours} jam</option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="font-medium text-slate-700">Waktu penggunaan:</span>
            <span className="text-teal-800">{startTime}–{endTime}</span>
            <span className="text-slate-500">· Perpustakaan buka Senin–Jumat, 08.00–18.00</span>
          </div>

          {!validSchedule && date && (
            <p className="text-sm text-amber-700">Pilih jadwal mendatang pada hari kerja dan dalam jam operasional.</p>
          )}

          {conflicts.length > 0 && (
            <div className="border-l-4 border-amber-500 bg-amber-50 p-4">
              <div className="flex gap-2">
                <AlertTriangle className="h-5 w-5 shrink-0 text-amber-700" />
                <div>
                  <p className="text-sm font-medium text-amber-900">Waktu bertabrakan dengan booking lain.</p>
                  <p className="mt-1 text-xs text-amber-800">Coba salah satu jadwal kosong berikut:</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {suggestedTimes.map((time) => (
                      <button key={time} type="button" onClick={() => setStartTime(time)} className="border border-amber-300 bg-white px-2.5 py-1.5 text-xs text-amber-900 hover:bg-amber-100">
                        {time}–{minutesToTime(Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) + durationHours * 60)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          <label className="block text-sm font-medium text-slate-700">
            Kegiatan
            <textarea
              value={purpose}
              onChange={(event) => setPurpose(event.target.value)}
              rows={3}
              maxLength={500}
              required
              placeholder="Contoh: diskusi kelompok untuk persiapan presentasi"
              className="mt-1.5 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/15"
            />
          </label>

          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}

          <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
            <button type="button" onClick={onClose} className="px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100">Tutup</button>
            <button type="submit" disabled={submitting || !validSchedule || conflicts.length > 0} className="inline-flex items-center gap-2 bg-teal-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-900 disabled:cursor-not-allowed disabled:opacity-50">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Ajukan Booking
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}