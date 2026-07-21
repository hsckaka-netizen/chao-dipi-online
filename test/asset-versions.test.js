import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { ASSET_VERSIONS, versionedAssetUrl } from "../public/asset-versions.js";

const publicDir = fileURLToPath(new URL("../public/", import.meta.url));

async function assetFiles(directory = `${publicDir}assets`, prefix = "/assets") {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const pathname = `${prefix}/${entry.name}`;
    return entry.isDirectory() ? assetFiles(`${directory}/${entry.name}`, pathname) : [pathname];
  }));
  return nested.flat().sort();
}

async function contentVersion(relativePath) {
  const content = await readFile(`${publicDir}${relativePath}`);
  return createHash("sha256").update(content).digest("hex").slice(0, 12);
}

async function assertVersionedReference(sourcePath, targetPath) {
  const source = await readFile(`${publicDir}${sourcePath}`, "utf8");
  const expectedVersion = await contentVersion(targetPath);
  assert.ok(
    source.includes(`${targetPath}?v=${expectedVersion}`) || source.includes(`.${targetPath}?v=${expectedVersion}`),
    `${sourcePath} 需要引用 ${targetPath} 的最新内容版本 ${expectedVersion}`
  );
}

test("every bundled visual asset has a content-derived URL version", async () => {
  const files = await assetFiles();
  assert.deepEqual(Object.keys(ASSET_VERSIONS).sort(), files);

  for (const pathname of files) {
    const content = await readFile(`${publicDir}${pathname.slice(1)}`);
    const expectedVersion = createHash("sha256").update(content).digest("hex").slice(0, 12);
    assert.equal(ASSET_VERSIONS[pathname], expectedVersion, `${pathname} 的素材版本需要更新`);
    assert.equal(versionedAssetUrl(pathname), `${pathname}?v=${expectedVersion}`);
  }
});

test("every local script and stylesheet reference uses its current content version", async () => {
  await assertVersionedReference("index.html", "/styles.css");
  await assertVersionedReference("index.html", "/app.js");
  await assertVersionedReference("app.js", "/state-patch.js");
  await assertVersionedReference("app.js", "/gameplay-effects.js");
  await assertVersionedReference("app.js", "/asset-versions.js");
});
