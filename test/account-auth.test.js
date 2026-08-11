import test from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";

import {
  authEmailForUsername,
  createSessionToken,
  decodeAvatarDataUrl,
  decodeAvatarFrameDataUrl,
  normalizeUsername,
  validatePassword,
  validateUsername,
  verifySessionToken
} from "../account-auth.js";

function pngChunk(type, data) {
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write(type, 4, 4, "ascii");
  data.copy(chunk, 8);
  return chunk;
}

function avatarFramePng({ openingAlpha = 0, outerAlpha = 0 } = {}) {
  const width = 512;
  const stride = width * 4;
  const pixels = Buffer.alloc((stride + 1) * width);
  const alphaAt = (x, y) => y * (stride + 1) + 1 + x * 4 + 3;
  pixels[alphaAt(12, 12)] = 255;
  pixels[alphaAt(96, 96)] = openingAlpha;
  pixels[alphaAt(2, 2)] = outerAlpha;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(width, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(pixels)),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

test("account usernames are normalized and restricted", () => {
  assert.equal(normalizeUsername("  BenLei_01  "), "benlei_01");
  assert.deepEqual(validateUsername("BenLei_01"), { username: "benlei_01" });
  assert.match(validateUsername("中 文").error, /用户名/);
  assert.match(validateUsername("ab").error, /3-24/);
  assert.equal(validatePassword("123456").password, "123456");
  assert.match(validatePassword("12345").error, /6-72/);
});

test("internal auth emails are unique and do not expose a real mailbox", () => {
  const first = authEmailForUsername("benlei");
  const second = authEmailForUsername("benlei");
  assert.match(first, /^cdp\.benlei\.[a-f0-9]{12}@accounts\.invalid$/);
  assert.notEqual(first, second);
});

test("signed sessions reject tampering and expiry", () => {
  const secret = "test-session-secret-that-is-not-shared";
  const issuedAt = Date.UTC(2026, 6, 21);
  const token = createSessionToken("account-1", secret, issuedAt);
  assert.equal(verifySessionToken(token, secret, issuedAt + 1000)?.accountId, "account-1");
  assert.equal(verifySessionToken(`${token}x`, secret, issuedAt + 1000), null);
  assert.equal(verifySessionToken(token, "wrong-secret", issuedAt + 1000), null);
  assert.equal(verifySessionToken(token, secret, issuedAt + 8 * 24 * 60 * 60 * 1000), null);
});

test("avatar uploads validate both declared type and file signature", () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const decoded = decodeAvatarDataUrl(`data:image/png;base64,${png.toString("base64")}`);
  assert.equal(decoded.contentType, "image/png");
  assert.equal(decoded.extension, "png");
  assert.throws(
    () => decodeAvatarDataUrl(`data:image/jpeg;base64,${png.toString("base64")}`),
    /内容与格式不匹配/
  );
  assert.throws(() => decodeAvatarDataUrl("data:image/gif;base64,R0lGODlh"), /格式不正确/);
});

test("avatar-frame uploads require the fixed transparent frame geometry", () => {
  const valid = avatarFramePng();
  const decoded = decodeAvatarFrameDataUrl(`data:image/png;base64,${valid.toString("base64")}`);
  assert.equal(decoded.contentType, "image/png");
  assert.equal(decoded.extension, "png");
  assert.match(decoded.contentVersion, /^[a-f0-9]{16}$/);

  const opaqueOpening = avatarFramePng({ openingAlpha: 1 });
  assert.throws(
    () => decodeAvatarFrameDataUrl(`data:image/png;base64,${opaqueOpening.toString("base64")}`),
    /中央 320 × 320 px 开口必须完全透明/
  );

  const opaqueOuterEdge = avatarFramePng({ outerAlpha: 1 });
  assert.throws(
    () => decodeAvatarFrameDataUrl(`data:image/png;base64,${opaqueOuterEdge.toString("base64")}`),
    /四边 8 px 必须完全透明/
  );
});
