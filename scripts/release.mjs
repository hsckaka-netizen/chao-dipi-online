#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { setTimeout as delay } from "node:timers/promises";

const DEFAULT_URL = "https://chao-dipi-online.onrender.com/";
const LEVELS = new Set(["none", "ui", "full"]);

function usage() {
  console.log(`Usage:
  npm run release -- --message "Commit message" --level ui
  npm run release -- --message "Commit message" --level full --yes
  npm run release -- --verify-only

Options:
  -m, --message <text>   Commit message. Required when worktree has changes.
  --level <none|ui|full> Check level. Default: ui.
                         none = git diff checks only
                         ui   = git diff checks + npm run check + asset version test
                         full = ui + npm test
  --test <command>       Extra test command. Repeatable.
  --yes                  Non-interactive confirmation for staging all current changes.
  --no-push              Commit/check but do not push or poll production.
  --no-verify            Push but skip production polling.
  --verify-only          Do not commit or push; only verify production resources.
  --url <url>            Production URL. Default: ${DEFAULT_URL}
  --timeout <seconds>    Production polling timeout. Default: 600.
  --interval <seconds>   Production polling interval. Default: 15.
  --skip-fetch           Skip git fetch before push.
  --help                 Show this help.

Safety:
  Run this only when the current dirty worktree contains exactly one intended
  release batch. The script stages all current changes after confirmation.`);
}

function parseArgs(argv) {
  const options = {
    message: "",
    level: "ui",
    extraTests: [],
    yes: false,
    push: true,
    verify: true,
    verifyOnly: false,
    url: DEFAULT_URL,
    timeoutSeconds: 600,
    intervalSeconds: 15,
    fetch: true
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`${arg} requires a value`);
      return argv[index];
    };
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--message" || arg === "-m") options.message = next();
    else if (arg === "--level") options.level = next();
    else if (arg === "--test") options.extraTests.push(next());
    else if (arg === "--yes") options.yes = true;
    else if (arg === "--no-push") options.push = false;
    else if (arg === "--no-verify") options.verify = false;
    else if (arg === "--verify-only") options.verifyOnly = true;
    else if (arg === "--url") options.url = next();
    else if (arg === "--timeout") options.timeoutSeconds = Number(next());
    else if (arg === "--interval") options.intervalSeconds = Number(next());
    else if (arg === "--skip-fetch") options.fetch = false;
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!LEVELS.has(options.level)) throw new Error(`Invalid --level: ${options.level}`);
  if (!Number.isFinite(options.timeoutSeconds) || options.timeoutSeconds <= 0) {
    throw new Error("--timeout must be a positive number");
  }
  if (!Number.isFinite(options.intervalSeconds) || options.intervalSeconds <= 0) {
    throw new Error("--interval must be a positive number");
  }
  return options;
}

function run(command, args = [], { capture = false, allowFail = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit"
  });
  if (result.status !== 0 && !allowFail) {
    const rendered = [command, ...args].join(" ");
    if (capture) process.stderr.write(result.stderr || result.stdout || "");
    throw new Error(`Command failed: ${rendered}`);
  }
  return capture ? (result.stdout || "").trim() : "";
}

function runShell(command) {
  const shell = process.env.SHELL || "/bin/sh";
  run(shell, ["-lc", command]);
}

function changedFiles() {
  return run("git", ["status", "--porcelain"], { capture: true })
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

async function confirm(question) {
  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question(`${question} [y/N] `);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

function expectedResourceVersions() {
  const html = readFileSync("public/index.html", "utf8");
  return {
    app: html.match(/app\.js\?v=([0-9a-f]+)/)?.[0] || "",
    styles: html.match(/styles\.css\?v=([0-9a-f]+)/)?.[0] || ""
  };
}

async function fetchText(url) {
  const response = await fetch(url, { cache: "no-store" });
  const text = await response.text();
  return { response, text };
}

async function verifyProduction(options) {
  const expected = expectedResourceVersions();
  const deadline = Date.now() + options.timeoutSeconds * 1000;
  const url = options.url.endsWith("/") ? options.url : `${options.url}/`;
  console.log(`\nProduction check: ${url}`);
  while (Date.now() < deadline) {
    const { response, text } = await fetchText(url);
    const hasApp = !expected.app || text.includes(expected.app);
    const hasStyles = !expected.styles || text.includes(expected.styles);
    if (response.ok && hasApp && hasStyles) {
      console.log(`Homepage: ${response.status}`);
      if (expected.app) console.log(`App resource: ${expected.app}`);
      if (expected.styles) console.log(`Styles resource: ${expected.styles}`);
      break;
    }
    console.log(`Waiting for deploy: homepage=${response.status}, app=${hasApp}, styles=${hasStyles}`);
    await delay(options.intervalSeconds * 1000);
  }

  const { response, text } = await fetchText(new URL("/api/history/status", url));
  if (response.ok) {
    const status = JSON.parse(text);
    console.log(`Health: connected=${status.connected}, migrationVersion=${status.migrationVersion}, pendingCount=${status.pendingCount}, lastError=${status.lastErrorCode || status.lastErrorMessage || "none"}`);
  } else {
    console.log(`Health: ${response.status}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }

  const root = run("git", ["rev-parse", "--show-toplevel"], { capture: true });
  const branch = run("git", ["branch", "--show-current"], { capture: true });
  if (!root.endsWith("tools/chao-dipi-online")) throw new Error(`Unexpected repo root: ${root}`);
  if (branch !== "main") throw new Error(`Release script must run on main, current branch: ${branch}`);

  if (options.verifyOnly) {
    await verifyProduction(options);
    return;
  }

  if (options.fetch) run("git", ["fetch", "origin", "main"]);
  const originMain = run("git", ["rev-parse", "origin/main"], { capture: true });
  const base = run("git", ["merge-base", "HEAD", "origin/main"], { capture: true });
  if (originMain !== base) {
    throw new Error("origin/main is not an ancestor of HEAD. Pull/rebase manually before release.");
  }

  const files = changedFiles();
  if (files.length > 0) {
    console.log("\nFiles to release:");
    for (const file of files) console.log(`  ${file}`);
    if (!options.message) throw new Error("--message is required when committing changes");
    if (!options.yes) {
      const ok = await confirm("Stage all listed files and continue release?");
      if (!ok) throw new Error("Release cancelled");
    }
  } else {
    console.log("No worktree changes. Will push/verify existing local commits if any.");
  }

  run("git", ["diff", "--check"]);
  if (options.level !== "none") {
    run("npm", ["run", "check"]);
    run("node", ["--test", "test/asset-versions.test.js"]);
  }
  for (const command of options.extraTests) runShell(command);
  if (options.level === "full") run("npm", ["test"]);

  if (files.length > 0) {
    run("git", ["add", "-A"]);
    run("git", ["diff", "--cached", "--check"]);
    run("git", ["commit", "-m", options.message]);
  }

  const head = run("git", ["rev-parse", "HEAD"], { capture: true });
  console.log(`Release commit: ${head}`);

  if (!options.push) {
    console.log("--no-push set. Stop before push.");
    return;
  }

  run("git", ["push", "origin", "main"]);
  if (options.verify) await verifyProduction(options);
  else console.log("--no-verify set. Stop after push.");
}

main().catch((error) => {
  console.error(`\nRelease failed: ${error.message}`);
  process.exit(1);
});
