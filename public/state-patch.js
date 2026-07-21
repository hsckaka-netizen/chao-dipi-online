function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function equalValue(left, right) {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((value, index) => equalValue(value, right[index]));
  }
  if (!isObject(left) || !isObject(right)) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => Object.hasOwn(right, key) && equalValue(left[key], right[key]));
}

function stableItemId(value) {
  if (!isObject(value)) return null;
  if (value.id != null) return `id:${value.id}`;
  if (value.playerId != null) return `player:${value.playerId}`;
  return null;
}

function pushSet(operations, path, value) {
  operations.push({ o: "s", p: path, v: value });
}

function diffEvents(before, after, path, operations) {
  if (!before.length) {
    pushSet(operations, path, after);
    return;
  }
  const previousFirstId = before[0]?.id;
  const overlapStart = previousFirstId == null
    ? -1
    : after.findIndex((event) => event?.id === previousFirstId);
  if (overlapStart < 0) {
    pushSet(operations, path, after);
    return;
  }
  const overlapLength = Math.min(before.length, after.length - overlapStart);
  for (let index = 0; index < overlapLength; index += 1) {
    if (!equalValue(before[index], after[overlapStart + index])) {
      pushSet(operations, path, after);
      return;
    }
  }
  operations.push({ o: "p", p: path, v: after.slice(0, overlapStart), l: after.length });
}

function diffArrays(before, after, path, operations) {
  if (path.length === 1 && path[0] === "events") {
    diffEvents(before, after, path, operations);
    return;
  }

  if (after.length >= before.length && before.every((value, index) => equalValue(value, after[index]))) {
    operations.push({ o: "a", p: path, v: after.slice(before.length) });
    return;
  }

  const stableSameLength = before.length === after.length
    && before.every((value, index) => {
      const beforeId = stableItemId(value);
      return beforeId && beforeId === stableItemId(after[index]);
    });
  if (stableSameLength) {
    before.forEach((value, index) => diffValue(value, after[index], [...path, index], operations));
    return;
  }

  pushSet(operations, path, after);
}

function diffObjects(before, after, path, operations) {
  for (const key of Object.keys(before)) {
    if (path.length === 0 && key === "snapshotVersion") continue;
    if (!Object.hasOwn(after, key)) operations.push({ o: "d", p: [...path, key] });
  }
  for (const key of Object.keys(after)) {
    if (path.length === 0 && key === "snapshotVersion") continue;
    if (!Object.hasOwn(before, key)) pushSet(operations, [...path, key], after[key]);
    else diffValue(before[key], after[key], [...path, key], operations);
  }
}

function diffValue(before, after, path, operations) {
  if (Object.is(before, after) || equalValue(before, after)) return;
  if (Array.isArray(before) && Array.isArray(after)) {
    diffArrays(before, after, path, operations);
    return;
  }
  if (isObject(before) && isObject(after)) {
    diffObjects(before, after, path, operations);
    return;
  }
  pushSet(operations, path, after);
}

export function createStatePatch(before, after) {
  const operations = [];
  diffObjects(before, after, [], operations);
  return {
    b: Number(before?.snapshotVersion || 0),
    v: Number(after?.snapshotVersion || 0),
    o: operations
  };
}

function cloneContainer(value) {
  return Array.isArray(value) ? [...value] : { ...(value || {}) };
}

function updateAtPath(root, path, update) {
  if (!path.length) return update(root);
  const nextRoot = cloneContainer(root);
  let beforeCursor = root;
  let nextCursor = nextRoot;
  for (let index = 0; index < path.length - 1; index += 1) {
    const key = path[index];
    const nextChild = cloneContainer(beforeCursor?.[key]);
    nextCursor[key] = nextChild;
    beforeCursor = beforeCursor?.[key];
    nextCursor = nextChild;
  }
  const finalKey = path[path.length - 1];
  const updated = update(beforeCursor?.[finalKey]);
  if (updated === undefined && update.deleteValue) {
    if (Array.isArray(nextCursor)) nextCursor.splice(Number(finalKey), 1);
    else delete nextCursor[finalKey];
  } else {
    nextCursor[finalKey] = updated;
  }
  return nextRoot;
}

function deleteValue() {
  return undefined;
}
deleteValue.deleteValue = true;

export function applyStatePatch(before, patch) {
  if (!before || Number(before.snapshotVersion || 0) !== Number(patch?.b || 0)) return null;
  let next = before;
  for (const operation of patch.o || []) {
    if (operation.o === "s") {
      next = updateAtPath(next, operation.p || [], () => operation.v);
    } else if (operation.o === "d") {
      next = updateAtPath(next, operation.p || [], deleteValue);
    } else if (operation.o === "a") {
      next = updateAtPath(next, operation.p || [], (value) => [...(value || []), ...(operation.v || [])]);
    } else if (operation.o === "p") {
      next = updateAtPath(next, operation.p || [], (value) => [
        ...(operation.v || []),
        ...(value || [])
      ].slice(0, operation.l));
    } else {
      return null;
    }
  }
  return updateAtPath(next, ["snapshotVersion"], () => Number(patch.v || 0));
}
