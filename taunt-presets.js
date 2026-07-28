export const TAUNT_TEXT_MAX_LENGTH = 40;

export const DEFAULT_TAUNT_PRESETS = Object.freeze([
  { id: "thats-it", text: "就这？", enabled: true, availableToAll: true, availableAccountIds: [], sortOrder: 10 },
  { id: "dare-play", text: "这牌你也敢出？", enabled: true, availableToAll: true, availableAccountIds: [], sortOrder: 20 },
  { id: "lucky", text: "算你运气好！", enabled: true, availableToAll: true, availableAccountIds: [], sortOrder: 30 },
  { id: "wait-for-it", text: "别急，好戏在后头。", enabled: true, availableToAll: true, availableAccountIds: [], sortOrder: 40 },
  { id: "read-you", text: "你的牌我看穿了。", enabled: true, availableToAll: true, availableAccountIds: [], sortOrder: 50 },
  { id: "free-points", text: "谢谢老板送分！", enabled: true, availableToAll: true, availableAccountIds: [], sortOrder: 60 },
  { id: "take-your-time", text: "慢慢想，我等得起。", enabled: true, availableToAll: true, availableAccountIds: [], sortOrder: 70 },
  { id: "nice-try", text: "差一点就压住我了。", enabled: true, availableToAll: true, availableAccountIds: [], sortOrder: 80 }
]);

export function normalizeTauntText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

export function normalizeTauntPreset(value) {
  return {
    id: String(value?.id || "").trim(),
    text: normalizeTauntText(value?.text),
    enabled: value?.enabled !== false,
    availableToAll: value?.availableToAll !== false,
    availableAccountIds: [...new Set(
      (Array.isArray(value?.availableAccountIds) ? value.availableAccountIds : [])
        .map((accountId) => String(accountId || "").trim())
        .filter(Boolean)
    )],
    sortOrder: Number.isFinite(Number(value?.sortOrder)) ? Number(value.sortOrder) : 0,
    createdAt: value?.createdAt || null,
    updatedAt: value?.updatedAt || null
  };
}

export function validateTauntText(value) {
  const text = normalizeTauntText(value);
  if (!text) return { error: "请输入嘲讽词" };
  if (text.length > TAUNT_TEXT_MAX_LENGTH) {
    return { error: `嘲讽词不能超过 ${TAUNT_TEXT_MAX_LENGTH} 个字符` };
  }
  return { text };
}

export function tauntAvailableToAccount(preset, accountId) {
  const normalized = normalizeTauntPreset(preset);
  if (!normalized.enabled) return false;
  if (normalized.availableToAll) return true;
  if (!accountId) return false;
  return normalized.availableAccountIds.includes(String(accountId));
}

export function availableTauntPresets(presets, accountId) {
  return (presets || [])
    .map(normalizeTauntPreset)
    .filter((preset) => tauntAvailableToAccount(preset, accountId))
    .sort((left, right) => left.sortOrder - right.sortOrder || left.text.localeCompare(right.text, "zh-CN"))
    .map((preset) => ({ id: preset.id, text: preset.text }));
}
