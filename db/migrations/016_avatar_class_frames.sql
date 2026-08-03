UPDATE cdp_player_profiles
SET avatar_frame = ''
WHERE avatar_frame IN ('vip', 'emerald', 'violet', 'champion');

UPDATE cdp_shop_products
SET is_listed = false,
    updated_at = now()
WHERE product_id IN (
  'avatar-frame:vip',
  'avatar-frame:emerald',
  'avatar-frame:violet',
  'avatar-frame:champion'
);

ALTER TABLE cdp_player_profiles
  DROP CONSTRAINT IF EXISTS cdp_player_profiles_avatar_frame_check;

ALTER TABLE cdp_player_profiles
  ADD CONSTRAINT cdp_player_profiles_avatar_frame_check
  CHECK (avatar_frame IN (
    '',
    'stormwind',
    'idol',
    'hellfire',
    'blood-elf',
    'endless-winter',
    'cr7',
    'paladin',
    'vip-legend',
    'warrior',
    'mage',
    'warlock',
    'rogue',
    'druid',
    'shaman',
    'death-knight',
    'minions',
    'usagi',
    'toy-story'
  ));

INSERT INTO cdp_shop_products (
  product_id,
  product_type,
  asset_key,
  name,
  description,
  price,
  is_listed,
  sort_order
)
VALUES
  ('avatar-frame:stormwind', 'avatar_frame', 'stormwind', '皇家蓝城邦头像框', '永久解锁，可在我的皮肤中自由装备或卸下。', 450, true, 100),
  ('avatar-frame:idol', 'avatar_frame', 'idol', '剧场偶像头像框', '永久解锁，可在我的皮肤中自由装备或卸下。', 350, true, 101),
  ('avatar-frame:hellfire', 'avatar_frame', 'hellfire', '暗黑地狱头像框', '永久解锁，可在我的皮肤中自由装备或卸下。', 400, true, 102),
  ('avatar-frame:blood-elf', 'avatar_frame', 'blood-elf', '血精灵奥术头像框', '永久解锁，可在我的皮肤中自由装备或卸下。', 450, true, 103),
  ('avatar-frame:endless-winter', 'avatar_frame', 'endless-winter', '无尽冬日头像框', '永久解锁，可在我的皮肤中自由装备或卸下。', 400, true, 104),
  ('avatar-frame:cr7', 'avatar_frame', 'cr7', '7号传奇头像框', '永久解锁，可在我的皮肤中自由装备或卸下。', 400, true, 105),
  ('avatar-frame:paladin', 'avatar_frame', 'paladin', '圣光骑士头像框', '永久解锁，可在我的皮肤中自由装备或卸下。', 450, true, 106),
  ('avatar-frame:vip-legend', 'avatar_frame', 'vip-legend', '至尊星耀 VIP头像框', '永久解锁，可在我的皮肤中自由装备或卸下。', 500, true, 107),
  ('avatar-frame:warrior', 'avatar_frame', 'warrior', '魔兽战士头像框', '永久解锁，可在我的皮肤中自由装备或卸下。', 500, true, 108),
  ('avatar-frame:mage', 'avatar_frame', 'mage', '魔兽法师头像框', '永久解锁，可在我的皮肤中自由装备或卸下。', 450, true, 109),
  ('avatar-frame:warlock', 'avatar_frame', 'warlock', '魔兽术士头像框', '永久解锁，可在我的皮肤中自由装备或卸下。', 400, true, 110),
  ('avatar-frame:rogue', 'avatar_frame', 'rogue', '魔兽盗贼头像框', '永久解锁，可在我的皮肤中自由装备或卸下。', 400, true, 111),
  ('avatar-frame:druid', 'avatar_frame', 'druid', '魔兽德鲁伊头像框', '永久解锁，可在我的皮肤中自由装备或卸下。', 400, true, 112),
  ('avatar-frame:shaman', 'avatar_frame', 'shaman', '魔兽萨满祭司头像框', '永久解锁，可在我的皮肤中自由装备或卸下。', 500, true, 113),
  ('avatar-frame:death-knight', 'avatar_frame', 'death-knight', '魔兽死亡骑士头像框', '永久解锁，可在我的皮肤中自由装备或卸下。', 450, true, 114),
  ('avatar-frame:minions', 'avatar_frame', 'minions', '小黄人工坊头像框', '永久解锁，可在我的皮肤中自由装备或卸下。', 300, true, 115),
  ('avatar-frame:usagi', 'avatar_frame', 'usagi', '乌萨奇萌兔头像框', '永久解锁，可在我的皮肤中自由装备或卸下。', 300, true, 116),
  ('avatar-frame:toy-story', 'avatar_frame', 'toy-story', '玩具总动员头像框', '永久解锁，可在我的皮肤中自由装备或卸下。', 300, true, 117)
ON CONFLICT (product_id) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    price = EXCLUDED.price,
    is_listed = EXCLUDED.is_listed,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();
