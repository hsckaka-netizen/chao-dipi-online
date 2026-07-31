ALTER TABLE cdp_games
  ADD COLUMN IF NOT EXISTS evaluation_rules_version varchar(48)
  NOT NULL DEFAULT '2026-07-31-leader-drag-v2';
