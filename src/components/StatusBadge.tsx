import type { BookingStatus } from '@/lib/types';
import { BOOKING_STATUS_CONFIG } from '@/lib/constants';

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  const config = BOOKING_STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.bgColor} ${config.textColor}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}
