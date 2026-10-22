-- fleeet server data model: accounts, tokens, events, board settings.
-- Adapted from fleeet-core for plain Postgres (no RLS, Supabase auth, or roles).

-- ---------------------------------------------------------------- accounts
do $$ begin
  create type account_status as enum ('empty', 'detached', 'claimed', 'discarded');
exception when duplicate_object then null; end $$;

do $$ begin
  create type digest_frequency as enum ('daily', 'weekly', 'monthly', 'none');
exception when duplicate_object then null; end $$;

create table if not exists accounts (
  id                     uuid primary key default gen_random_uuid(),
  space                  text not null unique check (space ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  status                 account_status not null default 'empty',
  is_owner               boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz,
  first_log_at           timestamptz,
  claim_deadline         timestamptz,
  claimed_at             timestamptz,
  discarded_at           timestamptz,
  retain_until           timestamptz,
  email                  text,
  google_id              text,
  digest_frequency       digest_frequency not null default 'none',
  marketing_opt_in       boolean not null default false,
  marketing_opt_in_at    timestamptz,
  marketing_consent_text text,
  board_settings         jsonb not null default '{}'::jsonb,
  constraint claimed_has_date check (status <> 'claimed' or claimed_at is not null),
  constraint discarded_has_date check (status <> 'discarded' or discarded_at is not null),
  constraint opt_in_has_consent check (
    not marketing_opt_in or (marketing_opt_in_at is not null and marketing_consent_text is not null)
  )
);

create unique index if not exists accounts_email_key on accounts (lower(email)) where email is not null;
create unique index if not exists accounts_google_id_key on accounts (google_id) where google_id is not null;
create index if not exists accounts_claim_deadline_idx on accounts (claim_deadline) where status in ('empty', 'detached');

-- ------------------------------------------------------------------ tokens
create table if not exists tokens (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references accounts (id) on delete cascade,
  token_hash    text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  label         text check (char_length(label) <= 64),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz,
  last_seen_at  timestamptz,
  revoked       boolean not null default false,
  revoked_at    timestamptz,
  last4         text check (last4 is null or last4 ~ '^[A-Za-z0-9]{4}$'),
  agent_kind    text check (agent_kind is null or agent_kind in ('claude', 'grok', 'codex', 'cursor', 'other')),
  constraint revoked_has_date check (not revoked or revoked_at is not null)
);

create index if not exists tokens_account_idx on tokens (account_id);

-- ------------------------------------------------------------------ events
create table if not exists events (
  id            bigint generated always as identity primary key,
  account_id    uuid not null references accounts (id) on delete cascade,
  token_id      uuid references tokens (id) on delete set null,
  event         text not null check (event in ('session_start', 'heartbeat', 'blocked', 'session_end')),
  run_id        text not null check (char_length(run_id) between 1 and 80),
  ts            timestamptz not null,
  received_at   timestamptz not null default now(),
  retain_until  timestamptz not null,
  agent         text not null check (char_length(agent) between 1 and 64),
  surface       text check (char_length(surface) between 1 and 32),
  project       text check (char_length(project) between 1 and 80),
  trigger       text not null default 'user' check (trigger in ('user', 'routine', 'agent')),
  visibility    text check (visibility in ('public', 'private')),
  summary       text not null check (char_length(summary) between 1 and 240),
  task          text check (char_length(task) <= 200),
  source        jsonb,
  progress      jsonb,
  blocker       jsonb,
  outcome       jsonb,
  client        jsonb,
  unique (account_id, run_id, event, ts)
);

create index if not exists events_account_ts_idx on events (account_id, ts desc);
create index if not exists events_account_run_idx on events (account_id, run_id);
create index if not exists events_retain_until_idx on events (retain_until);

-- -------------------------------------------------------- hidden runs
create table if not exists board_hidden_runs (
  account_id  uuid not null references accounts (id) on delete cascade,
  run_id      text not null,
  hidden_at   timestamptz not null default now(),
  primary key (account_id, run_id)
);

-- ------------------------------------------------------- run overrides (edits)
create table if not exists run_overrides (
  account_id  uuid not null references accounts (id) on delete cascade,
  run_id      text not null,
  task        text,
  summary     text,
  edited_at   timestamptz not null default now(),
  edited_by   text,
  primary key (account_id, run_id)
);

-- ----------------------------------------------------------- deleted runs
create table if not exists deleted_runs (
  account_id  uuid not null references accounts (id) on delete cascade,
  run_hash    text not null check (run_hash ~ '^[0-9a-f]{64}$'),
  deleted_at  timestamptz not null default now(),
  deleted_by  text,
  primary key (account_id, run_hash)
);

-- Trigger: late posts to deleted runs land hidden
create or replace function hide_deleted_run_events()
returns trigger as $$
declare
  run_hash_val text;
begin
  run_hash_val := encode(sha256((NEW.account_id || ':' || NEW.run_id)::bytea), 'hex');
  if exists (select 1 from deleted_runs where account_id = NEW.account_id and run_hash = run_hash_val) then
    insert into board_hidden_runs (account_id, run_id, hidden_at)
    values (NEW.account_id, NEW.run_id, now())
    on conflict (account_id, run_id) do nothing;
  end if;
  return NEW;
end;
$$ language plpgsql;

create trigger hide_deleted_run_events_trigger
  after insert on events
  for each row
  execute function hide_deleted_run_events();
