-- ImmoCongo: schema fingerprint (read-only). One md5 per area of the database schema.
-- Run it on BOTH databases and compare the two lists; every line should be identical:
--   local:       npm run db:fingerprint
--   production:  Supabase connector `execute_sql` (project nnkrofhjhjyyprqhwbjv) with this whole file.
-- Function bodies are compared without \r, because some production functions were saved with Windows line endings.
select 'columns' k, md5(string_agg(format('%s.%s %s %s %s %s', table_name, column_name, data_type, is_nullable, coalesce(column_default,''), coalesce(identity_generation,'')), E'\n' order by table_name, ordinal_position)) h from information_schema.columns where table_schema='public'
union all select 'constraints', md5(string_agg(conrelid::regclass::text||' '||conname||' '||pg_get_constraintdef(oid), E'\n' order by conrelid::regclass::text, conname)) from pg_constraint where connamespace='public'::regnamespace
union all select 'indexes', md5(string_agg(indexdef, E'\n' order by indexname)) from pg_indexes where schemaname='public'
union all select 'policies', md5(string_agg(format('%s.%s %s %s %s %s %s %s', schemaname, tablename, policyname, permissive, roles, cmd, coalesce(qual,''), coalesce(with_check,'')), E'\n' order by schemaname, tablename, policyname)) from pg_policies where schemaname='public' or (schemaname='storage' and policyname like 'listing_photos%')
union all select 'functions', md5(string_agg(p.proname||' '||pg_get_function_identity_arguments(p.oid)||' '||p.prosecdef||' '||coalesce(p.proconfig::text,'')||' '||replace(pg_get_functiondef(p.oid), E'\r', ''), E'\n' order by p.proname)) from pg_proc p where p.pronamespace='public'::regnamespace
union all select 'func_acl', md5(string_agg(p.proname||' '||coalesce(p.proacl::text,''), E'\n' order by p.proname)) from pg_proc p where p.pronamespace='public'::regnamespace
union all select 'triggers', md5(string_agg(c.relname||' '||t.tgname||' '||t.tgenabled::text||' '||pg_get_triggerdef(t.oid), E'\n' order by c.relname, t.tgname)) from pg_trigger t join pg_class c on c.oid=t.tgrelid where not t.tgisinternal and (c.relnamespace='public'::regnamespace or t.tgname='on_auth_user_created')
union all select 'table_acl_rls', md5(string_agg(relname||' '||relkind::text||' '||relrowsecurity||' '||relforcerowsecurity||' '||coalesce(relacl::text,''), E'\n' order by relname)) from pg_class where relnamespace='public'::regnamespace and relkind in ('r','S','v','m')
union all select 'bucket', md5(string_agg(id||' '||name||' '||public||' '||coalesce(file_size_limit::text,'')||' '||coalesce(allowed_mime_types::text,''), E'\n' order by id)) from storage.buckets
union all select 'publication', md5(string_agg(pubname||' '||schemaname||'.'||tablename, E'\n' order by pubname, tablename)) from pg_publication_tables where pubname='supabase_realtime'
union all select 'replident', md5(string_agg(relname||'='||relreplident::text, ',' order by relname)) from pg_class where relnamespace='public'::regnamespace and relkind='r'
union all select 'types_views', md5(coalesce(string_agg(c.relname||' '||c.relkind::text, ',' order by c.relname), '')) from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('v','m','f','p')
union all select 'extensions', md5(string_agg(extname||' '||extnamespace::regnamespace::text, ',' order by extname)) from pg_extension
order by 1;
