-- ICWT Fantasy Chatroom — database schema
-- Run this once, in full, in the Supabase SQL Editor of a brand-new project.
-- Reverse-engineered from the app's Supabase queries (no schema was checked
-- into the original repo — the tables only existed live in that project).

create extension if not exists pgcrypto;

-- ============================================================
-- managers
-- ============================================================
create table managers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  active boolean not null default true,
  league_id integer default 1
);

-- ============================================================
-- seasons
-- ============================================================
create table seasons (
  id uuid primary key default gen_random_uuid(),
  year integer not null unique,
  season_number integer,
  champion_id uuid references managers(id),
  mol_bowl_winner_id uuid references managers(id),
  mol_bowl_loser_id uuid references managers(id)
);

-- ============================================================
-- teams (one row per manager per season)
-- ============================================================
create table teams (
  id uuid primary key default gen_random_uuid(),
  season_id uuid references seasons(id),
  manager_id uuid references managers(id),
  team_name text,
  wins integer not null default 0,
  losses integer not null default 0,
  points_for numeric not null default 0,
  points_against numeric not null default 0,
  made_playoffs boolean not null default false,
  playoff_seed integer,
  final_standing integer,
  playoff_result text, -- 'Champion' | 'Runner Up' | 'Third Place' | 'Sacko' | null
  league_id integer default 1,
  unique (season_id, manager_id)
);
create index teams_season_id_idx on teams(season_id);
create index teams_manager_id_idx on teams(manager_id);

-- ============================================================
-- matchups
-- ============================================================
create table matchups (
  id uuid primary key default gen_random_uuid(),
  season_id uuid references seasons(id),
  week integer not null,
  home_team_id uuid references teams(id),
  away_team_id uuid references teams(id),
  home_score numeric,
  away_score numeric,
  is_playoff boolean not null default false,
  is_mol_bowl boolean not null default false,
  is_consolation boolean not null default false,
  league_id integer default 1
);
create index matchups_season_id_idx on matchups(season_id);
create index matchups_home_team_id_idx on matchups(home_team_id);
create index matchups_away_team_id_idx on matchups(away_team_id);

-- ============================================================
-- players
-- ============================================================
create table players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  position text, -- QB | RB | WR | TE | K | D/ST
  sleeper_id text -- 'SKIP' means intentionally excluded from Sleeper stat lookups
);

-- ============================================================
-- roster_entries (one row per player per team-season)
-- ============================================================
create table roster_entries (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players(id),
  team_id uuid references teams(id),
  avg_pts numeric,
  fpts numeric,
  prk integer,
  stats jsonb -- cached per-season Sleeper stat blob
);
create index roster_entries_team_id_idx on roster_entries(team_id);
create index roster_entries_player_id_idx on roster_entries(player_id);

-- ============================================================
-- writeups
-- ============================================================
create table writeups (
  id uuid primary key default gen_random_uuid(),
  season_year integer not null,
  week integer, -- 0=Preseason, 1-17=weeks, 18=Postseason, 19=Offseason, null=season-level
  type text, -- power_rankings | weekly_summary | mock_draft | rumor_mill | trade_block | group_discussion | other
  title text,
  content text,
  author_name text,
  pin text, -- 4+ digit string, app-level auth for edit/delete
  created_at timestamptz not null default now()
);

-- ============================================================
-- writeup_comments
-- ============================================================
create table writeup_comments (
  id uuid primary key default gen_random_uuid(),
  writeup_id uuid references writeups(id) on delete cascade,
  author_name text,
  content text,
  pin text,
  created_at timestamptz not null default now()
);
create index writeup_comments_writeup_id_idx on writeup_comments(writeup_id);

-- ============================================================
-- draft_order (free-text season/manager_name, not FKs)
-- ============================================================
create table draft_order (
  id uuid primary key default gen_random_uuid(),
  season text not null, -- e.g. '2026-27'
  pick_number integer not null,
  manager_name text,
  unique (season, pick_number)
);

-- ============================================================
-- sportsbook: gb_accounts ("Gimre Bucks" accounts)
-- ============================================================
create table gb_accounts (
  id uuid primary key default gen_random_uuid(),
  manager_name text not null,
  season text not null,
  balance numeric not null default 1000,
  pin text,
  unique (manager_name, season)
);

-- ============================================================
-- sportsbook: sb_games
-- ============================================================
create table sb_games (
  id uuid primary key default gen_random_uuid(),
  season text not null,
  week integer not null,
  team_a text not null,
  team_b text not null,
  spread numeric,
  over_under numeric,
  ml_a integer default -110,
  ml_b integer default -110,
  is_locked boolean not null default false,
  is_settled boolean not null default false,
  score_a numeric,
  score_b numeric,
  created_at timestamptz not null default now()
);

-- ============================================================
-- sportsbook: sb_parlays
-- ============================================================
create table sb_parlays (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references gb_accounts(id) on delete cascade,
  amount numeric not null default 0,
  legs integer not null default 0,
  combined_odds integer,
  status text not null default 'pending', -- pending | won | lost
  win_amount numeric,
  created_at timestamptz not null default now()
);
create index sb_parlays_account_id_idx on sb_parlays(account_id);

-- ============================================================
-- sportsbook: sb_bets
-- ============================================================
create table sb_bets (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references gb_accounts(id) on delete cascade,
  game_id uuid references sb_games(id) on delete cascade,
  bet_type text, -- spread | ou | ml | pickem
  pick text, -- team_a | team_b | over | under
  amount numeric not null default 0,
  odds integer not null default 0,
  status text not null default 'pending', -- pending | won | lost | push
  win_amount numeric,
  parlay_id uuid references sb_parlays(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index sb_bets_account_id_idx on sb_bets(account_id);
create index sb_bets_game_id_idx on sb_bets(game_id);
create index sb_bets_parlay_id_idx on sb_bets(parlay_id);

-- ============================================================
-- Row Level Security
-- ============================================================
-- This app has no real user accounts -- "auth" is just a 4+ digit PIN
-- checked in the app's own JS code, and every page reads/writes with the
-- public anon key. To keep the app working exactly as-is, every table gets
-- a permissive policy that allows the anon key to read and write freely.
-- This mirrors the original site's security model (anyone with the link
-- can view everything; PINs are a courtesy lock, not real access control).
alter table managers enable row level security;
alter table seasons enable row level security;
alter table teams enable row level security;
alter table matchups enable row level security;
alter table players enable row level security;
alter table roster_entries enable row level security;
alter table writeups enable row level security;
alter table writeup_comments enable row level security;
alter table draft_order enable row level security;
alter table gb_accounts enable row level security;
alter table sb_games enable row level security;
alter table sb_parlays enable row level security;
alter table sb_bets enable row level security;

create policy "public_all" on managers for all using (true) with check (true);
create policy "public_all" on seasons for all using (true) with check (true);
create policy "public_all" on teams for all using (true) with check (true);
create policy "public_all" on matchups for all using (true) with check (true);
create policy "public_all" on players for all using (true) with check (true);
create policy "public_all" on roster_entries for all using (true) with check (true);
create policy "public_all" on writeups for all using (true) with check (true);
create policy "public_all" on writeup_comments for all using (true) with check (true);
create policy "public_all" on draft_order for all using (true) with check (true);
create policy "public_all" on gb_accounts for all using (true) with check (true);
create policy "public_all" on sb_games for all using (true) with check (true);
create policy "public_all" on sb_parlays for all using (true) with check (true);
create policy "public_all" on sb_bets for all using (true) with check (true);
