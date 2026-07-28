CREATE TABLE IF NOT EXISTS cdp_diamond_wallets (
  account_id uuid PRIMARY KEY REFERENCES cdp_accounts(account_id) ON DELETE CASCADE,
  balance bigint NOT NULL DEFAULT 0,
  lifetime_earned bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cdp_diamond_wallets_balance_check CHECK (balance >= 0),
  CONSTRAINT cdp_diamond_wallets_lifetime_check CHECK (lifetime_earned >= 0)
);

CREATE TABLE IF NOT EXISTS cdp_game_diamond_rewards (
  game_id uuid NOT NULL,
  room_player_id text NOT NULL,
  account_id uuid NOT NULL REFERENCES cdp_accounts(account_id) ON DELETE CASCADE,
  reward_date date NOT NULL,
  rules_version varchar(32) NOT NULL,
  status varchar(24) NOT NULL,
  base_amount integer NOT NULL DEFAULT 0,
  win_bonus integer NOT NULL DEFAULT 0,
  title_bonus integer NOT NULL DEFAULT 0,
  calculated_amount integer NOT NULL DEFAULT 0,
  awarded_amount integer NOT NULL DEFAULT 0,
  balance_after bigint NOT NULL DEFAULT 0,
  breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, account_id),
  UNIQUE (game_id, room_player_id),
  FOREIGN KEY (game_id, room_player_id)
    REFERENCES cdp_game_players(game_id, room_player_id)
    ON DELETE CASCADE,
  CONSTRAINT cdp_game_diamond_rewards_status_check CHECK (status IN ('awarded', 'daily-capped')),
  CONSTRAINT cdp_game_diamond_rewards_amount_check CHECK (
    base_amount >= 0
    AND win_bonus >= 0
    AND title_bonus >= 0
    AND calculated_amount >= 0
    AND awarded_amount >= 0
    AND balance_after >= 0
  )
);

CREATE INDEX IF NOT EXISTS cdp_game_diamond_rewards_account_date_idx
  ON cdp_game_diamond_rewards (account_id, reward_date DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS cdp_diamond_ledger (
  ledger_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES cdp_accounts(account_id) ON DELETE CASCADE,
  amount integer NOT NULL,
  balance_after bigint NOT NULL,
  reason varchar(32) NOT NULL,
  game_id uuid REFERENCES cdp_games(game_id) ON DELETE RESTRICT,
  rules_version varchar(32) NOT NULL,
  idempotency_key varchar(160) NOT NULL UNIQUE,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cdp_diamond_ledger_amount_check CHECK (amount <> 0),
  CONSTRAINT cdp_diamond_ledger_balance_check CHECK (balance_after >= 0)
);

CREATE INDEX IF NOT EXISTS cdp_diamond_ledger_account_created_idx
  ON cdp_diamond_ledger (account_id, created_at DESC);

ALTER TABLE cdp_diamond_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE cdp_game_diamond_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE cdp_diamond_ledger ENABLE ROW LEVEL SECURITY;
