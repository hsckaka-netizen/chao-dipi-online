ALTER TABLE cdp_home_regions ADD COLUMN IF NOT EXISTS second_extra_unit_id varchar(40);
ALTER TABLE cdp_home_regions ADD CONSTRAINT cdp_home_regions_second_extra_unit_fk
  FOREIGN KEY (account_id, second_extra_unit_id) REFERENCES cdp_hero_units(account_id, unit_id) ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS cdp_daily_task_bonus_claims (
  account_id uuid NOT NULL REFERENCES cdp_accounts(account_id) ON DELETE CASCADE,
  refresh_key date NOT NULL,
  request_id varchar(120) NOT NULL,
  item_id varchar(40) NOT NULL CHECK (item_id IN ('colorful-card', 'war-god-card', 'restart-card')),
  rules_version varchar(32) NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, refresh_key),
  UNIQUE (account_id, request_id)
);
ALTER TABLE cdp_daily_task_bonus_claims ENABLE ROW LEVEL SECURITY;
