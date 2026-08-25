WITH home_production_before_star_curve AS (
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
      WHEN region.unit_id IN ('boka-youth', 'brick-worker', 'trainee')
        THEN (ARRAY[8, 10, 12, 14, 16]::numeric[])[unit.stars]
      WHEN region.unit_id IN ('shen-biesan', 'shen-jiangwen', 'yokoyama-yui')
        THEN (ARRAY[36, 42, 48, 54, 60]::numeric[])[unit.stars]
      ELSE (ARRAY[24, 28, 32, 36, 40]::numeric[])[unit.stars]
    END AS old_base_rate
  FROM cdp_home_regions region
  LEFT JOIN cdp_hero_units unit
    ON unit.account_id = region.account_id
   AND unit.unit_id = region.unit_id
)
UPDATE cdp_home_regions region
SET production_value = region.production_value
      + snapshot.newly_produced_seconds / 3600.0
        * snapshot.old_base_rate
        * (1 + region.level * 0.005),
    production_seconds = region.production_seconds + snapshot.newly_produced_seconds,
    settled_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
FROM home_production_before_star_curve snapshot
WHERE snapshot.account_id = region.account_id
  AND snapshot.region_id = region.region_id;
