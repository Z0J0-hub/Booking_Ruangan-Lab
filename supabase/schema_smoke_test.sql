-- Run as postgres in a DEVELOPMENT Supabase SQL Editor after initial_schema.sql.
-- All fixtures are rolled back. On any failure, run ROLLBACK manually.
BEGIN;

SELECT set_config('test.student_a', gen_random_uuid()::text, true);
SELECT set_config('test.student_b', gen_random_uuid()::text, true);
SELECT set_config('test.admin', gen_random_uuid()::text, true);
SELECT set_config('test.room', gen_random_uuid()::text, true);
SELECT set_config('test.booking', gen_random_uuid()::text, true);
-- Next Monday at 09:00 WIB is always in the future.
SELECT set_config('test.start', (
  (date_trunc('week', now() AT TIME ZONE 'Asia/Jakarta') + interval '7 days 9 hours')
  AT TIME ZONE 'Asia/Jakarta'
)::text, true);

INSERT INTO auth.users (id, email, raw_user_meta_data)
SELECT current_setting('test.student_a')::uuid, 'test-a-' || current_setting('test.student_a') || '@example.invalid',
  '{"username":"test_a","full_name":"Student A","role":"admin"}'::jsonb
UNION ALL
SELECT current_setting('test.student_b')::uuid, 'test-b-' || current_setting('test.student_b') || '@example.invalid',
  '{"username":"test_b","full_name":"Student B"}'::jsonb
UNION ALL
SELECT current_setting('test.admin')::uuid, 'test-admin-' || current_setting('test.admin') || '@example.invalid',
  '{"username":"test_admin","full_name":"Admin"}'::jsonb;

DO $$
BEGIN
  IF (SELECT role FROM public.profiles WHERE id = current_setting('test.student_a')::uuid)
      IS DISTINCT FROM 'student' THEN
    RAISE EXCEPTION 'FAIL: signup metadata must not assign admin privileges';
  END IF;
END;
$$;

UPDATE public.profiles SET role = 'admin' WHERE id = current_setting('test.admin')::uuid;
INSERT INTO public.rooms (id, name, location, capacity)
VALUES (current_setting('test.room')::uuid, 'Test room', 'Test floor', 4);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.student_a'), true);

INSERT INTO public.bookings (id, user_id, room_id, start_time, end_time, purpose)
VALUES (
  current_setting('test.booking')::uuid,
  auth.uid(), current_setting('test.room')::uuid,
  current_setting('test.start')::timestamptz,
  current_setting('test.start')::timestamptz + interval '1 hour', 'Test booking'
);

DO $$
DECLARE affected integer;
BEGIN
  IF (SELECT count(*) FROM public.profiles) <> 1 THEN
    RAISE EXCEPTION 'FAIL: student can read other profiles';
  END IF;
  BEGIN
    UPDATE public.profiles SET role = 'admin' WHERE id = auth.uid();
    RAISE EXCEPTION 'FAIL: student can promote their own role';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE public.bookings SET status = 'approved' WHERE id = current_setting('test.booking')::uuid;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'FAIL: student can approve booking'; END IF;
  BEGIN
    INSERT INTO public.rooms (name, location, capacity) VALUES ('Unauthorized', 'Test', 2);
    RAISE EXCEPTION 'FAIL: student can create rooms';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

SELECT set_config('request.jwt.claim.sub', current_setting('test.student_b'), true);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.bookings WHERE id = current_setting('test.booking')::uuid) THEN
    RAISE EXCEPTION 'FAIL: student can read another student booking';
  END IF;
  BEGIN
    INSERT INTO public.bookings (user_id, room_id, start_time, end_time, purpose)
    VALUES (auth.uid(), current_setting('test.room')::uuid,
      current_setting('test.start')::timestamptz + interval '30 minutes',
      current_setting('test.start')::timestamptz + interval '90 minutes', 'Overlap');
    RAISE EXCEPTION 'FAIL: overlapping booking accepted';
  EXCEPTION WHEN exclusion_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.bookings (user_id, room_id, start_time, end_time, purpose)
    VALUES (current_setting('test.student_a')::uuid, current_setting('test.room')::uuid,
      current_setting('test.start')::timestamptz + interval '2 hours',
      current_setting('test.start')::timestamptz + interval '3 hours', 'Impersonation');
    RAISE EXCEPTION 'FAIL: student can book for someone else';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.bookings (user_id, room_id, start_time, end_time, purpose)
    VALUES (auth.uid(), current_setting('test.room')::uuid,
      current_setting('test.start')::timestamptz + interval '7 hours',
      current_setting('test.start')::timestamptz + interval '1 day 1 hour', 'Across days');
    RAISE EXCEPTION 'FAIL: multi-day booking accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.bookings (user_id, room_id, start_time, end_time, purpose)
    VALUES (auth.uid(), current_setting('test.room')::uuid,
      now() - interval '2 hours', now() - interval '1 hour', 'Past booking');
    RAISE EXCEPTION 'FAIL: past booking accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END;
$$;

-- Adjacent bookings must remain valid.
INSERT INTO public.bookings (user_id, room_id, start_time, end_time, purpose)
VALUES (auth.uid(), current_setting('test.room')::uuid,
  current_setting('test.start')::timestamptz + interval '1 hour',
  current_setting('test.start')::timestamptz + interval '2 hours', 'Adjacent');

SELECT set_config('request.jwt.claim.sub', current_setting('test.admin'), true);
DO $$
DECLARE affected integer;
BEGIN
  UPDATE public.bookings SET status = 'approved' WHERE id = current_setting('test.booking')::uuid;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'FAIL: admin cannot approve booking'; END IF;
  BEGIN
    UPDATE public.bookings SET status = 'cancelled' WHERE id = current_setting('test.booking')::uuid;
    RAISE EXCEPTION 'FAIL: cancellation without reason accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  UPDATE public.bookings SET status = 'cancelled', cancellation_reason = 'Test cancellation'
  WHERE id = current_setting('test.booking')::uuid;
  IF (SELECT count(*) FROM public.audit_logs WHERE resource_id = current_setting('test.booking')::uuid) <> 3 THEN
    RAISE EXCEPTION 'FAIL: booking audit records missing';
  END IF;
  BEGIN
    DELETE FROM public.audit_logs WHERE resource_id = current_setting('test.booking')::uuid;
    RAISE EXCEPTION 'FAIL: client can delete audit logs';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

-- The cancelled slot can be reused.
SELECT set_config('request.jwt.claim.sub', current_setting('test.student_b'), true);
INSERT INTO public.bookings (user_id, room_id, start_time, end_time, purpose)
VALUES (auth.uid(), current_setting('test.room')::uuid,
  current_setting('test.start')::timestamptz,
  current_setting('test.start')::timestamptz + interval '1 hour', 'Reused slot');

SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM 1 FROM public.rooms;
    RAISE EXCEPTION 'FAIL: unauthenticated access allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

RESET ROLE;
ROLLBACK;
SELECT 'PASS: schema access, signup, schedule, conflicts, and audit checks' AS result;
