ALTER TABLE cdp_hero_profiles
  ADD COLUMN IF NOT EXISTS first_pull_completed boolean NOT NULL DEFAULT false;

ALTER TABLE cdp_hero_profiles
  ADD COLUMN IF NOT EXISTS free_pull_used_at timestamptz;

UPDATE cdp_hero_profiles profile
SET first_pull_completed = true,
    updated_at = now()
WHERE EXISTS (
  SELECT 1
  FROM cdp_hero_gacha_requests request
  WHERE request.account_id = profile.account_id
);

ALTER TABLE cdp_hero_profiles
  DROP COLUMN IF EXISTS first_ten_completed;

ALTER TABLE cdp_hero_gacha_requests
  DROP CONSTRAINT IF EXISTS cdp_hero_gacha_price_check;

ALTER TABLE cdp_hero_gacha_requests
  ADD CONSTRAINT cdp_hero_gacha_price_check CHECK (price >= 0);
