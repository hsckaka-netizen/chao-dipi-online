INSERT INTO cdp_hero_units (
  account_id, unit_id, stars, exclusive_fragments, obtained_at, updated_at
)
SELECT
  account_id,
  CASE unit_id
    WHEN 'zhao-yun' THEN 'jiang-zha'
    WHEN 'lin-chong' THEN 'deng-huang'
  END,
  stars,
  exclusive_fragments,
  obtained_at,
  updated_at
FROM cdp_hero_units
WHERE unit_id IN ('zhao-yun', 'lin-chong')
ON CONFLICT (account_id, unit_id) DO UPDATE
SET stars = GREATEST(cdp_hero_units.stars, EXCLUDED.stars),
    exclusive_fragments = cdp_hero_units.exclusive_fragments + EXCLUDED.exclusive_fragments,
    obtained_at = LEAST(cdp_hero_units.obtained_at, EXCLUDED.obtained_at),
    updated_at = GREATEST(cdp_hero_units.updated_at, EXCLUDED.updated_at);

UPDATE cdp_home_regions
SET unit_id = CASE unit_id
      WHEN 'zhao-yun' THEN 'jiang-zha'
      WHEN 'lin-chong' THEN 'deng-huang'
    END,
    updated_at = now()
WHERE unit_id IN ('zhao-yun', 'lin-chong');

UPDATE cdp_hero_profiles
SET battle_unit_id = CASE battle_unit_id
      WHEN 'zhao-yun' THEN 'jiang-zha'
      WHEN 'lin-chong' THEN 'deng-huang'
    END,
    updated_at = now()
WHERE battle_unit_id IN ('zhao-yun', 'lin-chong');

DELETE FROM cdp_hero_units
WHERE unit_id IN ('zhao-yun', 'lin-chong');
