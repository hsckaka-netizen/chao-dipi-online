import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const appPath = fileURLToPath(new URL("../public/app.js", import.meta.url));
const stylesPath = fileURLToPath(new URL("../public/styles.css", import.meta.url));

test("房间提供传统、动态、暗狗腿与顺位狗腿切换", async () => {
  const source = await readFile(appPath, "utf8");
  assert.match(source, /function renderDoglegModeControl\(\)/);
  assert.match(source, /data-action="dogleg-mode"/);
  assert.match(source, /传统狗腿/);
  assert.match(source, /动态狗腿/);
  assert.match(source, /暗狗腿/);
  assert.match(source, /顺位狗腿/);
  assert.match(source, /random-order/);
  assert.match(source, /\/dogleg-mode/);
});

test("准备阶段向所有玩家展示狗腿模式与狗腿数", async () => {
  const source = await readFile(appPath, "utf8");
  assert.match(source, /狗腿模式：\$\{escapeHtml\(state\.doglegModeName/);
  assert.match(source, /狗腿数：\$\{escapeHtml\(state\.setup\?\.doglegNeeded \?\? 0\)\} 个/);
  assert.match(source, /preparationTag\("传统狗腿"\)/);
  assert.match(source, /preparationTag\("顺位狗腿", "random-order"\)/);
});

test("新房间默认庄家承余并允许房主切回庄队均摊", async () => {
  const source = await readFile(appPath, "utf8");
  assert.match(source, /function renderBankerScoreModeControl\(\)/);
  assert.match(source, /data-action="banker-score-mode"/);
  assert.match(source, /庄家承余/);
  assert.match(source, /庄队均摊/);
  assert.match(source, /\/banker-score-mode/);
});

test("动态狗腿牌按具体牌 ID 标记", async () => {
  const source = await readFile(appPath, "utf8");
  assert.match(source, /setup\.doglegMarkedCardId && card\?\.id === setup\.doglegMarkedCardId/);
  assert.match(source, /renderDoglegHandMark\(card\)/);
});

test("暗狗腿沿用具体牌爪印，并展示公开人数", async () => {
  const source = await readFile(appPath, "utf8");
  assert.match(source, /setup\.doglegMode === "dynamic"/);
  assert.match(source, /setup\.doglegMode === "hidden"/);
  assert.match(source, /暗狗腿 <i>\$\{names\.length\}\/\$\{needed\}<\/i>/);
  assert.match(source, /随机确定固定狗腿，专属狗腿牌打出后公开身份/);
});

test("顺位狗腿显示同色同点双花色牌、生效顺位和当前计数", async () => {
  const source = await readFile(appPath, "utf8");
  assert.match(source, /card\.suits\.map\(\(suit\) => `\$\{symbols\[suit\] \|\| ""\}\$\{card\.rank\}`\)/);
  assert.match(source, /生效顺位：\$\{positions\}/);
  assert.match(source, /class="tag table-dogleg-tag random-order"/);
  assert.match(source, /<span>顺位 \$\{escapeHtml\(compactPositions\)\}<\/span>/);
  assert.match(source, /<span>计 \$\{sequence\}<\/span>/);
  assert.match(source, /<span>狗腿 \$\{escapeHtml\(compactDoglegNames\)\}<\/span>/);
  assert.doesNotMatch(source, /setup\.doglegCandidateCount/);
  assert.match(source, /names\.length \? names\.join\("、"\) : "尚未出现"/);
  assert.match(source, /doglegCard\.type === "joker"/);
  assert.match(source, /正副皇牌组/);
  assert.match(source, /card\.rank === doglegCard\.rank && card\.color === doglegCard\.color/);
});

test("头像边为每个累计标记渲染一个爪印图标", async () => {
  const [source, styles] = await Promise.all([
    readFile(appPath, "utf8"),
    readFile(stylesPath, "utf8")
  ]);
  assert.match(source, /Array\.from\(\{ length: count \}, \(\) => `<span class="dogleg-mark-icon"/);
  assert.match(source, /renderDoglegMarks\(play\.playerId\)/);
  assert.match(styles, /\.dogleg-mark-icons\s*\{/);
  assert.match(styles, /\.dogleg-mark-icon svg\s*\{/);
  assert.match(source, /role === "狗腿"/);
});
