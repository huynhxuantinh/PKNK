SELECT 'appointments', COUNT(*)::text FROM appointments
UNION ALL SELECT 'branches', COUNT(*)::text FROM branches
UNION ALL SELECT 'branch_services', COUNT(*)::text FROM branch_services
UNION ALL SELECT 'dentists', COUNT(*)::text FROM dentists
UNION ALL SELECT 'organizations', COUNT(*)::text FROM organizations
UNION ALL SELECT 'patient_profiles', COUNT(*)::text FROM patient_profiles
UNION ALL SELECT 'services', COUNT(*)::text FROM services
UNION ALL SELECT 'users', COUNT(*)::text FROM users
UNION ALL SELECT 'public_tables', COUNT(*)::text
FROM pg_tables
WHERE schemaname = 'public'
UNION ALL
SELECT
    'migration_signature',
    md5(string_agg(app || ':' || name, ',' ORDER BY app, name))
FROM django_migrations
UNION ALL
SELECT
    'extension_signature',
    md5(string_agg(extname || ':' || extversion, ',' ORDER BY extname))
FROM pg_extension
ORDER BY 1;
