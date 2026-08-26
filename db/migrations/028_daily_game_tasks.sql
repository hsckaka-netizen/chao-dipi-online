CREATE TABLE IF NOT EXISTS cdp_daily_task_claims (
  account_id uuid NOT NULL REFERENCES cdp_accounts(account_id) ON DELETE CASCADE,
  refresh_key date NOT NULL,
  task_id varchar(48) NOT NULL,
  rules_version varchar(32) NOT NULL,
  request_id varchar(120) NOT NULL,
  progress_value bigint NOT NULL,
  target_value bigint NOT NULL,
  reward_diamonds bigint NOT NULL,
  reward_materials bigint NOT NULL,
  balance_after bigint NOT NULL,
  building_materials_after bigint NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, refresh_key, task_id),
  CONSTRAINT cdp_daily_task_claims_progress_check CHECK (progress_value >= target_value AND target_value > 0),
  CONSTRAINT cdp_daily_task_claims_reward_check CHECK (reward_diamonds > 0 AND reward_materials > 0),
  CONSTRAINT cdp_daily_task_claims_balance_check CHECK (balance_after >= 0 AND building_materials_after >= 0)
);

CREATE INDEX IF NOT EXISTS cdp_daily_task_claims_account_date_idx
  ON cdp_daily_task_claims(account_id, refresh_key DESC, claimed_at DESC);

ALTER TABLE cdp_daily_task_claims ENABLE ROW LEVEL SECURITY;
