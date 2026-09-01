import { runPairedAiBenchmark } from "../ai-benchmark.js";

function argumentValue(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const deals = Math.max(1, Math.floor(Number(argumentValue("deals", 10)) || 10));
const playerCount = Math.max(5, Math.min(9, Math.floor(Number(argumentValue("players", 5)) || 5)));
const seed = String(argumentValue("seed", "20260901"));
const rolloutWeight = Number(argumentValue("rollout-weight", 0.3));
const overrideMargin = Number(argumentValue("override-margin", 8));
const json = process.argv.includes("--json");
const result = runPairedAiBenchmark({
  deals,
  playerCount,
  seed,
  candidateOptions: { rolloutWeight, overrideMargin }
});

if (json) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  const baseline = result.strategyStats[result.baselineStrategy];
  const candidate = result.strategyStats[result.candidateStrategy];
  process.stdout.write([
    `AI 同牌换边评测：${result.deals} 副牌 / ${result.games} 局 / ${result.playerCount} 人`,
    `候选策略 ${result.candidateStrategy}：${result.candidateWins} 胜，胜率 ${(result.candidateWinRate * 100).toFixed(1)}%`,
    `推演参数：权重 ${rolloutWeight}，覆盖门槛 ${overrideMargin}`,
    `基准策略 ${result.baselineStrategy}：${result.baselineWins} 胜`,
    `候选平均净牌分：${result.averageCandidateScoreMargin}`,
    `候选决策耗时：平均 ${candidate.averageDecisionMs}ms，P95 ${candidate.p95DecisionMs}ms，最大 ${candidate.maxDecisionMs}ms`,
    `基准决策耗时：平均 ${baseline.averageDecisionMs}ms，P95 ${baseline.p95DecisionMs}ms，最大 ${baseline.maxDecisionMs}ms`,
    `保护五损失（红五按2、方五按1）：候选 ${candidate.protectedFiveLoss}，基准 ${baseline.protectedFiveLoss}`,
    `甩牌失败：候选 ${candidate.throwFailures}/${candidate.throwAttempts}，基准 ${baseline.throwFailures}/${baseline.throwAttempts}`
  ].join("\n") + "\n");
}
