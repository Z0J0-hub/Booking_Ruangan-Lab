// Only fixed, reviewed SQL belongs here. Never interpolate credentials or user input.
const fail = "RAISE EXCEPTION USING ERRCODE = 'P7501', MESSAGE = 'STRIDE expectation not met'";
const id = (name) => `current_setting('stride.${name}')::uuid`;
const start = "current_setting('stride.start')::timestamptz";

function actor(name) {
  const subject = name ? id(name) + '::text' : "''";
  const claims = name ? `jsonb_build_object('sub', ${id(name)}, 'role', 'authenticated')::text` : "'{}'";
  return `SET LOCAL ROLE ${name ? 'authenticated' : 'anon'};
    SELECT set_config('request.jwt.claim.sub', ${subject}, true);
    SELECT set_config('request.jwt.claims', ${claims}, true);
    DO $check$ BEGIN
      IF current_user <> '${name ? 'authenticated' : 'anon'}' OR
        ${name ? `auth.uid() IS DISTINCT FROM ${id(name)}` : 'auth.uid() IS NOT NULL'} THEN ${fail}; END IF;
    END $check$;`;
}

function assertSql(condition) {
  return `DO $check$ BEGIN IF (${condition}) IS NOT TRUE THEN ${fail}; END IF; END $check$;`;
}

function denyWrite(sql) {
  return `DO $check$ DECLARE affected integer := 0; BEGIN
    BEGIN ${sql}; GET DIAGNOSTICS affected = ROW_COUNT;
    EXCEPTION WHEN insufficient_privilege THEN affected := 0; END;
    IF affected <> 0 THEN ${fail}; END IF;
  END $check$;`;
}

function hidden(table, where) {
  return `DO $check$ DECLARE visible integer; BEGIN
    BEGIN
      SELECT count(*) INTO visible FROM public.${table} WHERE ${where};
      IF visible <> 0 THEN ${fail}; END IF;
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  END $check$;`;
}

function reject(sql, exception) {
  return `DO $check$ BEGIN
    BEGIN ${sql}; ${fail};
    EXCEPTION WHEN ${exception} THEN NULL; END;
  END $check$;`;
}

function booking(user, offset = 4, bookingId = 'case_booking') {
  return `INSERT INTO public.bookings (id, user_id, room_id, start_time, end_time, purpose)
    VALUES (${id(bookingId)}, ${id(user)}, ${id('room')},
      ${start} + interval '${offset} hours', ${start} + interval '${offset + 1} hours', 'STRIDE synthetic booking')`;
}

export const preflightSql = `DO $check$ BEGIN
  IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname IN ('profiles', 'rooms', 'bookings', 'audit_logs')
      AND c.relkind = 'r' AND c.relrowsecurity
      AND (pg_get_userbyid(c.relowner) NOT IN ('authenticated', 'anon') OR c.relforcerowsecurity)) <> 4
    THEN ${fail}; END IF;
  IF (SELECT count(*) FROM pg_roles WHERE rolname IN ('authenticated', 'anon')
      AND NOT rolsuper AND NOT rolbypassrls) <> 2 THEN ${fail}; END IF;
END $check$;`;

