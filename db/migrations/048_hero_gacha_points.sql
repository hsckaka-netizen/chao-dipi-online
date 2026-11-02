ALTER TABLE cdp_hero_profiles
  ADD COLUMN gacha_points bigint NOT NULL DEFAULT 0 CHECK (gacha_points >= 0);

-- Credit every recorded draw, including free draws, exactly once at migration.
UPDATE cdp_hero_profiles profile
SET gacha_points = history.total_pulls
FROM (
  SELECT account_id, sum(pull_count)::bigint AS total_pulls
  FROM cdp_hero_gacha_requests GROUP BY account_id
) history
WHERE profile.account_id = history.account_id;

CREATE TABLE cdp_hero_point_exchanges (
  account_id uuid NOT NULL REFERENCES cdp_accounts(account_id) ON DELETE CASCADE,
  request_id varchar(120) NOT NULL,
  unit_id varchar(40) NOT NULL,
  cost_points bigint NOT NULL CHECK (cost_points > 0),
  points_after bigint NOT NULL CHECK (points_after >= 0),
  rules_version varchar(32) NOT NULL,
  result_data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, request_id)
);
ALTER TABLE cdp_hero_point_exchanges ENABLE ROW LEVEL SECURITY;
