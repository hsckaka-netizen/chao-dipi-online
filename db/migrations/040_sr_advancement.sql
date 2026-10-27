CREATE TABLE IF NOT EXISTS cdp_hero_advancements (
  account_id uuid NOT NULL REFERENCES cdp_accounts(account_id) ON DELETE CASCADE,
  sr_unit_id text NOT NULL CHECK (sr_unit_id IN ('jiang-zha', 'deng-huang')),
  progress jsonb NOT NULL DEFAULT '{}'::jsonb,
  claimed_at timestamptz,
  PRIMARY KEY (account_id, sr_unit_id)
);
CREATE TABLE IF NOT EXISTS cdp_hero_advancement_games (
  account_id uuid NOT NULL REFERENCES cdp_accounts(account_id) ON DELETE CASCADE,
  sr_unit_id text NOT NULL,
  game_id uuid NOT NULL REFERENCES cdp_games(game_id) ON DELETE CASCADE,
  PRIMARY KEY (account_id, sr_unit_id, game_id)
);
