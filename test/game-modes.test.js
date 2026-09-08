import test from "node:test";
import assert from "node:assert/strict";

import {
  arrangeFixedTeamSeats,
  assignBalancedTeams,
  GAME_MODE_PVE,
  idleTargetPercent,
  PLAY_MODE_TEAM,
  TEAM_A,
  TEAM_B,
  validateFixedTeams
} from "../game-modes.js";

function players(count) {
  return Array.from({ length: count }, (_, index) => ({ id: `p${index + 1}` }));
}

function sameTeamEdges(seated) {
  return seated.reduce((edges, player, index) => {
    const next = (index + 1) % seated.length;
    if (player.squad === seated[next].squad) edges.push([index, next]);
    return edges;
  }, []);
}

test("随机分队始终得到相等或只差一人的两队", () => {
  for (let count = 4; count <= 9; count += 1) {
    const assigned = players(count);
    assignBalancedTeams(assigned, () => 0.4);
    const a = assigned.filter((player) => player.squad === TEAM_A).length;
    const b = assigned.filter((player) => player.squad === TEAM_B).length;
    assert.ok(Math.abs(a - b) <= 1);
    assert.equal(a + b, count);
  }
});

test("人数相等时交错排座且没有同队连座", () => {
  const input = players(6).map((player, index) => ({ ...player, squad: index < 3 ? TEAM_A : TEAM_B }));
  const seated = arrangeFixedTeamSeats(input, "p1", () => 0);
  assert.equal(seated[0].id, "p1");
  assert.equal(sameTeamEdges(seated).length, 0);
});

test("人数不等时仅多数队两人连座，并尽量远离庄家", () => {
  const input = players(7).map((player, index) => ({ ...player, squad: index < 4 ? TEAM_A : TEAM_B }));
  const seated = arrangeFixedTeamSeats(input, "p1", () => 0);
  const edges = sameTeamEdges(seated);
  assert.equal(edges.length, 1);
  assert.equal(Math.min(...edges[0].map((index) => Math.min(index, seated.length - index))), 2);
  assert.equal(seated[edges[0][0]].squad, TEAM_A);
  assert.equal(seated[edges[0][1]].squad, TEAM_A);
});

test("庄家在少数队时，多数队连座仍远离庄家", () => {
  const input = players(7).map((player, index) => ({ ...player, squad: index < 3 ? TEAM_A : TEAM_B }));
  const seated = arrangeFixedTeamSeats(input, "p1", () => 0);
  const edges = sameTeamEdges(seated);
  assert.equal(edges.length, 1);
  assert.equal(Math.min(...edges[0].map((index) => Math.min(index, seated.length - index))), 3);
  assert.equal(seated[edges[0][0]].squad, TEAM_B);
  assert.equal(seated[edges[0][1]].squad, TEAM_B);
});

test("战队模式人数相等目标 40%，不等目标 50%", () => {
  const equalRoom = { playMode: PLAY_MODE_TEAM, players: players(4).map((player, index) => ({ ...player, squad: index < 2 ? TEAM_A : TEAM_B })) };
  const unequalRoom = { playMode: PLAY_MODE_TEAM, players: players(5).map((player, index) => ({ ...player, squad: index < 3 ? TEAM_A : TEAM_B })) };
  assert.equal(idleTargetPercent(equalRoom), 40);
  assert.equal(idleTargetPercent(unequalRoom), 50);
});

test("PVE 只接受 2-4 名真人与等量电脑分队对战", () => {
  const room = {
    gameMode: GAME_MODE_PVE,
    playMode: PLAY_MODE_TEAM,
    pveHumanCount: 2,
    players: [
      { id: "h1", squad: TEAM_A, test: false },
      { id: "h2", squad: TEAM_A, test: false },
      { id: "r1", squad: TEAM_B, test: true, pveRobot: true },
      { id: "r2", squad: TEAM_B, test: true, pveRobot: true }
    ]
  };
  assert.equal(validateFixedTeams(room).valid, true);
  room.players[1].squad = TEAM_B;
  assert.equal(validateFixedTeams(room).valid, false);
});
