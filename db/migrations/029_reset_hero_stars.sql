WITH home_production_before_star_reset AS (
  SELECT
    region.account_id,
    region.region_id,
    CASE
      WHEN region.unit_id IS NULL THEN 0
      ELSE GREATEST(
        0,
        LEAST(
          21600 + floor(region.level / 10.0)::integer * 1800 - region.production_seconds,
          floor(extract(epoch FROM (CURRENT_TIMESTAMP - region.settled_at)))::integer
        )
      )
    END AS newly_produced_seconds,
    CASE
      WHEN region.unit_id IS NULL OR unit.stars IS NULL THEN 0
      WHEN region.unit_id IN ('shen-biesan', 'shen-jiangwen', 'yokoyama-yui')
        THEN (ARRAY[24, 33, 42, 51, 60]::numeric[])[unit.stars]
      ELSE (ARRAY[16, 22, 28, 34, 40]::numeric[])[unit.stars]
    END AS old_base_rate
  FROM cdp_home_regions region
  LEFT JOIN cdp_hero_units unit
    ON unit.account_id = region.account_id
   AND unit.unit_id = region.unit_id
  WHERE unit.stars > 1
    AND unit.unit_id NOT IN ('boka-youth', 'brick-worker', 'trainee')
)
UPDATE cdp_home_regions region
SET production_value = region.production_value
      + snapshot.newly_produced_seconds / 3600.0
        * snapshot.old_base_rate
        * (1 + region.level * 0.005),
    production_seconds = region.production_seconds + snapshot.newly_produced_seconds,
    settled_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
FROM home_production_before_star_reset snapshot
WHERE snapshot.account_id = region.account_id
  AND snapshot.region_id = region.region_id;

UPDATE cdp_hero_units
SET exclusive_fragments = exclusive_fragments
      + CASE stars
          WHEN 2 THEN 20
          WHEN 3 THEN 60
          WHEN 4 THEN 120
          WHEN 5 THEN 200
          ELSE 0
        END,
    stars = 1,
    updated_at = CURRENT_TIMESTAMP
WHERE stars > 1
  AND unit_id NOT IN ('boka-youth', 'brick-worker', 'trainee');
