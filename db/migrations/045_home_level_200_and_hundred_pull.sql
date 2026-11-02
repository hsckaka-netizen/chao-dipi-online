-- Expand existing limits without changing balances, ownership or completed upgrades.
ALTER TABLE cdp_home_regions DROP CONSTRAINT IF EXISTS cdp_home_regions_level_check;
ALTER TABLE cdp_home_regions
  ADD CONSTRAINT cdp_home_regions_level_check CHECK (level BETWEEN 0 AND 200);

ALTER TABLE cdp_home_regions DROP CONSTRAINT IF EXISTS cdp_home_regions_seconds_check;
ALTER TABLE cdp_home_regions
  ADD CONSTRAINT cdp_home_regions_seconds_check CHECK (production_seconds BETWEEN 0 AND 57600);

ALTER TABLE cdp_hero_gacha_requests DROP CONSTRAINT IF EXISTS cdp_hero_gacha_pull_count_check;
ALTER TABLE cdp_hero_gacha_requests
  ADD CONSTRAINT cdp_hero_gacha_pull_count_check CHECK (pull_count IN (1, 10, 100));
