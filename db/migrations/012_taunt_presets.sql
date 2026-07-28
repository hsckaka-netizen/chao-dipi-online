CREATE TABLE IF NOT EXISTS cdp_taunt_presets (
  taunt_id varchar(80) PRIMARY KEY,
  taunt_text varchar(80) NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  available_to_all boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES cdp_accounts(account_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cdp_taunt_presets_text_check CHECK (
    char_length(btrim(taunt_text)) BETWEEN 1 AND 40
  )
);

CREATE TABLE IF NOT EXISTS cdp_taunt_preset_access (
  taunt_id varchar(80) NOT NULL REFERENCES cdp_taunt_presets(taunt_id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES cdp_accounts(account_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (taunt_id, account_id)
);

CREATE INDEX IF NOT EXISTS cdp_taunt_preset_access_account_idx
  ON cdp_taunt_preset_access (account_id, taunt_id);

INSERT INTO cdp_taunt_presets (
  taunt_id, taunt_text, enabled, available_to_all, sort_order
) VALUES
  ('thats-it', '就这？', true, true, 10),
  ('dare-play', '这牌你也敢出？', true, true, 20),
  ('lucky', '算你运气好！', true, true, 30),
  ('wait-for-it', '别急，好戏在后头。', true, true, 40),
  ('read-you', '你的牌我看穿了。', true, true, 50),
  ('free-points', '谢谢老板送分！', true, true, 60),
  ('take-your-time', '慢慢想，我等得起。', true, true, 70),
  ('nice-try', '差一点就压住我了。', true, true, 80)
ON CONFLICT (taunt_id) DO NOTHING;

ALTER TABLE cdp_taunt_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE cdp_taunt_preset_access ENABLE ROW LEVEL SECURITY;
