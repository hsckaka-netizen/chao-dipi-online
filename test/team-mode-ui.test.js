import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const appPath = fileURLToPath(new URL("../public/app.js", import.meta.url));
const stylesPath = fileURLToPath(new URL("../public/styles.css", import.meta.url));
const serverPath = fileURLToPath(new URL("../server.js", import.meta.url));

test("lobby exposes PVP brawl, team, PVE, team assignment, and rematch controls", async () => {
  const [appSource, stylesSource, serverSource] = await Promise.all([
    readFile(appPath, "utf8"),
    readFile(stylesPath, "utf8"),
    readFile(serverPath, "utf8")
  ]);

  assert.match(appSource, /data-action="game-mode" data-mode="pvp"/);
  assert.match(appSource, /data-action="game-mode" data-mode="pve"/);
  assert.match(appSource, /data-action="play-mode" data-mode="brawl"/);
  assert.match(appSource, /data-action="play-mode" data-mode="team"/);
  assert.match(appSource, /data-action="pve-human-count"/);
  assert.match(appSource, /data-action="random-teams"/);
  assert.match(appSource, /data-action="auto-random-teams"/);
  assert.match(appSource, /data-action="select-team"/);
  assert.match(appSource, /PVE 未获胜，本局不发钻石/);
  assert.match(appSource, /获胜收益为同等 PVP 奖励的 50%/);
  assert.match(stylesSource, /\.team-lobby-grid/);
  assert.match(serverSource, /pathParts\[3\] === "game-mode"/);
  assert.match(serverSource, /pathParts\[3\] === "play-mode"/);
  assert.match(serverSource, /pathParts\[3\] === "random-teams"/);
  assert.match(serverSource, /pathParts\[3\] === "auto-random-teams"/);
});

test("leaderboard filters PVP and PVE by play mode and valid player counts", async () => {
  const appSource = await readFile(appPath, "utf8");

  assert.match(appSource, /data-action="select-statistics-game-mode"/);
  assert.match(appSource, /data-action="select-statistics-play-mode"/);
  assert.match(appSource, /data-action="select-statistics-player-count"/);
  assert.match(appSource, /if \(statisticsGameMode === "pve"\) return \[4, 6, 8\]/);
  assert.match(appSource, /if \(statisticsPlayMode === "brawl"\) return \[5, 6, 7, 8, 9\]/);
  assert.match(appSource, /return \[4, 5, 6, 7, 8, 9\]/);
});
