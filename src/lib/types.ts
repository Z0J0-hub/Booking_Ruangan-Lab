export type UserRole = 'student' | 'admin';

export type BookingStatus =
  | 'pending'
  | 'approved'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export interface Profile {
  id: string;
  username: string;
  full_name: string;
  email: string;
  role: UserRole;
  phone: string | null;
  student_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Room {
  id: string;
  name: string;
  location: string;
  capacity: number;
  description: string;
  created_at?: string;
  updated_at?: string;
}

export interface Booking {
  id: string;
  user_id: string;
  room_id: string;
  start_time: string;
  end_time: string;
  purpose: string;
  status: BookingStatus;
  cancellation_reason: string | null;
  rejection_reason?: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  room?: Room;
  profile?: Profile;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  changes: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
  profile?: Profile;
}

