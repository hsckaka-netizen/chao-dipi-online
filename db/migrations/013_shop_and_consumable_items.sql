CREATE TABLE IF NOT EXISTS cdp_shop_products (
  product_id varchar(80) PRIMARY KEY,
  product_type varchar(32) NOT NULL,
  asset_key varchar(40) NOT NULL,
  name varchar(80) NOT NULL,
  description text NOT NULL DEFAULT '',
  price integer NOT NULL,
  is_listed boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  updated_by uuid REFERENCES cdp_accounts(account_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_type, asset_key),
  CONSTRAINT cdp_shop_products_type_check CHECK (product_type IN ('avatar_frame', 'card_skin', 'consumable_item')),
  CONSTRAINT cdp_shop_products_price_check CHECK (price > 0)
);

CREATE TABLE IF NOT EXISTS cdp_shop_purchases (
  purchase_id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES cdp_accounts(account_id) ON DELETE CASCADE,
  product_id varchar(80) NOT NULL REFERENCES cdp_shop_products(product_id) ON DELETE RESTRICT,
  price integer NOT NULL,
  balance_after bigint NOT NULL,
  request_id varchar(120) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, request_id),
  CONSTRAINT cdp_shop_purchases_price_check CHECK (price > 0),
  CONSTRAINT cdp_shop_purchases_balance_check CHECK (balance_after >= 0)
);

CREATE TABLE IF NOT EXISTS cdp_cosmetic_entitlements (
  account_id uuid NOT NULL REFERENCES cdp_accounts(account_id) ON DELETE CASCADE,
  cosmetic_type varchar(24) NOT NULL,
  cosmetic_key varchar(40) NOT NULL,
  source varchar(24) NOT NULL,
  source_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, cosmetic_type, cosmetic_key),
  CONSTRAINT cdp_cosmetic_entitlements_type_check CHECK (cosmetic_type IN ('avatar_frame', 'card_skin')),
  CONSTRAINT cdp_cosmetic_entitlements_source_check CHECK (source IN ('migration', 'purchase', 'admin_grant'))
);

CREATE TABLE IF NOT EXISTS cdp_consumable_inventory (
  account_id uuid NOT NULL REFERENCES cdp_accounts(account_id) ON DELETE CASCADE,
  item_id varchar(40) NOT NULL,
  available_quantity integer NOT NULL DEFAULT 0,
  reserved_quantity integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, item_id),
  CONSTRAINT cdp_consumable_inventory_available_check CHECK (available_quantity >= 0),
  CONSTRAINT cdp_consumable_inventory_reserved_check CHECK (reserved_quantity >= 0)
);

CREATE TABLE IF NOT EXISTS cdp_game_item_uses (
  use_id uuid PRIMARY KEY,
  game_id uuid NOT NULL,
  room_player_id text NOT NULL,
  account_id uuid NOT NULL REFERENCES cdp_accounts(account_id) ON DELETE CASCADE,
  item_id varchar(40) NOT NULL,
  status varchar(20) NOT NULL,
  request_id varchar(120) NOT NULL,
  effect_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  used_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  UNIQUE (account_id, request_id),
  UNIQUE (game_id, account_id, item_id),
  CONSTRAINT cdp_game_item_uses_status_check CHECK (status IN ('reserved', 'consumed', 'refunded'))
);

CREATE TABLE IF NOT EXISTS cdp_consumable_ledger (
  ledger_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES cdp_accounts(account_id) ON DELETE CASCADE,
  item_id varchar(40) NOT NULL,
  available_delta integer NOT NULL DEFAULT 0,
  reserved_delta integer NOT NULL DEFAULT 0,
  available_after integer NOT NULL,
  reserved_after integer NOT NULL,
  reason varchar(24) NOT NULL,
  purchase_id uuid REFERENCES cdp_shop_purchases(purchase_id) ON DELETE RESTRICT,
  use_id uuid REFERENCES cdp_game_item_uses(use_id) ON DELETE RESTRICT,
  idempotency_key varchar(180) NOT NULL UNIQUE,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cdp_consumable_ledger_delta_check CHECK (available_delta <> 0 OR reserved_delta <> 0),
  CONSTRAINT cdp_consumable_ledger_after_check CHECK (available_after >= 0 AND reserved_after >= 0)
);

