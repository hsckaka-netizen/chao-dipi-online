import test from "node:test";
import assert from "node:assert/strict";
import { doudouPointNotice, doudouPointLabel } from "../public/doudou-notice.js";

const dealt = { roomId: "r", startedAt: "first", status: "dealt", stage: "restart-card-using",
  viewer: { id: "p", battleHeroSnapshot: { heroId: "jie-doudou" }, doudouNumber: 11 } };
test("Dou Dou announces its number immediately on deal and reconnect", () => {
  assert.match(doudouPointNotice(null, dealt), /J（11）/);
  assert.match(doudouPointNotice({ ...dealt, status: "lobby", viewer: {} }, dealt), /已确定/);
  assert.equal(doudouPointLabel(1), "A（1）");
});
test("snapshots do not repeat notices but redeals announce even the same number", () => {
  assert.equal(doudouPointNotice(dealt, { ...dealt }), "");
  assert.match(doudouPointNotice(dealt, { ...dealt, startedAt: "second" }), /已确定/);
});
test("observers, other heroes, invalid numbers and final settlement get no new-number notice", () => {
  assert.equal(doudouPointNotice(null, { ...dealt, spectator: { id: "observer" } }), "");
  assert.equal(doudouPointNotice(null, { ...dealt, stage: "finished" }), "");
  assert.equal(doudouPointNotice(null, { ...dealt, viewer: { ...dealt.viewer, doudouNumber: 14 } }), "");
  assert.equal(doudouPointNotice(null, { ...dealt, viewer: { ...dealt.viewer, battleHeroSnapshot: { heroId: "jiang-zha" } } }), "");
});
