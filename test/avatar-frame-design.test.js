import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

test("avatar-frame designer kit keeps the virtual framework without clipping interior artwork", async () => {
  const [spec, template, preview, materialMapSource] = await Promise.all([
    readFile(`${root}docs/avatar-frame-design-spec.md`, "utf8"),
    readFile(`${root}docs/assets/avatar-frame-template.svg`, "utf8"),
    readFile(`${root}docs/avatar-frame-preview.html`, "utf8"),
    readFile(`${root}docs/assets/avatar-frame-material-map.json`, "utf8")
  ]);
  const materialMap = JSON.parse(materialMapSource);

  assert.match(spec, /512 × 512/);
  assert.match(spec, /除设计本体外，其他区域必须真实透明/);
  assert.match(spec, /x=70\.\.442/);
  assert.match(spec, /头像外沿.*虚拟框架完全重合/);
  assert.match(spec, /虚拟框架只负责对齐，不生成透明遮罩或裁切边界/);
  assert.match(spec, /横向与纵向缩放比例必须完全相同/);
  assert.match(spec, /背景 < 头像图片 < 头像框/);
  assert.match(spec, /有无头像框都使用同一展示区/);
  assert.match(template, /viewBox="0 0 512 512"/);
  assert.match(template, /id="GUIDES_DO_NOT_EXPORT"/);
  assert.match(template, /x="70" y="70" width="372" height="372"/);
  assert.doesNotMatch(template, /x="128" y="128" width="256" height="256"/);
  assert.match(preview, /const sizes = \[38, 48, 80, 104\]/);
  assert.match(preview, /size \* 1\.376/);
  assert.match(preview, /alphaAt\(data, x, y\)/);
  assert.match(preview, /file\.size <= 1_200_000/);
  assert.doesNotMatch(preview, /coreClear|头像核心区透明/);
  assert.deepEqual(materialMap.virtualFrames["fixed-372"], {
    x: 70,
    y: 70,
    width: 372,
    height: 372
  });
  assert.deepEqual(materialMap.runtimeTransform, {
    mode: "uniform-contain",
    horizontalScaleEqualsVerticalScale: true,
    crop: false,
    interiorMask: false,
    perThemeTransform: false
  });
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

test("avatar frames always reserve one display box with portrait below frame art", async () => {
  const [styles, app, assets] = await Promise.all([
    readFile(`${root}public/styles.css`, "utf8"),
    readFile(`${root}public/app.js`, "utf8"),
    readFile(`${root}public/asset-versions.js`, "utf8")
  ]);

  assert.match(app, /class="avatar-frame-art"/);
  assert.match(styles, /\.avatar \{[\s\S]*?width: var\(--avatar-frame-box-size\);[\s\S]*?height: var\(--avatar-frame-box-size\);[\s\S]*?overflow: visible;/);
  assert.match(styles, /虚拟框架约为 372px[\s\S]*?1\.376 倍/);
  assert.match(styles, /\.avatar-core \{[\s\S]*?z-index: 1;[\s\S]*?width: var\(--avatar-portrait-size\);[\s\S]*?height: var\(--avatar-portrait-size\);/);
  assert.match(styles, /\.avatar\.avatar-frame > \.avatar-frame-art \{[\s\S]*?inset: 0;[\s\S]*?z-index: 2;[\s\S]*?width: 100%;[\s\S]*?height: 100%;[\s\S]*?object-fit: contain;/);
  assert.match(styles, /\.avatar \{[\s\S]*?--avatar-portrait-size: 48px;[\s\S]*?--avatar-frame-box-size: 66\.048px;/);
  assert.match(styles, /\.avatar\.shop-feature \{[\s\S]*?--avatar-portrait-size: 88px;[\s\S]*?--avatar-frame-box-size: 121\.088px;/);
  assert.match(styles, /\.table-player-avatar-stage \{[\s\S]*?width: 110\.08px;[\s\S]*?height: 110\.08px;/);
  assert.match(styles, /\.seat-hand-avatar-stage \{[\s\S]*?width: 143\.104px;[\s\S]*?height: 143\.104px;/);
  assert.match(styles, /\.avatar\.avatar-frame \.avatar-core img \{[\s\S]*?border-radius: 0;/);
  assert.doesNotMatch(styles, /left: -18\.8%|top: -18\.8%|width: 137\.6%|height: 137\.6%/);
  assert.doesNotMatch(styles, /\.avatar\.avatar-frame::(?:before|after)/);
  assert.doesNotMatch(styles, /--avatar-frame-(?:left|top|width|height):/);
  const frameArtworkRule = styles.match(/\.avatar\.avatar-frame > \.avatar-frame-art \{([^}]+)\}/)?.[1] || "";
  assert.doesNotMatch(frameArtworkRule, /transform:|object-fit:\s*cover/);
  assert.match(app, /data-avatar-frame-upload-preview/);
  assert.match(app, /admin-avatar-frame-product-preview/);
  assert.match(app, /avatar-frame-material-preview/);
  assert.doesNotMatch(app, /admin-avatar-frame-equipped/);
  for (const key of ["warrior", "mage", "warlock", "rogue", "druid", "shaman", "death-knight", "minions", "usagi", "toy-story"]) {
    assert.match(styles, new RegExp(`\\.avatar\\.avatar-frame-${key} \\{[\\s\\S]*?--avatar-frame-image:`));
    assert.match(assets, new RegExp(`avatar-frame-${key}\\.png`));
  }
  assert.doesNotMatch(app, /value: "(?:vip|emerald|violet|champion)", label: ".*头像/);
  assert.doesNotMatch(assets, /vip-avatar-frame\.png|avatar-frame-(?:emerald|violet|champion)\.png/);
});

test("every bundled avatar frame keeps its audited earliest material and fixed virtual framework", async () => {
  const cosmetics = `${root}public/assets/cosmetics`;
  const filenames = (await readdir(cosmetics))
    .filter((filename) => /^avatar-frame-.+\.png$/.test(filename))
    .sort();
  const materialMap = JSON.parse(await readFile(`${root}docs/assets/avatar-frame-material-map.json`, "utf8"));
  const mappedFilenames = materialMap.materials
    .map((material) => material.path.split("/").at(-1))
    .sort();

  assert.ok(filenames.length >= 10);
  assert.deepEqual(mappedFilenames, filenames);
  for (const material of materialMap.materials) {
    assert.equal(material.virtualFrame, "fixed-372", material.theme);
    assert.match(material.sourceRevision, /^[0-9a-f]{40}$/, material.theme);
    const filename = material.path.split("/").at(-1);
    const image = await readFile(`${cosmetics}/${filename}`);
    assert.equal(image.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", filename);
    assert.equal(image.readUInt32BE(16), 512, `${filename} width`);
    assert.equal(image.readUInt32BE(20), 512, `${filename} height`);
    assert.equal(createHash("sha256").update(image).digest("hex"), material.sha256, filename);
  }
});
