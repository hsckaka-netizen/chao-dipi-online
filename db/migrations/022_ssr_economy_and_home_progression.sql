ALTER TABLE cdp_hero_profiles
  ADD COLUMN IF NOT EXISTS non_ssr_pity_count integer NOT NULL DEFAULT 0;
ALTER TABLE cdp_hero_profiles
  ADD COLUMN IF NOT EXISTS building_materials bigint NOT NULL DEFAULT 0;
ALTER TABLE cdp_hero_profiles
  ADD CONSTRAINT cdp_hero_profiles_ssr_pity_check CHECK (non_ssr_pity_count BETWEEN 0 AND 99);
ALTER TABLE cdp_hero_profiles
  ADD CONSTRAINT cdp_hero_profiles_materials_check CHECK (building_materials >= 0);

ALTER TABLE cdp_hero_units
  ADD COLUMN IF NOT EXISTS skill_heat numeric(3, 1) NOT NULL DEFAULT 0;
ALTER TABLE cdp_hero_units
  ADD CONSTRAINT cdp_hero_units_skill_heat_check CHECK (skill_heat BETWEEN 0 AND 3);

ALTER TABLE cdp_home_regions
  ADD COLUMN IF NOT EXISTS level smallint NOT NULL DEFAULT 0;
ALTER TABLE cdp_home_regions
  ADD COLUMN IF NOT EXISTS extra_unit_id varchar(40);
ALTER TABLE cdp_home_regions
  ADD CONSTRAINT cdp_home_regions_level_check CHECK (level BETWEEN 0 AND 100);
ALTER TABLE cdp_home_regions
  ADD CONSTRAINT cdp_home_regions_extra_unit_fk
  FOREIGN KEY (account_id, extra_unit_id)
  REFERENCES cdp_hero_units(account_id, unit_id)
  ON DELETE RESTRICT;
ALTER TABLE cdp_home_regions DROP CONSTRAINT IF EXISTS cdp_home_regions_seconds_check;
ALTER TABLE cdp_home_regions
  ADD CONSTRAINT cdp_home_regions_seconds_check CHECK (production_seconds BETWEEN 0 AND 39600);

CREATE TABLE IF NOT EXISTS cdp_hero_region_upgrade_requests (
  account_id uuid NOT NULL REFERENCES cdp_accounts(account_id) ON DELETE CASCADE,
  request_id varchar(120) NOT NULL,
  region_id varchar(20) NOT NULL,
  result_data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, request_id)
);

CREATE TABLE IF NOT EXISTS cdp_hero_tasks (
  task_id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES cdp_accounts(account_id) ON DELETE CASCADE,
  refresh_key date NOT NULL,
  slot_index smallint NOT NULL,
  color varchar(16) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'available',
  hero_count smallint NOT NULL,
  duration_seconds integer NOT NULL,
  reward_materials integer NOT NULL,
  requirements jsonb NOT NULL DEFAULT '{}'::jsonb,
  assigned_unit_ids text[] NOT NULL DEFAULT '{}',
  started_at timestamptz,
  completes_at timestamptz,
  collected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cdp_hero_tasks_slot_check CHECK (slot_index BETWEEN 1 AND 3),
  CONSTRAINT cdp_hero_tasks_color_check CHECK (color IN ('white', 'green', 'blue', 'purple', 'orange')),
  CONSTRAINT cdp_hero_tasks_status_check CHECK (status IN ('available', 'running', 'completed', 'collected')),
  CONSTRAINT cdp_hero_tasks_count_check CHECK (hero_count BETWEEN 1 AND 5),
  CONSTRAINT cdp_hero_tasks_duration_check CHECK (duration_seconds > 0),
  CONSTRAINT cdp_hero_tasks_reward_check CHECK (reward_materials > 0)
);

CREATE INDEX IF NOT EXISTS cdp_hero_tasks_account_status_idx
  ON cdp_hero_tasks(account_id, status, completes_at, slot_index);

CREATE TABLE IF NOT EXISTS cdp_hero_task_requests (
  account_id uuid NOT NULL REFERENCES cdp_accounts(account_id) ON DELETE CASCADE,
  request_id varchar(120) NOT NULL,
  action varchar(16) NOT NULL,
  result_data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, request_id),
  CONSTRAINT cdp_hero_task_requests_action_check CHECK (action IN ('dispatch', 'collect'))
);

