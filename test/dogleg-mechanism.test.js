import test from "node:test";
import assert from "node:assert/strict";

import {
  applyDynamicDoglegPlay,
  createDynamicDoglegState,
  DOGLEG_MODE_DYNAMIC,
  DOGLEG_MODE_TRADITIONAL,
  dynamicDoglegCardId,
  dynamicDoglegMarkCount,
  normalizeDoglegMode,
  rankDynamicDoglegs
} from "../dogleg-mechanism.js";

function card(id, type = "normal") {
  return { id, type };
}

test("动态狗腿排除庄家，且可从任意手牌中随机标记", () => {
  const state = createDynamicDoglegState([
    { id: "banker", hand: [card("banker-card")] },
    { id: "idle-a", hand: [card("normal-card"), card("joker-card", "joker")] }
  ], "banker", () => 0.999);

  assert.equal(state.players.banker, undefined);
  assert.equal(dynamicDoglegCardId(state, "idle-a"), "joker-card");
  assert.equal(normalizeDoglegMode("unknown"), DOGLEG_MODE_TRADITIONAL);
  assert.equal(normalizeDoglegMode(DOGLEG_MODE_DYNAMIC), DOGLEG_MODE_DYNAMIC);
});

test("打出具体标记牌后增加一个标记，并从剩余手牌重新随机", () => {
  const state = createDynamicDoglegState([
    { id: "idle-a", hand: [card("marked"), card("next"), card("other")] }
  ], "banker", () => 0);

  const miss = applyDynamicDoglegPlay(state, {
    playerId: "idle-a",
    playedCards: [card("other")],
    remainingHand: [card("marked"), card("next")],
    needed: 1,
    random: () => 0
  });
  assert.equal(miss.hit, null);
  assert.equal(dynamicDoglegMarkCount(state, "idle-a"), 0);

  const hit = applyDynamicDoglegPlay(state, {
    playerId: "idle-a",
    playedCards: [card("marked")],
    remainingHand: [card("next"), card("other")],
    needed: 1,
    random: () => 0
  });
  assert.equal(hit.hit.cardId, "marked");
  assert.equal(hit.hit.count, 1);
  assert.equal(dynamicDoglegCardId(state, "idle-a"), "next");
  assert.deepEqual(hit.doglegPlayerIds, ["idle-a"]);
});

test("动态狗腿先比标记数，同数时最近获得标记者优先", () => {
  const state = createDynamicDoglegState([
    { id: "idle-a", hand: [card("a1"), card("a2")] },
    { id: "idle-b", hand: [card("b1"), card("b2")] },
    { id: "idle-c", hand: [card("c1")] }
  ], "banker", () => 0);

  applyDynamicDoglegPlay(state, {
    playerId: "idle-a", playedCards: [card("a1")], remainingHand: [card("a2")], needed: 2, random: () => 0
  });
  applyDynamicDoglegPlay(state, {
    playerId: "idle-b", playedCards: [card("b1")], remainingHand: [card("b2")], needed: 2, random: () => 0
  });
  assert.deepEqual(rankDynamicDoglegs(state, 1), ["idle-b"]);
  assert.deepEqual(rankDynamicDoglegs(state, 2), ["idle-b", "idle-a"]);

  applyDynamicDoglegPlay(state, {
    playerId: "idle-a", playedCards: [card("a2")], remainingHand: [], needed: 2, random: () => 0
  });
  assert.deepEqual(rankDynamicDoglegs(state, 2), ["idle-a", "idle-b"]);
  assert.equal(dynamicDoglegCardId(state, "idle-a"), null);
  assert.equal(dynamicDoglegMarkCount(state, "idle-c"), 0);
  assert.equal(rankDynamicDoglegs(state, 3).includes("idle-c"), false, "0 标记玩家不补足狗腿名额");
});
