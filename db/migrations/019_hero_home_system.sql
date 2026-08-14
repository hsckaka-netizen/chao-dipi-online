CREATE TABLE IF NOT EXISTS cdp_hero_profiles (
  account_id uuid PRIMARY KEY REFERENCES cdp_accounts(account_id) ON DELETE CASCADE,
  universal_fragments integer NOT NULL DEFAULT 0,
  non_hero_pity_count integer NOT NULL DEFAULT 0,
  first_ten_completed boolean NOT NULL DEFAULT false,
  battle_unit_id varchar(40),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cdp_hero_profiles_universal_check CHECK (universal_fragments >= 0),
  CONSTRAINT cdp_hero_profiles_pity_check CHECK (non_hero_pity_count BETWEEN 0 AND 49)
);

CREATE TABLE IF NOT EXISTS cdp_hero_units (
  account_id uuid NOT NULL REFERENCES cdp_accounts(account_id) ON DELETE CASCADE,
  unit_id varchar(40) NOT NULL,
  stars smallint NOT NULL DEFAULT 1,
  exclusive_fragments integer NOT NULL DEFAULT 0,
  obtained_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, unit_id),
  CONSTRAINT cdp_hero_units_stars_check CHECK (stars BETWEEN 1 AND 5),
  CONSTRAINT cdp_hero_units_fragments_check CHECK (exclusive_fragments >= 0)
);

CREATE TABLE IF NOT EXISTS cdp_home_regions (
  account_id uuid NOT NULL REFERENCES cdp_accounts(account_id) ON DELETE CASCADE,
  region_id varchar(20) NOT NULL,
  unit_id varchar(40),
  production_value numeric(20, 8) NOT NULL DEFAULT 0,
  production_seconds integer NOT NULL DEFAULT 0,
  settled_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, region_id),
  UNIQUE (account_id, unit_id),
  CONSTRAINT cdp_home_regions_region_check CHECK (region_id IN ('boka', 'brick', 'stage')),
  CONSTRAINT cdp_home_regions_value_check CHECK (production_value >= 0),
  CONSTRAINT cdp_home_regions_seconds_check CHECK (production_seconds BETWEEN 0 AND 21600),
  FOREIGN KEY (account_id, unit_id) REFERENCES cdp_hero_units(account_id, unit_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS cdp_hero_gacha_requests (
  account_id uuid NOT NULL REFERENCES cdp_accounts(account_id) ON DELETE CASCADE,
  request_id varchar(120) NOT NULL,
  pull_count smallint NOT NULL,
  price integer NOT NULL,
  balance_after bigint NOT NULL,
  result_data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, request_id),
  CONSTRAINT cdp_hero_gacha_pull_count_check CHECK (pull_count IN (1, 10)),
  CONSTRAINT cdp_hero_gacha_price_check CHECK (price > 0),
  CONSTRAINT cdp_hero_gacha_balance_check CHECK (balance_after >= 0)
);

CREATE TABLE IF NOT EXISTS cdp_hero_upgrade_requests (
  account_id uuid NOT NULL REFERENCES cdp_accounts(account_id) ON DELETE CASCADE,
  request_id varchar(120) NOT NULL,
  unit_id varchar(40) NOT NULL,
  result_data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, request_id)
);

ALTER TABLE cdp_game_players ADD COLUMN IF NOT EXISTS battle_hero_snapshot jsonb;
ALTER TABLE cdp_game_players ADD COLUMN IF NOT EXISTS hero_skill_reward jsonb;
ALTER TABLE cdp_game_diamond_rewards ADD COLUMN IF NOT EXISTS hero_bonus integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS cdp_hero_units_account_idx ON cdp_hero_units (account_id, unit_id);
CREATE INDEX IF NOT EXISTS cdp_hero_gacha_requests_account_idx ON cdp_hero_gacha_requests (account_id, created_at DESC);

ALTER TABLE cdp_hero_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE cdp_hero_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE cdp_home_regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cdp_hero_gacha_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE cdp_hero_upgrade_requests ENABLE ROW LEVEL SECURITY;
