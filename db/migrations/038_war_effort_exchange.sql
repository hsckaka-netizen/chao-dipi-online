ALTER TABLE cdp_war_effort_players
  ADD COLUMN IF NOT EXISTS reward_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reward_contribution bigint NOT NULL DEFAULT 0 CHECK (reward_contribution >= 0),
  ADD COLUMN IF NOT EXISTS spent_contribution bigint NOT NULL DEFAULT 0 CHECK (spent_contribution >= 0),
  ADD COLUMN IF NOT EXISTS ssr_exchange_count integer NOT NULL DEFAULT 0 CHECK (ssr_exchange_count BETWEEN 0 AND 6),
  ADD CONSTRAINT cdp_war_effort_credit_check CHECK (spent_contribution <= contribution + reward_contribution);

CREATE TABLE IF NOT EXISTS cdp_war_effort_exchanges (
  exchange_id uuid PRIMARY KEY,
  campaign_id varchar(80) NOT NULL REFERENCES cdp_war_effort_campaigns(campaign_id),
  account_id uuid NOT NULL REFERENCES cdp_accounts(account_id) ON DELETE CASCADE,
  request_id varchar(120) NOT NULL,
  product_id varchar(40) NOT NULL,
  hero_id varchar(80),
  quantity integer NOT NULL CHECK (quantity > 0),
  cost bigint NOT NULL CHECK (cost > 0),
  result_data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, request_id)
);
ALTER TABLE cdp_war_effort_exchanges ENABLE ROW LEVEL SECURITY;

ALTER TABLE cdp_cosmetic_entitlements DROP CONSTRAINT cdp_cosmetic_entitlements_source_check;
ALTER TABLE cdp_cosmetic_entitlements ADD CONSTRAINT cdp_cosmetic_entitlements_source_check
  CHECK (source IN ('migration', 'purchase', 'admin_grant', 'war_effort'));

UPDATE cdp_war_effort_campaigns SET rules_version = '2026-10-war-effort-v2'
WHERE campaign_id = '2026-season-4-war-effort';
