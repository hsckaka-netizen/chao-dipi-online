function normalizedAccountId(value) {
  return String(value || "").trim();
}

export function roomPlayerForAccount(room, accountId) {
  const normalized = normalizedAccountId(accountId);
  if (!normalized) return null;
  return (room?.players || []).find((player) => normalizedAccountId(player?.accountId) === normalized) || null;
}

export function removeSpectatorsForAccount(room, accountId, onRemove = null) {
  const normalized = normalizedAccountId(accountId);
  if (!normalized || !(room?.spectators instanceof Map)) return [];

  const removed = [];
  for (const [spectatorId, spectator] of room.spectators) {
    if (normalizedAccountId(spectator?.accountId) !== normalized) continue;
    room.spectators.delete(spectatorId);
    removed.push(spectator);
    if (typeof onRemove === "function") onRemove(spectator);
  }
  return removed;
}
