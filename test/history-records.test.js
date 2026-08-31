import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  createHistoryTrickEntry,
  filterHistoryTimelineEntries,
  orderedTrickPlays
} from "../public/history-records.js";

const appPath = fileURLToPath(new URL("../public/app.js", import.meta.url));
const stylesPath = fileURLToPath(new URL("../public/styles.css", import.meta.url));

test("玩家牌局历史可在保存结算与出牌记录之间切换", async () => {
  const source = await readFile(appPath, "utf8");
  assert.match(source, /function renderStoredGameSettlement\(game\)/);
  assert.match(source, /data-history-view="settlement"/);
  assert.match(source, /data-history-view="history"/);
  assert.match(source, /使用当局保存结果，不重新计算/);
});

function card(id, suit) {
  return { id, type: "normal", suit, rank: "A" };
}

test("history keeps each round together and orders players by actual play order", () => {
  const trick = {
    number: 7,
    winnerId: "b",
    points: 20,
    plays: [
      { playerId: "c", turnIndex: 2, at: "2026-07-29T10:00:03.000Z", cards: [card("c1", "C")] },
      { playerId: "a", turnIndex: 0, at: "2026-07-29T10:00:01.000Z", cards: [card("a1", "S")] },
      { playerId: "b", turnIndex: 1, at: "2026-07-29T10:00:02.000Z", cards: [card("b1", "H")] }
    ]
  };

  assert.deepEqual(orderedTrickPlays(trick).map((play) => play.playerId), ["a", "b", "c"]);
  const entry = createHistoryTrickEntry(trick, {
    playerName: (playerId) => playerId.toUpperCase(),
    playerRole: () => "闲家",
    playSuits: (cards) => cards.map((item) => item.suit)
  });

  assert.equal(entry.kind, "trick");
  assert.deepEqual(entry.plays.map((play) => play.order), [1, 2, 3]);
  assert.deepEqual(entry.plays.map((play) => play.playerName), ["A", "B", "C"]);
  assert.equal(entry.plays[1].winning, true);
  assert.deepEqual(entry.suits, ["S", "H", "C"]);
});

test("suit filters keep the whole round when any play contains that suit", () => {
  const matchingRound = {
    kind: "trick",
    number: 1,
    suits: ["S", "H"],
    plays: [
      { playerId: "a", suits: ["S"] },
      { playerId: "b", suits: ["H"] },
      { playerId: "c", suits: ["S"] }
    ]
  };
  const otherRound = {
    kind: "trick",
    number: 2,
    suits: ["C"],
    plays: [{ playerId: "a", suits: ["C"] }]
  };
  const fry = { kind: "fry", text: "炒底" };

  assert.deepEqual(
    filterHistoryTimelineEntries([fry, matchingRound, otherRound], "suit:H"),
    [matchingRound]
  );
  assert.equal(
    filterHistoryTimelineEntries([fry, matchingRound, otherRound], "suit:H")[0].plays.length,
    3
  );
  assert.deepEqual(filterHistoryTimelineEntries([fry, matchingRound], "fry"), [fry]);
});

test("出牌记录隐藏不炒过程，并按单玩家一行让牌面自动折行", async () => {
  const [source, styles] = await Promise.all([
    readFile(appPath, "utf8"),
    readFile(stylesPath, "utf8")
  ]);

  assert.match(source, /function isHiddenHistoryEvent\(text\)/);
  assert.match(source, /选择不炒底\|炒底倒计时结束，自动不炒/);
  assert.match(styles, /\.history-trick-plays\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(styles, /\.history-trick-play \.mini-cards\s*\{[\s\S]*flex-wrap:\s*wrap[\s\S]*overflow:\s*visible/);
  assert.doesNotMatch(styles, /\.history-trick-play \.mini-cards\s*\{[\s\S]*overflow-x:\s*auto/);
});
