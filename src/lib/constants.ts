import type { BookingStatus } from './types';

export const BOOKING_STATUS_CONFIG: Record<
  BookingStatus,
  { label: string; bgColor: string; textColor: string; dot: string }
> = {
  pending: {
    label: 'Menunggu',
    bgColor: 'bg-amber-50',
    textColor: 'text-amber-700',
    dot: 'bg-amber-500',
  },
  approved: {
    label: 'Disetujui',
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-700',
    dot: 'bg-blue-500',
  },
  in_progress: {
    label: 'Berlangsung',
    bgColor: 'bg-indigo-50',
    textColor: 'text-indigo-700',
    dot: 'bg-indigo-500',
  },
  completed: {
    label: 'Selesai',
    bgColor: 'bg-emerald-50',
    textColor: 'text-emerald-700',
    dot: 'bg-emerald-500',
  },
  cancelled: {
    label: 'Dibatalkan',
    bgColor: 'bg-gray-100',
    textColor: 'text-gray-500',
    dot: 'bg-gray-400',
  },
};

export const BOOKING_STATUS_FLOW: BookingStatus[] = [
  'pending',
  'approved',
  'in_progress',
  'completed',
];
