import { isMainThread, parentPort, workerData, Worker } from "node:worker_threads";

import { mergePairedAiBenchmarkResults, runPairedAiBenchmark } from "../ai-benchmark.js";

function argumentValue(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function argumentBoolean(name, fallback = true) {
  const value = String(argumentValue(name, fallback ? "true" : "false")).toLowerCase();
  return value !== "false" && value !== "0";
}

function renderResult(result, { json = false, workers = 1 } = {}) {
  if (json) return `${JSON.stringify(result, null, 2)}\n`;
  const baseline = result.strategyStats[result.baselineStrategy];
  const candidate = result.strategyStats[result.candidateStrategy];
  const diagnostics = candidate.decisionDiagnostics;
  const netRedFives = baseline.draggedRedFives - candidate.draggedRedFives;
  const netDiamondFives = baseline.draggedDiamondFives - candidate.draggedDiamondFives;
  const netProtectedFiveValue = baseline.protectedFiveLoss - candidate.protectedFiveLoss;
  const lines = [
    `AI 同牌换边评测：${result.deals} 副牌 / ${result.games} 局 / ${result.playerCount} 人`,
    `候选策略 ${result.candidateStrategy}（最终结算）：${result.candidateWins} 胜 / ${result.baselineWins} 负 / ${result.draws} 平，胜率 ${(result.candidateWinRate * 100).toFixed(1)}%`,
    `推演参数：权重 ${result.candidateOptions.rolloutWeight}，覆盖门槛 ${result.candidateOptions.overrideMargin}`,
    `基准策略 ${result.baselineStrategy}`,
    `候选平均最终结算分差：${result.averageCandidateScoreMargin}`,
    `牌分门槛胜负：候选 ${result.candidateCardPointWins} 胜；平均净牌分 ${result.averageCandidateCardPointMargin}`,
    `候选决策耗时：平均 ${candidate.averageDecisionMs}ms，P95 ${candidate.p95DecisionMs}ms，最大 ${candidate.maxDecisionMs}ms`,
    `基准决策耗时：平均 ${baseline.averageDecisionMs}ms，P95 ${baseline.p95DecisionMs}ms，最大 ${baseline.maxDecisionMs}ms`,
    `拖五价值（红五按2、方五按1）：拖下对方 ${baseline.protectedFiveLoss}，自己损失 ${candidate.protectedFiveLoss}，净收益 ${netProtectedFiveValue >= 0 ? "+" : ""}${netProtectedFiveValue}`,
    `拖五明细：红五净 ${netRedFives >= 0 ? "+" : ""}${netRedFives}（对方 ${baseline.draggedRedFives} / 自己 ${candidate.draggedRedFives}），方五净 ${netDiamondFives >= 0 ? "+" : ""}${netDiamondFives}（对方 ${baseline.draggedDiamondFives} / 自己 ${candidate.draggedDiamondFives}）`,
    `甩牌失败：候选 ${candidate.throwFailures}/${candidate.throwAttempts}，基准 ${baseline.throwFailures}/${baseline.throwAttempts}`,
    `蒙特卡洛改判：${diagnostics.overrides} 次（领牌 ${diagnostics.overrideLeads}，跟牌 ${diagnostics.overrideFollows}；前/中/后期 ${diagnostics.overrideEarly}/${diagnostics.overrideMiddle}/${diagnostics.overrideLate}）`,
    `改判所在轮结果：本方拿下 ${diagnostics.overrideTeamTrickWins}/${diagnostics.overrides}，赢得 ${diagnostics.overridePointsWon} 分，失去 ${diagnostics.overridePointsLost} 分，主动投入保护五 ${diagnostics.overrideProtectedFivePlays} 张`
  ];
  if (workers > 1) lines.push(`并行分片：${workers}；耗时指标仅供观察，发布门槛以单线程结果为准`);
  return `${lines.join("\n")}\n`;
}

async function runParallelBenchmark(options, workers) {
  const workerCount = Math.max(1, Math.min(options.deals, workers));
  const baseDeals = Math.floor(options.deals / workerCount);
  const extraDeals = options.deals % workerCount;
  const tasks = Array.from({ length: workerCount }, (_, index) => new Promise((resolve, reject) => {
    const shardDeals = baseDeals + (index < extraDeals ? 1 : 0);
    const worker = new Worker(new URL(import.meta.url), {
      workerData: {
        ...options,
        deals: shardDeals,
        seed: `${options.seed}:shard-${index}`
      }
    });
    worker.once("message", resolve);
    worker.once("error", reject);
    worker.once("exit", (code) => {
      if (code) reject(new Error(`AI benchmark worker exited with code ${code}`));
    });
  }));
  return mergePairedAiBenchmarkResults(await Promise.all(tasks), { seed: options.seed });
}

if (!isMainThread) {
  parentPort.postMessage(runPairedAiBenchmark(workerData));
} else {
  const deals = Math.max(1, Math.floor(Number(argumentValue("deals", 10)) || 10));
  const playerCount = Math.max(5, Math.min(9, Math.floor(Number(argumentValue("players", 5)) || 5)));
  const seed = String(argumentValue("seed", "20260901"));
  const supportedStrategies = new Set(["heuristic-v2", "monte-carlo-v3", "monte-carlo-v4", "fixed-team-v4"]);
  const requestedCandidate = String(argumentValue("candidate", "monte-carlo-v4"));
  const candidateStrategy = supportedStrategies.has(requestedCandidate) ? requestedCandidate : "monte-carlo-v4";
  const requestedBaseline = String(argumentValue("baseline", "monte-carlo-v3"));
  const baselineStrategy = supportedStrategies.has(requestedBaseline) ? requestedBaseline : "monte-carlo-v3";
  const rolloutWeight = Number(argumentValue("rollout-weight", 0.3));
  const overrideMargin = Number(argumentValue("override-margin", 8));
  const sampleCount = Number(argumentValue("samples", 0));
  const candidateLimit = Number(argumentValue("candidates", 0));
  const fixedTeamDepth = Number(argumentValue("depth", 0));
  const workers = Math.max(1, Math.floor(Number(argumentValue("workers", 1)) || 1));
  const options = {
    deals,
    playerCount,
    seed,
    baselineStrategy,
    candidateStrategy,
    candidateOptions: {
      rolloutWeight,
      overrideMargin,
      fixedFiveRun: argumentBoolean("fixed-five-run", false),
      fixedLeadTransfer: argumentBoolean("fixed-lead-transfer", false),
      fixedFiveDrag: argumentBoolean("fixed-five-drag", false),
      fixedTeamControl: argumentBoolean("fixed-team-control", false),
      ...(sampleCount > 0 ? { sampleCount } : {}),
      ...(candidateLimit > 0 ? { candidateLimit } : {}),
      ...(fixedTeamDepth > 0 ? { fixedTeamDepth } : {})
    }
  };
  const result = workers > 1
    ? await runParallelBenchmark(options, workers)
    : runPairedAiBenchmark(options);
  process.stdout.write(renderResult(result, { json: process.argv.includes("--json"), workers }));
}
