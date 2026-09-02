ALTER TABLE cdp_hero_units
  ADD COLUMN IF NOT EXISTS skill_cooldown smallint NOT NULL DEFAULT 0;

ALTER TABLE cdp_hero_units
  DROP CONSTRAINT IF EXISTS cdp_hero_units_skill_cooldown_check;

ALTER TABLE cdp_hero_units
  ADD CONSTRAINT cdp_hero_units_skill_cooldown_check
  CHECK (skill_cooldown BETWEEN 0 AND 5);

ALTER TABLE cdp_game_hero_skill_uses
  ADD COLUMN IF NOT EXISTS cooldown_before smallint;

ALTER TABLE cdp_game_hero_skill_uses
  ADD COLUMN IF NOT EXISTS cooldown_after smallint;

ALTER TABLE cdp_game_hero_skill_uses
  DROP CONSTRAINT IF EXISTS cdp_game_hero_skill_uses_cooldown_check;

ALTER TABLE cdp_game_hero_skill_uses
  ADD CONSTRAINT cdp_game_hero_skill_uses_cooldown_check
  CHECK (
    (cooldown_before IS NULL OR cooldown_before BETWEEN 0 AND 5)
    AND (cooldown_after IS NULL OR cooldown_after BETWEEN 0 AND 5)
  );

ALTER TABLE cdp_game_hero_skill_uses
  DROP CONSTRAINT IF EXISTS cdp_game_hero_skill_uses_game_id_account_id_unit_id_key;

CREATE TABLE IF NOT EXISTS cdp_hero_cooldown_settlements (
  game_id uuid NOT NULL,
  account_id uuid NOT NULL REFERENCES cdp_accounts(account_id) ON DELETE CASCADE,
  unit_id varchar(40) NOT NULL,
  cooldown_before smallint NOT NULL,
  cooldown_after smallint NOT NULL,
  used_in_game boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, account_id, unit_id),
  CONSTRAINT cdp_hero_cooldown_settlements_value_check CHECK (
    cooldown_before BETWEEN 0 AND 5 AND cooldown_after BETWEEN 0 AND 5
  )
);

ALTER TABLE cdp_hero_cooldown_settlements ENABLE ROW LEVEL SECURITY;
