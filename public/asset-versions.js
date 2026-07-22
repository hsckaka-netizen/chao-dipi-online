export const ASSET_VERSIONS = Object.freeze({
  "/assets/joker-face-small.png": "f16ffbe9a2eb",
  "/assets/joker-face.png": "298272a943e8",
  "/assets/vip-avatar-frame.png": "ae1781546208",
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
  vipAvatarFrame: versionedAssetUrl("/assets/vip-avatar-frame.png")
});
