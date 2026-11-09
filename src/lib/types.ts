export type UserRole = 'user' | 'admin';
export type MemberType = 'student' | 'employee';

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
  member_type: MemberType;
  phone: string | null;
  student_id: string | null;
  employee_id?: string | null;
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
  checked_in_at?: string | null;
  checkin_token?: string | null;
  auto_approval_reason?: string | null;
  rejection_reason?: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  room?: Room;
  profile?: Partial<Profile> & Pick<Profile, 'full_name'>;
}

export type BookingSchedule = Pick<Booking, 'id' | 'room_id' | 'start_time' | 'end_time' | 'status'>;

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
