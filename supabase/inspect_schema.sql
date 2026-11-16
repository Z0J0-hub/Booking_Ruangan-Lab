-- Read-only inventory for an existing Supabase project. Run in SQL Editor.
-- No credentials, user rows, migrations, or writes are accessed here.
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
  AND c.relname IN ('profiles', 'rooms', 'bookings', 'audit_logs')
ORDER BY c.relname;

SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('profiles', 'rooms', 'bookings', 'audit_logs')
ORDER BY table_name, ordinal_position;

SELECT tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('profiles', 'rooms', 'bookings', 'audit_logs')
ORDER BY tablename, policyname;

SELECT event_object_schema, event_object_table, trigger_name,
       event_manipulation, action_timing, action_statement
FROM information_schema.triggers
WHERE (event_object_schema = 'public' AND event_object_table IN ('profiles', 'rooms', 'bookings'))
   OR (event_object_schema = 'auth' AND event_object_table = 'users')
ORDER BY event_object_schema, event_object_table, trigger_name;
