CREATE TABLE IF NOT EXISTS cdp_war_effort_campaigns (
  campaign_id varchar(80) PRIMARY KEY,
  name varchar(120) NOT NULL,
  rules_version varchar(40) NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  completed_at timestamptz,
  red_cloth bigint NOT NULL DEFAULT 0,
  bounty_order bigint NOT NULL DEFAULT 0,
  dreamleaf bigint NOT NULL DEFAULT 0,
  dark_iron bigint NOT NULL DEFAULT 0,
  diamonds bigint NOT NULL DEFAULT 0,
  universal_fragments bigint NOT NULL DEFAULT 0,
  building_materials bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cdp_war_effort_campaign_time_check CHECK (ends_at > starts_at),
  CONSTRAINT cdp_war_effort_campaign_totals_check CHECK (
    red_cloth >= 0 AND bounty_order >= 0 AND dreamleaf >= 0 AND dark_iron >= 0
    AND diamonds >= 0 AND universal_fragments >= 0 AND building_materials >= 0
  )
);

INSERT INTO cdp_war_effort_campaigns (
  campaign_id, name, rules_version, starts_at, ends_at
) VALUES (
  '2026-season-4-war-effort', '黑石关全服筹备', '2026-10-war-effort-v1',
  '2026-09-30T19:00:00.000Z'::timestamptz,
  '2026-10-28T19:00:00.000Z'::timestamptz
) ON CONFLICT (campaign_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS cdp_war_effort_players (
  campaign_id varchar(80) NOT NULL REFERENCES cdp_war_effort_campaigns(campaign_id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES cdp_accounts(account_id) ON DELETE CASCADE,
  red_cloth integer NOT NULL DEFAULT 0,
  bounty_order integer NOT NULL DEFAULT 0,
  dreamleaf integer NOT NULL DEFAULT 0,
  dark_iron integer NOT NULL DEFAULT 0,
  contribution bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, account_id),
  CONSTRAINT cdp_war_effort_player_values_check CHECK (
    red_cloth >= 0 AND bounty_order >= 0 AND dreamleaf >= 0 AND dark_iron >= 0 AND contribution >= 0
  )
);

CREATE TABLE IF NOT EXISTS cdp_war_effort_game_rewards (
  campaign_id varchar(80) NOT NULL REFERENCES cdp_war_effort_campaigns(campaign_id) ON DELETE CASCADE,
  game_id uuid NOT NULL REFERENCES cdp_games(game_id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES cdp_accounts(account_id) ON DELETE CASCADE,
  reward_data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, game_id, account_id)
);

CREATE TABLE IF NOT EXISTS cdp_war_effort_donations (
  campaign_id varchar(80) NOT NULL REFERENCES cdp_war_effort_campaigns(campaign_id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES cdp_accounts(account_id) ON DELETE CASCADE,
  request_id varchar(120) NOT NULL,
  resource_type varchar(40) NOT NULL,
  amount bigint NOT NULL,
  contribution bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, request_id),
  CONSTRAINT cdp_war_effort_donation_resource_check CHECK (
    resource_type IN ('red_cloth', 'bounty_order', 'dreamleaf', 'dark_iron', 'diamonds', 'universal_fragments', 'building_materials')
  ),
  CONSTRAINT cdp_war_effort_donation_values_check CHECK (amount > 0 AND contribution > 0)
);

CREATE INDEX IF NOT EXISTS cdp_war_effort_contribution_idx
  ON cdp_war_effort_players (campaign_id, contribution DESC, updated_at, account_id);
CREATE INDEX IF NOT EXISTS cdp_war_effort_donations_campaign_idx
  ON cdp_war_effort_donations (campaign_id, created_at DESC);

ALTER TABLE cdp_war_effort_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE cdp_war_effort_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE cdp_war_effort_game_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE cdp_war_effort_donations ENABLE ROW LEVEL SECURITY;
