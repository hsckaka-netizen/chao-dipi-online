ALTER TABLE cdp_player_profiles
  ADD COLUMN IF NOT EXISTS equipped_title varchar(48) NOT NULL DEFAULT '';

ALTER TABLE cdp_player_profiles
  DROP CONSTRAINT IF EXISTS cdp_player_profiles_equipped_title_check;

ALTER TABLE cdp_player_profiles
  ADD CONSTRAINT cdp_player_profiles_equipped_title_check
  CHECK (equipped_title = '' OR equipped_title ~ '^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$');

CREATE TABLE IF NOT EXISTS cdp_player_energy (
  account_id uuid PRIMARY KEY REFERENCES cdp_accounts(account_id) ON DELETE CASCADE,
  energy smallint NOT NULL DEFAULT 24,
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cdp_player_energy_value_check CHECK (energy BETWEEN 0 AND 24)
);

CREATE TABLE IF NOT EXISTS cdp_pve_energy_uses (
  start_id uuid NOT NULL,
  account_id uuid NOT NULL REFERENCES cdp_accounts(account_id) ON DELETE CASCADE,
  energy_before smallint NOT NULL,
  energy_spent smallint NOT NULL,
  energy_after smallint NOT NULL,
  reward_eligible boolean NOT NULL,
  reason varchar(32),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (start_id, account_id),
  CONSTRAINT cdp_pve_energy_uses_values_check CHECK (
    energy_before BETWEEN 0 AND 24
    AND energy_after BETWEEN 0 AND 24
    AND energy_spent IN (0, 6)
  )
);

CREATE INDEX IF NOT EXISTS cdp_pve_energy_uses_account_idx
  ON cdp_pve_energy_uses (account_id, created_at DESC);

ALTER TABLE cdp_games
  ADD COLUMN IF NOT EXISTS energy_start_id uuid;

ALTER TABLE cdp_game_players
  ADD COLUMN IF NOT EXISTS pve_energy_eligible boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS cdp_achievement_claims (
  account_id uuid NOT NULL REFERENCES cdp_accounts(account_id) ON DELETE CASCADE,
  achievement_id varchar(64) NOT NULL,
  rules_version varchar(32) NOT NULL,
  progress_value bigint NOT NULL,
  target_value bigint NOT NULL,
  reward_diamonds integer NOT NULL DEFAULT 0,
  reward_title_id varchar(48),
  reward_title_name varchar(32),
  balance_after bigint NOT NULL,
  request_id varchar(120) NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, achievement_id),
  CONSTRAINT cdp_achievement_claims_progress_check CHECK (
    progress_value >= target_value AND target_value > 0
  ),
  CONSTRAINT cdp_achievement_claims_reward_check CHECK (
    reward_diamonds >= 0 AND balance_after >= 0
  )
);

CREATE INDEX IF NOT EXISTS cdp_achievement_claims_account_idx
  ON cdp_achievement_claims (account_id, claimed_at DESC);

ALTER TABLE cdp_player_energy ENABLE ROW LEVEL SECURITY;
ALTER TABLE cdp_pve_energy_uses ENABLE ROW LEVEL SECURITY;
ALTER TABLE cdp_achievement_claims ENABLE ROW LEVEL SECURITY;
