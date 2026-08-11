import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const appPath = fileURLToPath(new URL("../public/app.js", import.meta.url));
const stylesPath = fileURLToPath(new URL("../public/styles.css", import.meta.url));

test("房间提供传统与动态狗腿切换", async () => {
  const source = await readFile(appPath, "utf8");
  assert.match(source, /function renderDoglegModeControl\(\)/);
  assert.match(source, /data-action="dogleg-mode"/);
  assert.match(source, /传统狗腿/);
  assert.match(source, /动态狗腿/);
  assert.match(source, /\/dogleg-mode/);
});

test("动态狗腿牌按具体牌 ID 标记", async () => {
  const source = await readFile(appPath, "utf8");
  assert.match(source, /setup\.doglegMarkedCardId && card\?\.id === setup\.doglegMarkedCardId/);
  assert.match(source, /renderDoglegHandMark\(card\)/);
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