CREATE TABLE IF NOT EXISTS cdp_game_hero_skill_uses (
  use_id uuid PRIMARY KEY,
  game_id uuid NOT NULL,
  account_id uuid NOT NULL REFERENCES cdp_accounts(account_id) ON DELETE CASCADE,
  unit_id varchar(40) NOT NULL,
  request_id varchar(120) NOT NULL,
  cost integer NOT NULL,
  balance_after bigint NOT NULL,
  heat_before numeric(3, 1),
  heat_after numeric(3, 1),
  effect_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, request_id),
  UNIQUE (game_id, account_id, unit_id),
  CONSTRAINT cdp_game_hero_skill_uses_cost_check CHECK (cost > 0),
  CONSTRAINT cdp_game_hero_skill_uses_balance_check CHECK (balance_after >= 0)
);

CREATE TABLE IF NOT EXISTS cdp_hero_heat_settlements (
  game_id uuid NOT NULL,
  account_id uuid NOT NULL REFERENCES cdp_accounts(account_id) ON DELETE CASCADE,
  unit_id varchar(40) NOT NULL,
  heat_before numeric(3, 1) NOT NULL,
  heat_after numeric(3, 1) NOT NULL,
  used_in_game boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, account_id, unit_id)
);

ALTER TABLE cdp_games
  ADD COLUMN IF NOT EXISTS board_hero_effects jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE cdp_diamond_ledger ALTER COLUMN amount TYPE bigint;

WITH wallet_before AS (
  SELECT account_id, balance AS old_balance
  FROM cdp_diamond_wallets
  WHERE balance > 0
  FOR UPDATE
), converted AS (
  UPDATE cdp_diamond_wallets wallet
  SET balance = before.old_balance * 10,
      lifetime_earned = lifetime_earned + before.old_balance * 9,
      updated_at = now()
  FROM wallet_before before
  WHERE wallet.account_id = before.account_id
  RETURNING wallet.account_id, before.old_balance, wallet.balance
)
INSERT INTO cdp_diamond_ledger (
  account_id, amount, balance_after, reason, rules_version, idempotency_key, detail
)
SELECT account_id, old_balance * 9, balance, 'denomination', '2026-08-24-v3',
       'diamond_denomination:2026-08-24:' || account_id::text,
       jsonb_build_object('multiplier', 10, 'oldBalance', old_balance)
FROM converted
ON CONFLICT (idempotency_key) DO NOTHING;

UPDATE cdp_shop_products
SET price = CASE asset_key
  WHEN 'warrior' THEN 10000
  WHEN 'shaman' THEN 10000
  WHEN 'stormwind' THEN 8000
  WHEN 'blood-elf' THEN 8000
  WHEN 'paladin' THEN 8000
  WHEN 'mage' THEN 8000
  WHEN 'death-knight' THEN 8000
  ELSE 6000
END,
updated_at = now()
WHERE product_type = 'avatar_frame'
  AND asset_key IN (
    'stormwind', 'idol', 'hellfire', 'blood-elf', 'endless-winter', 'cr7',
    'paladin', 'warrior', 'mage', 'warlock', 'rogue', 'druid', 'shaman',
    'death-knight', 'minions', 'usagi', 'toy-story'
  );

UPDATE cdp_shop_products
SET price = CASE WHEN asset_key = 'vip-legend' THEN 4500 ELSE 1500 END,
    updated_at = now()
WHERE product_type = 'card_skin';

UPDATE cdp_shop_products
SET price = CASE asset_key
  WHEN 'restart-card' THEN 3000
  WHEN 'war-god-card' THEN 2000
  WHEN 'colorful-card' THEN 1500
  WHEN 'luck-card' THEN 150
END,
updated_at = now()
WHERE product_type = 'consumable_item'
  AND asset_key IN ('restart-card', 'war-god-card', 'colorful-card', 'luck-card');

ALTER TABLE cdp_hero_region_upgrade_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE cdp_hero_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE cdp_hero_task_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE cdp_game_hero_skill_uses ENABLE ROW LEVEL SECURITY;
ALTER TABLE cdp_hero_heat_settlements ENABLE ROW LEVEL SECURITY;
