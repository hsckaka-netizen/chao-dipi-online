ALTER TABLE cdp_hero_profiles
  DROP CONSTRAINT IF EXISTS cdp_hero_profiles_ssr_pity_check;

ALTER TABLE cdp_hero_profiles
  ADD CONSTRAINT cdp_hero_profiles_ssr_pity_check
  CHECK (non_ssr_pity_count BETWEEN 0 AND 199);
