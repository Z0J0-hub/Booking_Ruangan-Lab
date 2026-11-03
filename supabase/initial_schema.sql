-- Fresh Supabase project ONLY. Run once in SQL Editor as postgres.
-- Do not combine this file with library_booking_migration.sql.
-- No DROP/TRUNCATE: existing application tables cause a safe failure.
BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL,
  full_name text NOT NULL,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'admin')),
  phone text,
  student_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  location text NOT NULL CHECK (length(btrim(location)) BETWEEN 1 AND 160),
  capacity integer NOT NULL CHECK (capacity BETWEEN 1 AND 500),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  room_id uuid NOT NULL REFERENCES public.rooms(id),
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  purpose text NOT NULL CHECK (length(btrim(purpose)) BETWEEN 1 AND 500),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'in_progress', 'completed', 'cancelled')),
  cancellation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bookings_room_schedule_check CHECK (
    isfinite(start_time) AND isfinite(end_time)
    AND start_time < end_time
    AND (start_time AT TIME ZONE 'Asia/Jakarta')::date = (end_time AT TIME ZONE 'Asia/Jakarta')::date
    AND EXTRACT(ISODOW FROM (start_time AT TIME ZONE 'Asia/Jakarta')) BETWEEN 1 AND 5
    AND (start_time AT TIME ZONE 'Asia/Jakarta')::time >= TIME '08:00'
    AND (end_time AT TIME ZONE 'Asia/Jakarta')::time <= TIME '18:00'
    AND EXTRACT(MINUTE FROM (start_time AT TIME ZONE 'Asia/Jakarta'))::integer % 30 = 0
    AND EXTRACT(SECOND FROM (start_time AT TIME ZONE 'Asia/Jakarta')) = 0
    AND EXTRACT(EPOCH FROM (end_time - start_time)) >= 1800
    AND MOD(EXTRACT(EPOCH FROM (end_time - start_time)), 1800) = 0
  ),
  CONSTRAINT bookings_cancel_reason_check CHECK (
    status <> 'cancelled' OR NULLIF(btrim(cancellation_reason), '') IS NOT NULL
  ),
  CONSTRAINT bookings_room_time_no_overlap EXCLUDE USING gist (
    room_id WITH =,
    tstzrange(start_time, end_time, '[)') WITH &&
  ) WHERE (status <> 'cancelled')
);

CREATE INDEX bookings_user_start_idx ON public.bookings (user_id, start_time);

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid,
  changes jsonb NOT NULL,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Passwords stay in Supabase Auth. Never trust a role from user metadata.
CREATE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, full_name, email, phone, student_id)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(btrim(NEW.raw_user_meta_data ->> 'username'), ''), NEW.id::text),
    COALESCE(NULLIF(btrim(NEW.raw_user_meta_data ->> 'full_name'), ''), 'Pengguna'),
    COALESCE(NEW.email, ''),
    NULLIF(btrim(NEW.raw_user_meta_data ->> 'phone'), ''),
    NULLIF(btrim(NEW.raw_user_meta_data ->> 'student_id'), '')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Support accounts created before this schema was installed as well.
INSERT INTO public.profiles (id, username, full_name, email, phone, student_id)
SELECT id,
  COALESCE(NULLIF(btrim(raw_user_meta_data ->> 'username'), ''), id::text),
  COALESCE(NULLIF(btrim(raw_user_meta_data ->> 'full_name'), ''), 'Pengguna'),
  COALESCE(email, ''),
  NULLIF(btrim(raw_user_meta_data ->> 'phone'), ''),
  NULLIF(btrim(raw_user_meta_data ->> 'student_id'), '')
FROM auth.users;

CREATE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER rooms_updated_at BEFORE UPDATE ON public.rooms
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER bookings_updated_at BEFORE UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE FUNCTION public.validate_room_booking_future()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF NEW.start_time <= now() THEN
    RAISE EXCEPTION 'Room bookings must start in the future.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

-- Updating status on a past booking does not reschedule it.
CREATE TRIGGER bookings_require_future_room_schedule
BEFORE INSERT OR UPDATE OF room_id, start_time, end_time ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.validate_room_booking_future();

-- SECURITY DEFINER avoids recursive RLS when checking the profiles table.
CREATE FUNCTION public.current_profile_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT role FROM public.profiles WHERE id = (SELECT auth.uid()) LIMIT 1;
$$;

CREATE FUNCTION public.record_booking_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.audit_logs (user_id, action, resource_type, resource_id, changes)
  VALUES (
    auth.uid(), TG_OP, TG_TABLE_NAME, NEW.id,
    jsonb_build_object('before', CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
                       'after', to_jsonb(NEW))
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER bookings_audit AFTER INSERT OR UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.record_booking_audit();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Explicit grants also remove broad Supabase default privileges.
REVOKE ALL ON public.profiles, public.rooms, public.bookings, public.audit_logs
FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON public.profiles, public.rooms, public.bookings, public.audit_logs TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.rooms TO authenticated;
GRANT INSERT ON public.bookings TO authenticated;
GRANT UPDATE (status, cancellation_reason) ON public.bookings TO authenticated;

REVOKE ALL ON FUNCTION public.handle_new_user(), public.set_updated_at(),
  public.validate_room_booking_future(), public.record_booking_audit(),
  public.current_profile_role() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_profile_role() TO authenticated;

CREATE POLICY profiles_select_self_or_admin ON public.profiles
FOR SELECT TO authenticated USING (
  id = (SELECT auth.uid()) OR (SELECT public.current_profile_role()) = 'admin'
);

CREATE POLICY rooms_select_authenticated ON public.rooms
FOR SELECT TO authenticated USING (true);
CREATE POLICY rooms_manage_admin ON public.rooms
FOR ALL TO authenticated
USING ((SELECT public.current_profile_role()) = 'admin')
WITH CHECK ((SELECT public.current_profile_role()) = 'admin');

CREATE POLICY bookings_select_own_or_admin ON public.bookings
FOR SELECT TO authenticated USING (
  user_id = (SELECT auth.uid()) OR (SELECT public.current_profile_role()) = 'admin'
);
CREATE POLICY bookings_insert_own_pending ON public.bookings
FOR INSERT TO authenticated WITH CHECK (
  user_id = (SELECT auth.uid()) AND status = 'pending' AND cancellation_reason IS NULL
);
CREATE POLICY bookings_update_admin ON public.bookings
FOR UPDATE TO authenticated
USING ((SELECT public.current_profile_role()) = 'admin')
WITH CHECK ((SELECT public.current_profile_role()) = 'admin');

CREATE POLICY audit_logs_select_admin ON public.audit_logs
FOR SELECT TO authenticated USING ((SELECT public.current_profile_role()) = 'admin');

COMMIT;