CREATE TABLE IF NOT EXISTS cdp_admin_cosmetic_grants (
  grant_id uuid PRIMARY KEY,
  admin_account_id uuid NOT NULL REFERENCES cdp_accounts(account_id) ON DELETE RESTRICT,
  account_id uuid NOT NULL REFERENCES cdp_accounts(account_id) ON DELETE CASCADE,
  cosmetic_type varchar(24) NOT NULL,
  cosmetic_key varchar(40) NOT NULL,
  request_id varchar(120) NOT NULL,
  reason varchar(160) NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (admin_account_id, request_id)
);

CREATE TABLE IF NOT EXISTS cdp_shop_product_audit (
  audit_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id varchar(80) NOT NULL REFERENCES cdp_shop_products(product_id) ON DELETE RESTRICT,
  admin_account_id uuid NOT NULL REFERENCES cdp_accounts(account_id) ON DELETE RESTRICT,
  before_data jsonb NOT NULL,
  after_data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cdp_game_score_adjustments (
  adjustment_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_id uuid NOT NULL REFERENCES cdp_games(game_id) ON DELETE CASCADE,
  source_room_player_id text NOT NULL,
  recipient_room_player_id text NOT NULL,
  adjustment_type varchar(32) NOT NULL,
  delta numeric(10, 2) NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_id, source_room_player_id, recipient_room_player_id, adjustment_type)
);

