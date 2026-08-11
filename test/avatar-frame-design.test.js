import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

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

  assert.match(styles, /background: var\(--avatar-frame-image\) center \/ 100% 100% no-repeat/);
  assert.match(styles, /left: -18\.8%;[\s\S]*top: -18\.8%;[\s\S]*width: 137\.6%;[\s\S]*height: 137\.6%/);
  assert.match(styles, /\.avatar\.avatar-frame::after \{[\s\S]*?z-index: 2;[\s\S]*?border-radius: 0;/);
  assert.match(styles, /\.avatar\.avatar-frame \{[\s\S]*?aspect-ratio: 1;/);
  assert.match(styles, /\.avatar\.avatar-frame \.avatar-core \{[\s\S]*?inset: 7%;[\s\S]*?z-index: 1;/);
  assert.doesNotMatch(styles, /--avatar-frame-(?:left|top|width|height):/);
  for (const key of ["warrior", "mage", "warlock", "rogue", "druid", "shaman", "death-knight", "minions", "usagi", "toy-story"]) {
    assert.match(styles, new RegExp(`\\.avatar\\.avatar-frame-${key} \\{[\\s\\S]*?--avatar-frame-image:`));
    assert.match(assets, new RegExp(`avatar-frame-${key}\\.png`));
  }
  assert.doesNotMatch(app, /value: "(?:vip|emerald|violet|champion)", label: ".*头像/);
  assert.doesNotMatch(assets, /vip-avatar-frame\.png|avatar-frame-(?:emerald|violet|champion)\.png/);
});
