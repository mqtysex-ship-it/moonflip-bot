create table moonflip_private.migration_archives (
  archive_id uuid not null,
  source text not null,
  name text not null,
  content bytea not null,
  sha256 text not null,
  captured_at timestamptz not null default now(),
  primary key (archive_id, source, name)
);
alter table moonflip_private.migration_archives enable row level security;
revoke all on moonflip_private.migration_archives from public, anon, authenticated;
