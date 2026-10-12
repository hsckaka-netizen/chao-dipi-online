export function availableRanchenRoles(playerCount, doglegNeeded, locks = {}) {
  const nonBankerCount = Math.max(0, Math.trunc(Number(playerCount) || 0) - 1);
  const doglegSlots = Math.max(0, Math.min(nonBankerCount, Math.trunc(Number(doglegNeeded) || 0)));
  const idleSlots = nonBankerCount - doglegSlots;
  const values = Object.values(locks || {});
  const usedDogleg = values.filter((value) => value === "dogleg").length;
  const usedIdle = values.filter((value) => value === "idle").length;
  return [
    ...(usedDogleg < doglegSlots ? ["dogleg"] : []),
    ...(usedIdle < idleSlots ? ["idle"] : [])
  ];
}

export function lockedDoglegIds(locks = {}) {
  return Object.entries(locks || {}).filter(([, role]) => role === "dogleg").map(([id]) => id);
}

export function lockedNonBankerIds(locks = {}) {
  return Object.keys(locks || {});
}
