BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE public.rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  location text NOT NULL,
  capacity integer NOT NULL CHECK (capacity > 0),
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bookings
  RENAME COLUMN equipment_id TO legacy_equipment_id;

ALTER TABLE public.bookings
  ALTER COLUMN legacy_equipment_id DROP NOT NULL,
  ADD COLUMN room_id uuid REFERENCES public.rooms(id),
  ADD COLUMN cancellation_reason text;

UPDATE public.bookings
SET cancellation_reason = COALESCE(NULLIF(BTRIM(rejection_reason), ''), 'Dibatalkan sebelum sistem perpustakaan diterapkan.')
WHERE status = 'cancelled';

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_room_schedule_check CHECK (
    room_id IS NULL OR (
      start_time < end_time
      AND EXTRACT(ISODOW FROM (start_time AT TIME ZONE 'Asia/Jakarta')) BETWEEN 1 AND 5
      AND (start_time AT TIME ZONE 'Asia/Jakarta')::time >= TIME '08:00'
      AND (end_time AT TIME ZONE 'Asia/Jakarta')::time <= TIME '18:00'
      AND EXTRACT(MINUTE FROM (start_time AT TIME ZONE 'Asia/Jakarta'))::integer % 30 = 0
      AND EXTRACT(SECOND FROM (start_time AT TIME ZONE 'Asia/Jakarta')) = 0
      AND EXTRACT(EPOCH FROM (end_time - start_time)) >= 1800
      AND MOD(EXTRACT(EPOCH FROM (end_time - start_time)), 1800) = 0
    )
  ),
  ADD CONSTRAINT bookings_cancel_reason_check CHECK (
    status <> 'cancelled' OR NULLIF(BTRIM(cancellation_reason), '') IS NOT NULL
  ),
  ADD CONSTRAINT bookings_room_time_no_overlap
    EXCLUDE USING gist (
      room_id WITH =,
      tstzrange(start_time, end_time, '[)') WITH &&
    )
    WHERE (room_id IS NOT NULL AND status <> 'cancelled');

CREATE OR REPLACE FUNCTION public.validate_room_booking_future()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.room_id IS NOT NULL AND NEW.start_time <= now() THEN
    RAISE EXCEPTION 'Room bookings must start in the future.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER bookings_require_future_room_schedule
BEFORE INSERT OR UPDATE OF room_id, start_time, end_time
ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.validate_room_booking_future();

CREATE OR REPLACE FUNCTION public.current_profile_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT role::text
  FROM public.profiles
  WHERE id = (SELECT auth.uid())
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.current_profile_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_profile_role() TO authenticated;

DO $$
DECLARE
  existing_policy record;
BEGIN
  FOR existing_policy IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND cmd IN ('SELECT', 'ALL')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.profiles', existing_policy.policyname);
  END LOOP;

  FOR existing_policy IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'bookings'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.bookings', existing_policy.policyname);
  END LOOP;
END;
$$;

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select_self_or_admin
ON public.profiles
FOR SELECT
TO authenticated
USING (
  id = (SELECT auth.uid())
  OR (SELECT public.current_profile_role()) = 'admin'
);

CREATE POLICY rooms_select_authenticated
ON public.rooms
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY rooms_manage_admin
ON public.rooms
FOR ALL
TO authenticated
USING ((SELECT public.current_profile_role()) = 'admin')
WITH CHECK ((SELECT public.current_profile_role()) = 'admin');

CREATE POLICY bookings_select_own_or_admin
ON public.bookings
FOR SELECT
TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR (SELECT public.current_profile_role()) = 'admin'
);

CREATE POLICY bookings_insert_own_pending
ON public.bookings
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = (SELECT auth.uid())
  AND room_id IS NOT NULL
  AND status = 'pending'
  AND cancellation_reason IS NULL
);

CREATE POLICY bookings_update_admin
ON public.bookings
FOR UPDATE
TO authenticated
USING ((SELECT public.current_profile_role()) = 'admin')
WITH CHECK ((SELECT public.current_profile_role()) = 'admin');

GRANT SELECT ON public.rooms TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.rooms TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.bookings TO authenticated;

COMMIT;