export const ASSET_VERSIONS = Object.freeze({
  "/assets/joker-face-small.png": "f16ffbe9a2eb",
  "/assets/joker-face.png": "298272a943e8",
  "/assets/vip-avatar-frame.png": "ae1781546208",
  "/assets/cosmetics/avatar-frame-blood-elf.png": "5fc885896d09",
  "/assets/cosmetics/avatar-frame-champion.png": "73c38acd8663",
  "/assets/cosmetics/avatar-frame-emerald.png": "5c08b6afbf83",
  "/assets/cosmetics/avatar-frame-hellfire.png": "7843cf593d98",
  "/assets/cosmetics/avatar-frame-idol.png": "efac6f2dc0a2",
  "/assets/cosmetics/avatar-frame-stormwind.png": "ccce9c8057aa",
  "/assets/cosmetics/avatar-frame-violet.png": "3809ee7328a8",
  "/assets/cosmetics/card-frame-blood-elf.svg": "6a1cae96500c",
  "/assets/cosmetics/card-frame-champion.svg": "d3f762619feb",
  "/assets/cosmetics/card-frame-emerald.svg": "ecef883eb50e",
  "/assets/cosmetics/card-frame-hellfire.svg": "a353f739f20a",
  "/assets/cosmetics/card-frame-idol.svg": "c5093c865a32",
  "/assets/cosmetics/card-frame-stormwind.svg": "f28983af29bf",
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
    vip: versionedAssetUrl("/assets/vip-avatar-frame.png"),
    emerald: versionedAssetUrl("/assets/cosmetics/avatar-frame-emerald.png"),
    violet: versionedAssetUrl("/assets/cosmetics/avatar-frame-violet.png"),
    champion: versionedAssetUrl("/assets/cosmetics/avatar-frame-champion.png"),
    stormwind: versionedAssetUrl("/assets/cosmetics/avatar-frame-stormwind.png"),
    idol: versionedAssetUrl("/assets/cosmetics/avatar-frame-idol.png"),
    hellfire: versionedAssetUrl("/assets/cosmetics/avatar-frame-hellfire.png"),
    "blood-elf": versionedAssetUrl("/assets/cosmetics/avatar-frame-blood-elf.png")
  }),
  cardFrames: Object.freeze({
    emerald: versionedAssetUrl("/assets/cosmetics/card-frame-emerald.svg"),
    violet: versionedAssetUrl("/assets/cosmetics/card-frame-violet.svg"),
    champion: versionedAssetUrl("/assets/cosmetics/card-frame-champion.svg"),
    stormwind: versionedAssetUrl("/assets/cosmetics/card-frame-stormwind.svg"),
    idol: versionedAssetUrl("/assets/cosmetics/card-frame-idol.svg"),
    hellfire: versionedAssetUrl("/assets/cosmetics/card-frame-hellfire.svg"),
    "blood-elf": versionedAssetUrl("/assets/cosmetics/card-frame-blood-elf.svg")
  })
});
