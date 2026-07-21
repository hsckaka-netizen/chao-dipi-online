ALTER TABLE cdp_games
  ADD COLUMN IF NOT EXISTS record_format_version smallint NOT NULL DEFAULT 1;
