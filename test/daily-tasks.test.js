import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  beijingDailyTaskWindow,
  buildDailyTaskState,
  DAILY_TASK_RULES
} from "../daily-tasks.js";

test("daily task definitions keep refresh, targets, and rewards in one configuration", () => {
  assert.equal(DAILY_TASK_RULES.refreshHourBeijing, 6);
  assert.deepEqual(DAILY_TASK_RULES.tasks.map((task) => ({
    id: task.id,
    target: task.target,
    diamonds: task.rewardDiamonds,
    materials: task.rewardMaterials
  })), [
    { id: "complete-game-1", target: 1, diamonds: 500, materials: 100 },
    { id: "complete-game-3", target: 3, diamonds: 300, materials: 50 },
    { id: "win-game-1", target: 1, diamonds: 300, materials: 50 },
    { id: "become-banker-1", target: 1, diamonds: 300, materials: 50 },
    { id: "win-bottom-1", target: 1, diamonds: 300, materials: 50 },
    { id: "earn-trick-score-500", target: 500, diamonds: 300, materials: 50 }
  ]);
});

test("daily task window switches exactly at Beijing 06:00", () => {
  assert.deepEqual(beijingDailyTaskWindow("2026-08-25T21:59:59.999Z"), {
    refreshKey: "2026-08-25",
    startAt: "2026-08-24T22:00:00.000Z",
    nextRefreshAt: "2026-08-25T22:00:00.000Z"
  });
  assert.deepEqual(beijingDailyTaskWindow("2026-08-25T22:00:00.000Z"), {
    refreshKey: "2026-08-26",
    startAt: "2026-08-25T22:00:00.000Z",
    nextRefreshAt: "2026-08-26T22:00:00.000Z"
  });
});

test("daily task progress is capped only in presentation and claims are independent", () => {
  const state = buildDailyTaskState({
    gamesCompleted: 4,
    gamesWon: 1,
    bankerGames: 0,
    bottomWins: 2,
    trickScore: 620
  }, ["complete-game-1"], "2026-08-25T22:00:00.000Z");
  assert.equal(state.tasks.find((task) => task.id === "complete-game-1").claimed, true);
  assert.equal(state.tasks.find((task) => task.id === "complete-game-3").completed, true);
  assert.equal(state.tasks.find((task) => task.id === "become-banker-1").completed, false);
  assert.equal(state.tasks.find((task) => task.id === "earn-trick-score-500").progress, 620);
});

test("daily task persistence, claim endpoint, and UI are server-authoritative", async () => {
  const [historySource, serverSource, appSource, migration] = await Promise.all([
    readFile(new URL("../game-history.js", import.meta.url), "utf8"),
    readFile(new URL("../server.js", import.meta.url), "utf8"),
    readFile(new URL("../public/app.js", import.meta.url), "utf8"),
    readFile(new URL("../db/migrations/028_daily_game_tasks.sql", import.meta.url), "utf8")
  ]);
  assert.match(historySource, /game\.banker_room_player_id = player\.room_player_id/);
  assert.match(historySource, /game\.bottom_winner_room_player_id = player\.room_player_id/);
  assert.match(historySource, /coalesce\(sum\(player\.trick_score\), 0\)/);
  assert.match(historySource, /lifetime_earned = lifetime_earned \+ \$2/);
  assert.match(historySource, /building_materials = building_materials \+ \$2/);
  assert.match(historySource, /'daily_task_reward'/);
  assert.match(serverSource, /pathParts\[2\] === "daily-tasks" && pathParts\[3\] === "claim"/);
  assert.match(appSource, /每天北京时间06:00刷新/);
  assert.match(appSource, /data-action="claim-daily-task"/);
  assert.match(migration, /PRIMARY KEY \(account_id, refresh_key, task_id\)/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
});
