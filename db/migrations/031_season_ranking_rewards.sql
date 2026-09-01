CREATE TABLE IF NOT EXISTS cdp_season_reward_settlements (
  season_id bigint PRIMARY KEY REFERENCES cdp_seasons(season_id) ON DELETE RESTRICT,
  rules_version varchar(32) NOT NULL,
  player_count integer NOT NULL DEFAULT 0,
  total_amount bigint NOT NULL DEFAULT 0,
  settled_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cdp_season_reward_settlements_player_count_check CHECK (player_count >= 0),
  CONSTRAINT cdp_season_reward_settlements_total_amount_check CHECK (total_amount >= 0)
);

CREATE TABLE IF NOT EXISTS cdp_season_diamond_rewards (
  season_id bigint NOT NULL REFERENCES cdp_seasons(season_id) ON DELETE RESTRICT,
  account_id uuid NOT NULL REFERENCES cdp_accounts(account_id) ON DELETE CASCADE,
  final_rank integer NOT NULL,
  total_score numeric(12, 2) NOT NULL,
  rank_amount integer NOT NULL,
  positive_score_bonus integer NOT NULL DEFAULT 0,
  awarded_amount integer NOT NULL,
  balance_after bigint NOT NULL,
  rules_version varchar(32) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (season_id, account_id),
  UNIQUE (season_id, final_rank),
  CONSTRAINT cdp_season_diamond_rewards_rank_check CHECK (final_rank > 0),
  CONSTRAINT cdp_season_diamond_rewards_amount_check CHECK (
    rank_amount > 0
    AND positive_score_bonus >= 0
    AND awarded_amount = rank_amount + positive_score_bonus
    AND balance_after >= 0
  )
);

CREATE INDEX IF NOT EXISTS cdp_season_diamond_rewards_account_created_idx
  ON cdp_season_diamond_rewards (account_id, created_at DESC);

ALTER TABLE cdp_season_reward_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE cdp_season_diamond_rewards ENABLE ROW LEVEL SECURITY;
