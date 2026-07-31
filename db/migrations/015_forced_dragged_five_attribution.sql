ALTER TABLE cdp_games
  ALTER COLUMN evaluation_rules_version
  SET DEFAULT '2026-07-31-forced-drag-v3';

UPDATE cdp_games
SET evaluation_rules_version = '2026-07-31-forced-drag-v3'
WHERE evaluation_rules_version IS DISTINCT FROM '2026-07-31-forced-drag-v3';