export const setupSql = `
  INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
    (${id('user_a')}, 'stride-a-' || ${id('user_a')}::text || '@example.invalid',
      jsonb_build_object('username', 'stride_a_' || ${id('user_a')}::text, 'full_name', 'STRIDE Student A', 'role', 'admin')),
    (${id('user_b')}, 'stride-b-' || ${id('user_b')}::text || '@example.invalid',
      jsonb_build_object('username', 'stride_b_' || ${id('user_b')}::text, 'full_name', 'STRIDE Student B')),
    (${id('admin')}, 'stride-admin-' || ${id('admin')}::text || '@example.invalid',
      jsonb_build_object('username', 'stride_admin_' || ${id('admin')}::text, 'full_name', 'STRIDE Admin'));
  UPDATE public.profiles SET role = 'admin' WHERE id = ${id('admin')};
  INSERT INTO public.rooms (id, name, location, capacity)
    VALUES (${id('room')}, 'STRIDE isolated room', 'STRIDE fixture', 4);
  SELECT set_config('stride.start', (
    (date_trunc('week', now() AT TIME ZONE 'Asia/Jakarta') + interval '7 days 9 hours')
    AT TIME ZONE 'Asia/Jakarta')::text, true);
  ${actor('user_a')}
  ${booking('user_a', 0, 'booking_a')};
  ${actor('user_b')}
  ${booking('user_b', 2, 'booking_b')};
  RESET ROLE;
  SELECT set_config('request.jwt.claim.sub', '', true);
  SELECT set_config('request.jwt.claims', '{}', true);
`;

