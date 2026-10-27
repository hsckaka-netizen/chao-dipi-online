ALTER TABLE cdp_war_effort_players
  DROP CONSTRAINT IF EXISTS cdp_war_effort_players_ssr_exchange_count_check;
ALTER TABLE cdp_war_effort_players
  ADD CONSTRAINT cdp_war_effort_players_ssr_exchange_count_check CHECK (ssr_exchange_count BETWEEN 0 AND 7);

ALTER TABLE cdp_war_effort_campaigns ADD COLUMN IF NOT EXISTS champion_settled_at timestamptz;

CREATE TABLE IF NOT EXISTS cdp_war_effort_champions (
  campaign_id varchar(80) NOT NULL REFERENCES cdp_war_effort_campaigns(campaign_id),
  account_id uuid NOT NULL REFERENCES cdp_accounts(account_id) ON DELETE CASCADE,
  contribution bigint NOT NULL CHECK (contribution > 0),
  frame_key varchar(40) NOT NULL,
  title_id varchar(48) NOT NULL,
  awarded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, account_id)
);
CREATE INDEX IF NOT EXISTS cdp_war_effort_champions_account_idx ON cdp_war_effort_champions(account_id);
ALTER TABLE cdp_war_effort_champions ENABLE ROW LEVEL SECURITY;

-- Backfill the completed campaign for offline players as well; never use spendable balance.
INSERT INTO cdp_war_effort_champions (campaign_id, account_id, contribution, frame_key, title_id)
SELECT player.campaign_id, player.account_id, player.contribution, 'blackstone-commander', 'war-effort-s4-commander'
FROM cdp_war_effort_players player
JOIN cdp_accounts account ON account.account_id = player.account_id AND account.role = 'player'
JOIN cdp_war_effort_campaigns campaign ON campaign.campaign_id = player.campaign_id
WHERE campaign.campaign_id = '2026-season-4-war-effort'
  AND campaign.completed_at IS NOT NULL AND campaign.champion_settled_at IS NULL
  AND player.contribution > 0
  AND player.contribution = (
    SELECT max(candidate.contribution) FROM cdp_war_effort_players candidate
    JOIN cdp_accounts eligible ON eligible.account_id = candidate.account_id AND eligible.role = 'player'
    WHERE candidate.campaign_id = campaign.campaign_id
  )
ON CONFLICT (campaign_id, account_id) DO NOTHING;

INSERT INTO cdp_cosmetic_entitlements (account_id, cosmetic_type, cosmetic_key, source, source_id)
SELECT account_id, 'avatar_frame', frame_key, 'war_effort', campaign_id || ':champion'
FROM cdp_war_effort_champions WHERE campaign_id = '2026-season-4-war-effort'
ON CONFLICT DO NOTHING;

UPDATE cdp_war_effort_campaigns
SET champion_settled_at = coalesce(champion_settled_at, now()), rules_version = '2026-10-war-effort-v3'
WHERE campaign_id = '2026-season-4-war-effort' AND completed_at IS NOT NULL;
UPDATE cdp_war_effort_campaigns SET rules_version = '2026-10-war-effort-v3'
WHERE campaign_id = '2026-season-4-war-effort';
