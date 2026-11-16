import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/features/auth';
import type { Booking, Room } from '@/lib/types';
import { RoomBookingModal } from '@/components/RoomBookingModal';
import { Modal } from '@/components/Modal';
import { DoorOpen, MapPin, Plus, Users, Pencil, Loader2 } from 'lucide-react';

export function RoomsPage() {
  const { user } = useAuthStore();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [showRoomEditor, setShowRoomEditor] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    void fetchRooms();
  }, []);

  const fetchRooms = async () => {
    setLoading(true);
    const [roomResult, bookingResult] = await Promise.all([
      supabase.from('rooms').select('*').order('name'),
      supabase.from('bookings').select('*').not('room_id', 'is', null).neq('status', 'cancelled').order('start_time'),
    ]);
    if (roomResult.error) setError(roomResult.error.message);
    else setError('');
    setRooms((roomResult.data as Room[] | null) || []);
    setBookings((bookingResult.data as Booking[] | null) || []);
    setLoading(false);
  };

  const saveRoom = async (roomData: Pick<Room, 'name' | 'location' | 'capacity' | 'description'>) => {
    const result = editingRoom
      ? await supabase.from('rooms').update(roomData).eq('id', editingRoom.id)
      : await supabase.from('rooms').insert(roomData);
    if (result.error) return result.error.message;
    setShowRoomEditor(false);
    setEditingRoom(null);
    await fetchRooms();
    return null;
  };

  return (
    <div className="mx-auto max-w-7xl space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-800">Ruang perpustakaan</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Pilih ruangan</h1>
          <p className="mt-1 text-sm text-slate-600">Pilih ruang, tentukan waktu dan durasi, lalu jelaskan kegiatan Anda.</p>
        </div>
        {isAdmin && (
          <button onClick={() => { setEditingRoom(null); setShowRoomEditor(true); }} className="inline-flex items-center gap-2 bg-teal-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-900">
            <Plus className="h-4 w-4" /> Tambah Ruangan
          </button>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-600">
        <span className="inline-flex items-center gap-2"><DoorOpen className="h-4 w-4 text-teal-800" /> Booking per ruangan</span>
        <span>Senin–Jumat</span>
        <span>08.00–18.00</span>
      </div>

      {error && <p role="alert" className="border-l-4 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}

      {loading ? (
        <div className="flex items-center gap-2 py-12 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Memuat ruangan...</div>
      ) : rooms.length === 0 ? (
        <div className="border-y border-slate-200 py-14 text-center">
          <DoorOpen className="mx-auto h-9 w-9 text-slate-400" />
          <h2 className="mt-3 font-semibold text-slate-900">Belum ada ruangan</h2>
          <p className="mt-1 text-sm text-slate-500">{isAdmin ? 'Tambahkan ruangan agar mahasiswa dapat mulai booking.' : 'Silakan hubungi administrator perpustakaan.'}</p>
        </div>
      ) : (
        <div className="grid gap-x-8 gap-y-0 md:grid-cols-2">
          {rooms.map((room) => {
            const roomBookings = bookings.filter((booking) => booking.room_id === room.id);
            return (
              <article key={room.id} className="border-b border-slate-200 py-6 first:pt-0 md:[&:nth-child(-n+2)]:pt-0">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center bg-teal-50 text-teal-900"><DoorOpen className="h-5 w-5" /></div>
                    <div>
                      <h2 className="font-semibold text-slate-900">{room.name}</h2>
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500"><MapPin className="h-3.5 w-3.5" />{room.location}</p>
                    </div>
                  </div>
                  {isAdmin && (
                    <button title="Edit ruangan" onClick={() => { setEditingRoom(room); setShowRoomEditor(true); }} className="p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"><Pencil className="h-4 w-4" /></button>
                  )}
                </div>
                <p className="mt-4 min-h-10 text-sm leading-5 text-slate-600">{room.description || 'Ruang belajar dan diskusi.'}</p>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-1.5 text-sm text-slate-500"><Users className="h-4 w-4" /> Kapasitas {room.capacity} orang</span>
                  <span className="text-sm text-slate-500">{roomBookings.length} jadwal tercatat</span>
                </div>
                <button onClick={() => setSelectedRoom(room)} className="mt-4 w-full border border-teal-800 px-4 py-2.5 text-sm font-semibold text-teal-900 hover:bg-teal-800 hover:text-white">Pilih Jadwal</button>
              </article>
            );
          })}
        </div>
      )}

      {selectedRoom && (
        <RoomBookingModal
          open={!!selectedRoom}
          onClose={() => setSelectedRoom(null)}
          room={selectedRoom}
          existingBookings={bookings.filter((booking) => booking.room_id === selectedRoom.id)}
          onBooked={() => { setSelectedRoom(null); void fetchRooms(); }}
        />
      )}

      {showRoomEditor && (
        <RoomEditorModal
          room={editingRoom}
          onClose={() => { setShowRoomEditor(false); setEditingRoom(null); }}
          onSave={saveRoom}
        />
      )}
    </div>
  );
}

function RoomEditorModal({ room, onClose, onSave }: { room: Room | null; onClose: () => void; onSave: (data: Pick<Room, 'name' | 'location' | 'capacity' | 'description'>) => Promise<string | null> }) {
  const [name, setName] = useState(room?.name || '');
  const [location, setLocation] = useState(room?.location || '');
  const [capacity, setCapacity] = useState(String(room?.capacity || 1));
  const [description, setDescription] = useState(room?.description || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const message = await onSave({ name: name.trim(), location: location.trim(), capacity: Number(capacity), description: description.trim() });
    setSaving(false);
    if (message) setError(message);
  };

  return (
    <Modal open onClose={onClose} title={room ? 'Ubah Ruangan' : 'Tambah Ruangan'} size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block text-sm font-medium text-slate-700">Nama ruangan<input required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} className="mt-1.5 w-full border border-slate-300 px-3 py-2.5 font-normal" /></label>
        <label className="block text-sm font-medium text-slate-700">Lokasi<input required maxLength={160} value={location} onChange={(event) => setLocation(event.target.value)} className="mt-1.5 w-full border border-slate-300 px-3 py-2.5 font-normal" /></label>
        <label className="block text-sm font-medium text-slate-700">Kapasitas<input type="number" min="1" max="500" required value={capacity} onChange={(event) => setCapacity(event.target.value)} className="mt-1.5 w-full border border-slate-300 px-3 py-2.5 font-normal" /></label>
        <label className="block text-sm font-medium text-slate-700">Keterangan<textarea maxLength={500} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1.5 w-full border border-slate-300 px-3 py-2.5 font-normal" /></label>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
          <button type="button" onClick={onClose} className="px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">Batal</button>
          <button disabled={saving} className="inline-flex items-center gap-2 bg-teal-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{saving && <Loader2 className="h-4 w-4 animate-spin" />}Simpan</button>
        </div>
      </form>
    </Modal>
  );
}