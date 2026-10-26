/**
 * Run the SQL permission suites in disposable PostgreSQL (PGlite).
 * The runtime is installed outside the repository; no application dependency or
 * connection to Supabase Cloud/NAS is needed. See docs/team-administrators.md.
 */
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

if (!process.argv[2]) {
  throw new Error('Usage: node supabase/tests/run-permission-tests.mjs /absolute/path/to/@electric-sql/pglite [test.sql ...]');
}
const runtime = resolve(process.argv[2]);
const { PGlite } = await import(pathToFileURL(join(runtime, 'dist/index.js')).href);
const { pgcrypto } = await import(pathToFileURL(join(runtime, 'dist/contrib/pgcrypto.js')).href);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const tests = process.argv.slice(3);
if (tests.some((name) => !/^[a-z_]+\.sql$/.test(name))) throw new Error('Use SQL test filenames from supabase/tests.');
if (!tests.length) tests.push('team_administrators.sql', 'team_library_permissions.sql', 'team_invite_inbox.sql');
const db = new PGlite({ extensions: { pgcrypto } });
try {
  // Minimal Supabase identity context, with real database roles, RLS, triggers,
  // SECURITY DEFINER execution, and PostgreSQL JSON behavior under test.
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users (
      id uuid primary key, email text, aud text, role text, encrypted_password text,
      email_confirmed_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb,
      created_at timestamptz, updated_at timestamptz
    );
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;
    create function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)
    $$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    alter default privileges in schema public grant all on tables to authenticated,service_role;
    alter default privileges in schema public grant usage,select on sequences to authenticated,service_role;
  `);
  const migrations = (await readdir(join(root, 'supabase/migrations'))).filter((name) => name.endsWith('.sql')).sort();
  // These historic filenames predate the current naming convention. Respect
  // their actual dependencies without changing production migration history.
  const first = ['20260415_auth_sync_share.sql', '202604151710_library_bootstrap_rls_fix.sql'];
  migrations.splice(migrations.indexOf('20260530_projects.sql'), 1);
  migrations.splice(migrations.indexOf('20260530_project_sharing.sql'), 0, '20260530_projects.sql');
  for (const name of [...first, ...migrations.filter((item) => !first.includes(item))]) {
    await db.exec(await readFile(join(root, 'supabase/migrations', name), 'utf8'));
  }
  console.log(`Applied ${migrations.length} migrations to disposable PostgreSQL.`);
  for (const name of tests) {
    const sql = (await readFile(join(root, 'supabase/tests', name), 'utf8')).replace(/^\\.*$/gm, '');
    try {
      const results = await db.exec(sql);
      console.log(`PASS ${name}: ${results.length} SQL statements`);
    } catch (error) {
      throw new Error(`${name}: ${error.message}`, { cause: error });
    }
  }
} finally {
  await db.close();
}