export const scenarios = [
  {
    id: 'E-01-signup-role', category: 'Elevation of Privilege',
    name: 'Signup metadata cannot create an admin profile',
    sql: assertSql(`(SELECT role FROM public.profiles WHERE id = ${id('user_a')}) IS NOT DISTINCT FROM 'student'`),
  },
  {
    id: 'E-01-self-role', category: 'Elevation of Privilege',
    name: 'Student cannot promote their own role',
    sql: actor('user_a') + denyWrite(`UPDATE public.profiles SET role = 'admin' WHERE id = ${id('user_a')}`) +
      assertSql(`(SELECT role FROM public.profiles WHERE id = ${id('user_a')}) IS NOT DISTINCT FROM 'student'`),
  },
  {
    id: 'E-01-create-room', category: 'Elevation of Privilege',
    name: 'Student cannot create a room',
    sql: actor('user_a') + reject(`INSERT INTO public.rooms (id, name, location, capacity)
      VALUES (${id('case_room')}, 'Unauthorized fixture', 'STRIDE', 2)`, 'insufficient_privilege'),
  },
  {
    id: 'I-01-isolation', category: 'Information Disclosure',
    name: 'Student sees own profile/booking but not another student data',
    sql: actor('user_b') +
      assertSql(`(SELECT count(*) FROM public.profiles WHERE id = ${id('user_b')}) = 1`) +
      assertSql(`(SELECT count(*) FROM public.bookings WHERE id = ${id('booking_b')}) = 1`) +
      hidden('profiles', `id = ${id('user_a')}`) + hidden('bookings', `id = ${id('booking_a')}`),
  },
  {
    id: 'I-01-audit', category: 'Information Disclosure',
    name: 'Student cannot read booking audit events',
    sql: actor('user_a') + hidden('audit_logs', `resource_id = ${id('booking_a')}`),
  },
  {
    id: 'I-01-anonymous', category: 'Information Disclosure',
    name: 'Anonymous role cannot see fixture rooms, profiles, bookings, or audit events',
    sql: actor(null) + hidden('profiles', `id = ${id('user_a')}`) +
      hidden('rooms', `id = ${id('room')}`) + hidden('bookings', `id = ${id('booking_a')}`) +
      hidden('audit_logs', `resource_id = ${id('booking_a')}`),
  },
  {
    id: 'T-01-owner', category: 'Tampering',
    name: 'Student cannot insert a booking for another student',
    sql: actor('user_a') + reject(booking('user_b'), 'insufficient_privilege'),
  },
  {
    id: 'T-01-status', category: 'Tampering',
    name: 'Student cannot approve own booking',
    sql: actor('user_a') + denyWrite(`UPDATE public.bookings SET status = 'approved' WHERE id = ${id('booking_a')}`) +
      assertSql(`(SELECT status FROM public.bookings WHERE id = ${id('booking_a')}) IS NOT DISTINCT FROM 'pending'`),
  },
  {
    id: 'E-01-admin-control', category: 'Elevation of Privilege',
    name: 'Admin can read student bookings, create/edit room, and approve booking',
    sql: actor('admin') + assertSql(`(SELECT count(*) FROM public.bookings WHERE id IN (${id('booking_a')}, ${id('booking_b')})) = 2`) +
      `INSERT INTO public.rooms (id, name, location, capacity) VALUES (${id('case_room')}, 'Admin fixture', 'STRIDE', 4);` +
      `UPDATE public.rooms SET capacity = 5 WHERE id = ${id('case_room')};` +
      assertSql(`(SELECT capacity FROM public.rooms WHERE id = ${id('case_room')}) = 5`) +
      `UPDATE public.bookings SET status = 'approved' WHERE id = ${id('booking_a')};` +
      assertSql(`(SELECT status FROM public.bookings WHERE id = ${id('booking_a')}) IS NOT DISTINCT FROM 'approved'`),
  },
  {
    id: 'R-01-evidence', category: 'Repudiation',
    name: 'Booking audit captures student/admin actor, time, and before/after status',
    sql: actor('user_a') + booking('user_a') + ';' + actor('admin') +
      `UPDATE public.bookings SET status = 'approved' WHERE id = ${id('case_booking')};` +
      assertSql(`(SELECT count(*) FROM public.audit_logs WHERE resource_id = ${id('case_booking')}
        AND user_id = ${id('user_a')} AND action = 'INSERT' AND resource_type = 'bookings'
        AND created_at IS NOT NULL AND changes->'before' = 'null'::jsonb
        AND changes->'after'->>'status' = 'pending') = 1`) +
      assertSql(`(SELECT count(*) FROM public.audit_logs WHERE resource_id = ${id('case_booking')}
        AND user_id = ${id('admin')} AND action = 'UPDATE' AND resource_type = 'bookings'
        AND created_at IS NOT NULL AND changes->'before'->>'status' = 'pending'
        AND changes->'after'->>'status' = 'approved') = 1`),
  },
  {
    id: 'R-01-immutable', category: 'Repudiation',
    name: 'Application admin cannot modify or delete audit events',
    sql: actor('admin') + assertSql(`(SELECT count(*) FROM public.audit_logs WHERE resource_id = ${id('booking_a')}) = 1`) +
      denyWrite(`UPDATE public.audit_logs SET action = 'tampered' WHERE resource_id = ${id('booking_a')}`) +
      denyWrite(`DELETE FROM public.audit_logs WHERE resource_id = ${id('booking_a')}`) +
      assertSql(`(SELECT count(*) FROM public.audit_logs WHERE resource_id = ${id('booking_a')} AND action = 'INSERT') = 1`),
  },
  {
    id: 'T-02-overlap', category: 'Tampering',
    name: 'Database rejects overlap with a booking hidden by RLS',
    sql: actor('user_b') + reject(`INSERT INTO public.bookings (user_id, room_id, start_time, end_time, purpose)
      VALUES (${id('user_b')}, ${id('room')}, ${start} + interval '30 minutes',
        ${start} + interval '90 minutes', 'STRIDE overlap')`, 'exclusion_violation'),
  },
  {
    id: 'T-02-past', category: 'Tampering',
    name: 'Database rejects a past booking within otherwise valid opening hours',
    sql: actor('user_a') + reject(`INSERT INTO public.bookings (user_id, room_id, start_time, end_time, purpose)
      VALUES (${id('user_a')}, ${id('room')}, ${start} - interval '14 days',
        ${start} - interval '14 days' + interval '1 hour', 'STRIDE past booking')`, 'check_violation'),
  },
  {
    id: 'T-02-cancel-reason', category: 'Tampering',
    name: 'Database rejects cancellation without a reason',
    sql: actor('admin') + reject(`UPDATE public.bookings SET status = 'cancelled', cancellation_reason = NULL
      WHERE id = ${id('booking_a')}`, 'check_violation'),
  },
];
