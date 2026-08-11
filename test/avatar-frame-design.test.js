import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { decodeAvatarFrameDataUrl } from "../account-auth.js";

const root = fileURLToPath(new URL("../", import.meta.url));

test("avatar-frame designer kit shares one canvas and opening contract", async () => {
  const [spec, template, preview] = await Promise.all([
    readFile(`${root}docs/avatar-frame-design-spec.md`, "utf8"),
    readFile(`${root}docs/assets/avatar-frame-template.svg`, "utf8"),
    readFile(`${root}docs/avatar-frame-preview.html`, "utf8")
  ]);

  assert.match(spec, /512 × 512/);
  assert.match(spec, /x=96\.\.416、y=96\.\.416/);
  assert.match(spec, /320 × 320/);
  assert.match(spec, /整个标准内开口内所有像素的 Alpha 必须为 0/);
  assert.match(spec, /两侧窄导轨/);
  assert.match(spec, /24–40 px/);
  assert.match(spec, /不依赖游戏页面/);
  assert.match(spec, /每侧最多向外扩 88 px/);
  assert.match(spec, /数字、字母、徽记、徽章和人物主体保持自然纵横比/);
  assert.match(template, /viewBox="0 0 512 512"/);
  assert.match(template, /id="GUIDES_DO_NOT_EXPORT"/);
  assert.match(template, /x="96" y="96" width="320" height="320"/);
  assert.match(template, /x="128" y="128" width="256" height="256"/);
  assert.match(template, /x="40" y="96" width="56" height="320"/);
  assert.match(preview, /const sizes = \[38, 48, 80, 104\]/);
  assert.match(preview, /alphaAt\(data, x, y\)/);
  assert.match(preview, /file\.size <= 300 \* 1024/);
  assert.match(preview, /for \(let y = 96; y < 416/);
});

test("card skins use matte rails and the VIP card frame is static", async () => {
  const [styles, assets] = await Promise.all([
    readFile(`${root}public/styles.css`, "utf8"),
    readFile(`${root}public/asset-versions.js`, "utf8")
  ]);

  assert.match(styles, /--card-skin-accent/);
  assert.match(styles, /filter: saturate\(0\.72\) contrast\(0\.96\)/);
  assert.doesNotMatch(styles, /@keyframes vip-legend-card-aura/);
  assert.match(assets, /"vip-legend": versionedAssetUrl\("\/assets\/cosmetics\/card-frame-vip-legend\.svg"\)/);
});

test("avatar frames use one fixed square display box for every theme", async () => {
  const [styles, app, assets] = await Promise.all([
    readFile(`${root}public/styles.css`, "utf8"),
    readFile(`${root}public/app.js`, "utf8"),
    readFile(`${root}public/asset-versions.js`, "utf8")
  ]);

  assert.match(app, /class="avatar-frame-art"/);
  assert.match(styles, /\.avatar\.avatar-frame > \.avatar-frame-art \{[\s\S]*?inset: 0;[\s\S]*?z-index: 3;[\s\S]*?width: 100%;[\s\S]*?height: 100%;[\s\S]*?object-fit: fill;/);
  assert.match(styles, /\.avatar\.avatar-frame \{[\s\S]*?width: var\(--avatar-frame-box-size\);[\s\S]*?height: var\(--avatar-frame-box-size\);[\s\S]*?aspect-ratio: 1;/);
  assert.match(styles, /\.avatar\.shop-feature \{[\s\S]*?--avatar-portrait-size: 80px;[\s\S]*?--avatar-frame-box-size: 128px;/);
  assert.match(styles, /\.avatar\.avatar-frame \.avatar-core \{[\s\S]*?top: 50%;[\s\S]*?left: 50%;[\s\S]*?width: var\(--avatar-portrait-size\);[\s\S]*?height: var\(--avatar-portrait-size\);[\s\S]*?transform: translate\(-50%, -50%\);[\s\S]*?border: 0;[\s\S]*?overflow: hidden;[\s\S]*?z-index: 1;/);
  assert.match(styles, /\.avatar\.avatar-frame \.avatar-core img \{[\s\S]*?border-radius: 0;/);
  assert.doesNotMatch(styles, /left: -18\.8%|top: -18\.8%|width: 137\.6%|height: 137\.6%|137\.6%/);
  assert.doesNotMatch(styles, /\.avatar\.avatar-frame::(?:before|after)/);
  assert.doesNotMatch(styles, /--avatar-frame-(?:left|top|width|height):/);
  for (const key of ["warrior", "mage", "warlock", "rogue", "druid", "shaman", "death-knight", "minions", "usagi", "toy-story"]) {
    assert.match(styles, new RegExp(`\\.avatar\\.avatar-frame-${key} \\{[\\s\\S]*?--avatar-frame-image:`));
    assert.match(assets, new RegExp(`avatar-frame-${key}\\.png`));
  }
  assert.doesNotMatch(app, /value: "(?:vip|emerald|violet|champion)", label: ".*头像/);
  assert.doesNotMatch(assets, /vip-avatar-frame\.png|avatar-frame-(?:emerald|violet|champion)\.png/);
});

test("every bundled avatar frame satisfies the same pixel contract used by uploads", async () => {
  const cosmetics = `${root}public/assets/cosmetics`;
  const filenames = (await readdir(cosmetics))
    .filter((filename) => /^avatar-frame-.+\.png$/.test(filename));

  assert.ok(filenames.length >= 10);
  for (const filename of filenames) {
    const image = await readFile(`${cosmetics}/${filename}`);
    assert.doesNotThrow(
      () => decodeAvatarFrameDataUrl(`data:image/png;base64,${image.toString("base64")}`),
      filename
    );
  }
});
