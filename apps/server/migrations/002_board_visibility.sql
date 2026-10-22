-- Add board visibility and read tokens

-- Add board_visibility column to accounts
do $$ begin
  create type board_visibility as enum ('public', 'private');
exception when duplicate_object then null; end $$;

alter table accounts add column if not exists board_visibility board_visibility not null default 'private';

-- Board read tokens for private boards
create table if not exists board_read_tokens (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references accounts (id) on delete cascade,
  token_hash    text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  label         text check (char_length(label) <= 64),
  created_at    timestamptz not null default now(),
  revoked       boolean not null default false,
  revoked_at    timestamptz,
  last4         text check (last4 is null or last4 ~ '^[A-Za-z0-9]{4}$'),
  constraint revoked_has_date check (not revoked or revoked_at is not null)
);

create index if not exists board_read_tokens_account_idx on board_read_tokens (account_id);
