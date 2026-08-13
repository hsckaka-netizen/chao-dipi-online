export const ASSET_VERSIONS = Object.freeze({
  "/assets/joker-face-small.png": "f16ffbe9a2eb",
  "/assets/joker-face.png": "298272a943e8",
  "/assets/cosmetics/avatar-frame-blood-elf.png": "85c485779c9b",
  "/assets/cosmetics/avatar-frame-cr7.png": "87a2d4b9d13f",
  "/assets/cosmetics/avatar-frame-death-knight.png": "dc144a4b9ee8",
  "/assets/cosmetics/avatar-frame-druid.png": "7767f7908f29",
  "/assets/cosmetics/avatar-frame-endless-winter.png": "8a4bb6b99f61",
  "/assets/cosmetics/avatar-frame-hellfire.png": "366ade0a89b5",
  "/assets/cosmetics/avatar-frame-idol.png": "7a67046a8630",
  "/assets/cosmetics/avatar-frame-mage.png": "a460c2535d02",
  "/assets/cosmetics/avatar-frame-minions.png": "22571e919506",
  "/assets/cosmetics/avatar-frame-paladin.png": "3defad87ccfa",
  "/assets/cosmetics/avatar-frame-rogue.png": "9b15223af6aa",
  "/assets/cosmetics/avatar-frame-shaman.png": "3e8365616986",
  "/assets/cosmetics/avatar-frame-stormwind.png": "b4792983b975",
  "/assets/cosmetics/avatar-frame-toy-story.png": "74a7c5806170",
  "/assets/cosmetics/avatar-frame-usagi.png": "da5fc65ec6c5",
  "/assets/cosmetics/avatar-frame-warlock.png": "fc00e33ecddf",
  "/assets/cosmetics/avatar-frame-warrior.png": "7d400be96a1d",
  "/assets/cosmetics/card-frame-blood-elf.svg": "6a1cae96500c",
  "/assets/cosmetics/card-frame-champion.svg": "d3f762619feb",
  "/assets/cosmetics/card-frame-cr7.svg": "5597d59e2319",
  "/assets/cosmetics/card-frame-emerald.svg": "ecef883eb50e",
  "/assets/cosmetics/card-frame-endless-winter.svg": "136ce09cef66",
  "/assets/cosmetics/card-frame-hellfire.svg": "a353f739f20a",
  "/assets/cosmetics/card-frame-idol.svg": "c5093c865a32",
  "/assets/cosmetics/card-frame-paladin.svg": "c88c2a3e6440",
  "/assets/cosmetics/card-frame-stormwind.svg": "f28983af29bf",
  "/assets/cosmetics/card-frame-vip-legend.gif": "45b14f7f7d24",
  "/assets/cosmetics/card-frame-vip-legend.svg": "f5e9f712a290",
  "/assets/cosmetics/card-frame-violet.svg": "c104495e5b58",
  "/assets/avatars/benlei.png": "d699949c7781",
  "/assets/avatars/biesan.png": "a66d00372b8e",
  "/assets/avatars/chenran.png": "b4222318b1f0",
  "/assets/avatars/diaonan.png": "fa8dcdbbb5b5",
  "/assets/avatars/gelu.png": "fb67a4473f31",
  "/assets/avatars/jiangmen.png": "22483a8f011f",
  "/assets/avatars/jiangzha.png": "d342e93ca165",
  "/assets/avatars/kaxiang.png": "1a29bffef210",
  "/assets/avatars/lafang.png": "20c7f5c03280",
  "/assets/avatars/shuainan.png": "907008aa30f2",
  "/assets/avatars/tieniu.png": "8dda781360f2",
  "/assets/avatars/xiaoxu.png": "2bde5d3243f5"
});

export function versionedAssetUrl(value) {
  const url = String(value || "");
  const pathname = url.split(/[?#]/, 1)[0];
  const version = ASSET_VERSIONS[pathname];
  return version ? `${pathname}?v=${version}` : url;
}

export const ASSET_URLS = Object.freeze({
  jokerFace: versionedAssetUrl("/assets/joker-face.png"),
  jokerFaceSmall: versionedAssetUrl("/assets/joker-face-small.png"),
  avatarFrames: Object.freeze({
    stormwind: versionedAssetUrl("/assets/cosmetics/avatar-frame-stormwind.png"),
    idol: versionedAssetUrl("/assets/cosmetics/avatar-frame-idol.png"),
    hellfire: versionedAssetUrl("/assets/cosmetics/avatar-frame-hellfire.png"),
    "blood-elf": versionedAssetUrl("/assets/cosmetics/avatar-frame-blood-elf.png"),
    "endless-winter": versionedAssetUrl("/assets/cosmetics/avatar-frame-endless-winter.png"),
    cr7: versionedAssetUrl("/assets/cosmetics/avatar-frame-cr7.png"),
    paladin: versionedAssetUrl("/assets/cosmetics/avatar-frame-paladin.png"),
    warrior: versionedAssetUrl("/assets/cosmetics/avatar-frame-warrior.png"),
    mage: versionedAssetUrl("/assets/cosmetics/avatar-frame-mage.png"),
    warlock: versionedAssetUrl("/assets/cosmetics/avatar-frame-warlock.png"),
    rogue: versionedAssetUrl("/assets/cosmetics/avatar-frame-rogue.png"),
    druid: versionedAssetUrl("/assets/cosmetics/avatar-frame-druid.png"),
    shaman: versionedAssetUrl("/assets/cosmetics/avatar-frame-shaman.png"),
    "death-knight": versionedAssetUrl("/assets/cosmetics/avatar-frame-death-knight.png"),
    minions: versionedAssetUrl("/assets/cosmetics/avatar-frame-minions.png"),
    usagi: versionedAssetUrl("/assets/cosmetics/avatar-frame-usagi.png"),
    "toy-story": versionedAssetUrl("/assets/cosmetics/avatar-frame-toy-story.png")
  }),
  cardFrames: Object.freeze({
    emerald: versionedAssetUrl("/assets/cosmetics/card-frame-emerald.svg"),
    violet: versionedAssetUrl("/assets/cosmetics/card-frame-violet.svg"),
    champion: versionedAssetUrl("/assets/cosmetics/card-frame-champion.svg"),
    stormwind: versionedAssetUrl("/assets/cosmetics/card-frame-stormwind.svg"),
    idol: versionedAssetUrl("/assets/cosmetics/card-frame-idol.svg"),
    hellfire: versionedAssetUrl("/assets/cosmetics/card-frame-hellfire.svg"),
    "blood-elf": versionedAssetUrl("/assets/cosmetics/card-frame-blood-elf.svg"),
    "endless-winter": versionedAssetUrl("/assets/cosmetics/card-frame-endless-winter.svg"),
    cr7: versionedAssetUrl("/assets/cosmetics/card-frame-cr7.svg"),
    paladin: versionedAssetUrl("/assets/cosmetics/card-frame-paladin.svg"),
    "vip-legend": versionedAssetUrl("/assets/cosmetics/card-frame-vip-legend.svg")
  }),
  staticAvatarFrames: Object.freeze({}),
  staticCardFrames: Object.freeze({
    "vip-legend": versionedAssetUrl("/assets/cosmetics/card-frame-vip-legend.svg")
  })
});
