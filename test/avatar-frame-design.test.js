import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { decodeAvatarFrameDataUrl } from "../account-auth.js";

const root = fileURLToPath(new URL("../", import.meta.url));

test("avatar-frame designer kit defines one transparent foreground canvas", async () => {
  const [spec, template, preview] = await Promise.all([
    readFile(`${root}docs/avatar-frame-design-spec.md`, "utf8"),
    readFile(`${root}docs/assets/avatar-frame-template.svg`, "utf8"),
    readFile(`${root}docs/avatar-frame-preview.html`, "utf8")
  ]);

  assert.match(spec, /512 × 512/);
  assert.match(spec, /只有框体、徽记、装饰、阴影和必要的主题效果保留像素；其余区域必须真实透明/);
  assert.match(spec, /不设“内开口”“五官安全区”或其他强制透明分区/);
  assert.match(spec, /不依赖游戏页面/);
  assert.match(spec, /数字、字母、徽记、徽章和人物主体保持自然纵横比/);
  assert.match(template, /viewBox="0 0 512 512"/);
  assert.match(template, /id="GUIDES_DO_NOT_EXPORT"/);
  assert.match(template, /只有框体保留像素，其余区域完全透明/);
  assert.match(template, /不设内开口或安全区分割/);
  assert.match(preview, /const sizes = \[38, 48, 80, 104\]/);
  assert.match(preview, /alphaAt\(data, x, y\)/);
  assert.match(preview, /file\.size <= 1_200_000/);
  assert.doesNotMatch(preview, /openingClear|320 × 320 px 内开口/);
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