ALTER TABLE cdp_game_players ADD COLUMN IF NOT EXISTS base_game_score numeric(10, 2);
ALTER TABLE cdp_game_players ADD COLUMN IF NOT EXISTS item_self_delta numeric(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE cdp_game_players ADD COLUMN IF NOT EXISTS item_opponent_delta numeric(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE cdp_game_players ADD COLUMN IF NOT EXISTS item_score_delta numeric(10, 2) NOT NULL DEFAULT 0;
UPDATE cdp_game_players SET base_game_score = game_score WHERE base_game_score IS NULL;
ALTER TABLE cdp_game_players ALTER COLUMN base_game_score SET DEFAULT 0;
ALTER TABLE cdp_game_players ALTER COLUMN base_game_score SET NOT NULL;

INSERT INTO cdp_shop_products (product_id, product_type, asset_key, name, description, price, is_listed, sort_order)
VALUES
  ('avatar-frame:vip', 'avatar_frame', 'vip', '经典 VIP头像框', '永久解锁，可自由装备。', 100, true, 100),
  ('avatar-frame:emerald', 'avatar_frame', 'emerald', '翡翠头像框', '永久解锁，可自由装备。', 100, true, 101),
  ('avatar-frame:violet', 'avatar_frame', 'violet', '紫晶头像框', '永久解锁，可自由装备。', 100, true, 102),
  ('avatar-frame:champion', 'avatar_frame', 'champion', '冠军头像框', '永久解锁，可自由装备。', 100, true, 103),
  ('avatar-frame:stormwind', 'avatar_frame', 'stormwind', '皇家蓝城邦头像框', '永久解锁，可自由装备。', 100, true, 104),
  ('avatar-frame:idol', 'avatar_frame', 'idol', '剧场偶像头像框', '永久解锁，可自由装备。', 100, true, 105),
  ('avatar-frame:hellfire', 'avatar_frame', 'hellfire', '暗黑地狱头像框', '永久解锁，可自由装备。', 100, true, 106),
  ('avatar-frame:blood-elf', 'avatar_frame', 'blood-elf', '血精灵奥术头像框', '永久解锁，可自由装备。', 100, true, 107),
  ('avatar-frame:endless-winter', 'avatar_frame', 'endless-winter', '无尽冬日头像框', '永久解锁，可自由装备。', 100, true, 108),
  ('avatar-frame:cr7', 'avatar_frame', 'cr7', '7号传奇头像框', '永久解锁，可自由装备。', 100, true, 109),
  ('avatar-frame:paladin', 'avatar_frame', 'paladin', '圣光骑士头像框', '永久解锁，可自由装备。', 100, true, 110),
  ('avatar-frame:vip-legend', 'avatar_frame', 'vip-legend', '至尊星耀 VIP头像框', '永久解锁，可自由装备。', 300, true, 111),
  ('card-skin:emerald', 'card_skin', 'emerald', '翡翠牌面边框', '永久解锁，只改变牌面边框。', 100, true, 200),
  ('card-skin:violet', 'card_skin', 'violet', '紫晶牌面边框', '永久解锁，只改变牌面边框。', 100, true, 201),
  ('card-skin:champion', 'card_skin', 'champion', '冠军牌面边框', '永久解锁，只改变牌面边框。', 100, true, 202),
  ('card-skin:stormwind', 'card_skin', 'stormwind', '皇家蓝城邦牌面边框', '永久解锁，只改变牌面边框。', 100, true, 203),
  ('card-skin:idol', 'card_skin', 'idol', '剧场偶像牌面边框', '永久解锁，只改变牌面边框。', 100, true, 204),
  ('card-skin:hellfire', 'card_skin', 'hellfire', '暗黑地狱牌面边框', '永久解锁，只改变牌面边框。', 100, true, 205),
  ('card-skin:blood-elf', 'card_skin', 'blood-elf', '血精灵奥术牌面边框', '永久解锁，只改变牌面边框。', 100, true, 206),
  ('card-skin:endless-winter', 'card_skin', 'endless-winter', '无尽冬日牌面边框', '永久解锁，只改变牌面边框。', 100, true, 207),
  ('card-skin:cr7', 'card_skin', 'cr7', '7号传奇牌面边框', '永久解锁，只改变牌面边框。', 100, true, 208),
  ('card-skin:paladin', 'card_skin', 'paladin', '圣光骑士牌面边框', '永久解锁，只改变牌面边框。', 100, true, 209),
  ('card-skin:vip-legend', 'card_skin', 'vip-legend', '至尊星耀 VIP牌面边框', '永久解锁，只改变牌面边框。', 300, true, 210),
  ('consumable:restart-card', 'consumable_item', 'restart-card', '重开卡', '叫庄结束前作废当前牌局并重新发牌。', 80, true, 310),
  ('consumable:war-god-card', 'consumable_item', 'war-god-card', '战神卡', '原始积分翻倍，额外积分由最终对方阵营承担。', 50, true, 320),
  ('consumable:colorful-card', 'consumable_item', 'colorful-card', '缤纷卡', '随机改变炒底阶段四种花色 2 的压制顺序。', 30, true, 330),
  ('consumable:luck-card', 'consumable_item', 'luck-card', '牌运卡', '本局头像展示牌运之神的庇佑效果。', 10, true, 340)
ON CONFLICT (product_id) DO NOTHING;

INSERT INTO cdp_cosmetic_entitlements (account_id, cosmetic_type, cosmetic_key, source, source_id)
SELECT account_id, 'avatar_frame', avatar_frame, 'migration', profile_id
FROM cdp_player_profiles
WHERE account_id IS NOT NULL AND avatar_frame <> ''
ON CONFLICT DO NOTHING;

INSERT INTO cdp_cosmetic_entitlements (account_id, cosmetic_type, cosmetic_key, source, source_id)
SELECT account_id, 'card_skin', card_skin, 'migration', profile_id
FROM cdp_player_profiles
WHERE account_id IS NOT NULL AND card_skin <> ''
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS cdp_shop_products_listed_idx ON cdp_shop_products (is_listed, sort_order, product_id);
CREATE INDEX IF NOT EXISTS cdp_shop_purchases_account_idx ON cdp_shop_purchases (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cdp_game_item_uses_game_idx ON cdp_game_item_uses (game_id, status);

ALTER TABLE cdp_shop_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE cdp_shop_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE cdp_cosmetic_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE cdp_consumable_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE cdp_game_item_uses ENABLE ROW LEVEL SECURITY;
ALTER TABLE cdp_consumable_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE cdp_admin_cosmetic_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE cdp_shop_product_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE cdp_game_score_adjustments ENABLE ROW LEVEL SECURITY;
