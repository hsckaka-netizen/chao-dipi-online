import test from "node:test";
import assert from "node:assert/strict";

import { availableRanchenRoles, lockedDoglegIds, lockedNonBankerIds } from "../hero-role-lock.js";

test("Ranchen role slots preserve exactly one banker seat", () => {
  assert.deepEqual(availableRanchenRoles(5, 2), ["dogleg", "idle"]);
  assert.deepEqual(availableRanchenRoles(5, 2, { a: "dogleg", b: "dogleg" }), ["idle"]);
  assert.deepEqual(availableRanchenRoles(5, 2, { a: "idle", b: "idle" }), ["dogleg"]);
  assert.deepEqual(availableRanchenRoles(5, 2, {
    a: "dogleg", b: "dogleg", c: "idle", d: "idle"
  }), []);
  assert.deepEqual(lockedDoglegIds({ a: "dogleg", b: "idle" }), ["a"]);
  assert.deepEqual(lockedNonBankerIds({ a: "dogleg", b: "idle" }), ["a", "b"]);
});
