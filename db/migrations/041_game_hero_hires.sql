CREATE TABLE IF NOT EXISTS cdp_game_hero_hires (
  game_id uuid NOT NULL,
  account_id uuid NOT NULL REFERENCES cdp_accounts(account_id) ON DELETE CASCADE,
  unit_id varchar(40) NOT NULL,
  cost integer NOT NULL DEFAULT 300 CHECK (cost = 300),
  balance_after bigint NOT NULL CHECK (balance_after >= 0),
  skill_cooldown smallint NOT NULL DEFAULT 0 CHECK (skill_cooldown BETWEEN 0 AND 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  refunded_at timestamptz,
  PRIMARY KEY (game_id, account_id)
);

ALTER TABLE cdp_game_hero_hires ENABLE ROW LEVEL SECURITY;
