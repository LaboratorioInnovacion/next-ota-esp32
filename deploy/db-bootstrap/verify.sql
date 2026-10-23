BEGIN READ ONLY;
DO $$
DECLARE
  role_record record;
  table_name text;
  privilege_name text;
BEGIN
  IF current_setting('server_version_num')::integer / 10000 <> 16 THEN
    RAISE EXCEPTION 'Unexpected PostgreSQL major version';
  END IF;
  SELECT * INTO STRICT role_record FROM pg_roles WHERE rolname = 'next_ota_vps_app';
  IF role_record.rolsuper OR role_record.rolcreatedb OR role_record.rolcreaterole
     OR role_record.rolreplication OR role_record.rolbypassrls OR NOT role_record.rolcanlogin THEN
    RAISE EXCEPTION 'Unsafe runtime role';
  END IF;
  IF has_schema_privilege('next_ota_vps_app', 'public', 'CREATE')
     OR has_database_privilege('next_ota_vps_app', current_database(), 'CREATE') THEN
    RAISE EXCEPTION 'Runtime role has DDL privileges';
  END IF;
  IF (SELECT count(*) FROM pg_tables WHERE schemaname = 'public') <> 3 THEN
    RAISE EXCEPTION 'Unexpected table set';
  END IF;
  IF EXISTS (
    WITH expected(table_name, column_name, data_type, is_nullable) AS (VALUES
      ('Station','id','text','NO'), ('Station','mac','text','NO'),
      ('Station','name','text','NO'), ('Station','status','text','NO'),
      ('Station','latitude','double precision','YES'), ('Station','longitude','double precision','YES'),
      ('Station','createdAt','timestamp without time zone','NO'), ('Station','updatedAt','timestamp without time zone','NO'),
      ('Station','diagnosticBootId','text','YES'), ('Station','diagnosticUptimeMs','double precision','YES'),
      ('Station','firmwareVersion','text','YES'), ('Station','lastSeenAt','timestamp without time zone','YES'),
      ('Station','sensorErrorCode','text','YES'), ('Station','sensorStatus','text','YES'),
      ('Reading','id','text','NO'), ('Reading','stationId','text','NO'),
      ('Reading','temperature','double precision','NO'), ('Reading','humidity','double precision','NO'),
      ('Reading','timestamp','timestamp without time zone','NO'),
      ('Diagnostic','id','text','NO'), ('Diagnostic','stationId','text','NO'),
      ('Diagnostic','bootId','text','NO'), ('Diagnostic','uptimeMs','double precision','NO'),
      ('Diagnostic','sensorStatus','text','NO'), ('Diagnostic','errorCode','text','NO'),
      ('Diagnostic','version','text','NO'), ('Diagnostic','receivedAt','timestamp without time zone','NO')
    ), actual AS (
      SELECT c.table_name::text, c.column_name::text, c.data_type::text, c.is_nullable::text
      FROM information_schema.columns c WHERE c.table_schema = 'public'
    )
    (SELECT * FROM expected EXCEPT SELECT * FROM actual)
    UNION ALL (SELECT * FROM actual EXCEPT SELECT * FROM expected)
  ) THEN
    RAISE EXCEPTION 'Unexpected column definitions';
  END IF;
  FOREACH table_name IN ARRAY ARRAY['Station','Reading','Diagnostic'] LOOP
    FOREACH privilege_name IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
      IF NOT has_table_privilege('next_ota_vps_app', format('%I', table_name), privilege_name) THEN
        RAISE EXCEPTION 'Missing runtime table privilege';
      END IF;
    END LOOP;
    IF has_table_privilege('next_ota_vps_app', format('%I', table_name), 'TRUNCATE') THEN
      RAISE EXCEPTION 'Unexpected runtime table privileges';
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public') <> 9
     OR (SELECT count(*) FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND contype = 'f' AND confdeltype = 'c' AND confupdtype = 'c') <> 2 THEN
    RAISE EXCEPTION 'Unexpected indexes or foreign keys';
  END IF;
  IF EXISTS (
    WITH expected(relation_name, index_name, unique_index, primary_index, columns) AS (VALUES
      ('Station','Station_pkey',true,true,'id'),
      ('Station','Station_mac_key',true,false,'mac'),
      ('Station','Station_mac_idx',false,false,'mac'),
      ('Reading','Reading_pkey',true,true,'id'),
      ('Reading','Reading_stationId_timestamp_idx',false,false,'stationId,timestamp'),
      ('Reading','Reading_timestamp_idx',false,false,'timestamp'),
      ('Diagnostic','Diagnostic_pkey',true,true,'id'),
      ('Diagnostic','Diagnostic_stationId_receivedAt_idx',false,false,'stationId,receivedAt'),
      ('Diagnostic','Diagnostic_stationId_bootId_uptimeMs_key',true,false,'stationId,bootId,uptimeMs')
    ), actual AS (
      SELECT t.relname::text, i.relname::text, ix.indisunique, ix.indisprimary,
             string_agg(a.attname, ',' ORDER BY k.position)
      FROM pg_index ix JOIN pg_class t ON t.oid = ix.indrelid
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY k(attribute_number, position) ON true
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attribute_number
      WHERE t.relnamespace = 'public'::regnamespace
      GROUP BY t.relname, i.relname, ix.indisunique, ix.indisprimary
    )
    (SELECT * FROM expected EXCEPT SELECT * FROM actual)
    UNION ALL (SELECT * FROM actual EXCEPT SELECT * FROM expected)
  ) OR EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.data_type = 'timestamp without time zone'
      AND c.datetime_precision <> 3
  ) THEN
    RAISE EXCEPTION 'Unexpected index definitions or timestamp precision';
  END IF;
END $$;
ROLLBACK;
