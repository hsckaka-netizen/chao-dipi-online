import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { inflateSync } from "node:zlib";

const SUPABASE_URL = String(process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
const SUPABASE_SECRET_KEY = String(process.env.SUPABASE_SECRET_KEY || "").trim();
const AUTH_SESSION_SECRET = String(process.env.AUTH_SESSION_SECRET || SUPABASE_SECRET_KEY || "").trim();
const AUTH_COOKIE_NAME = "cdp_auth";
const AUTH_SESSION_SECONDS = 7 * 24 * 60 * 60;
const AVATAR_BUCKET = "player-avatars";
const AVATAR_MAX_BYTES = 300_000;
const AVATAR_FRAME_BUCKET = "avatar-frame-assets";
const AVATAR_FRAME_MAX_BYTES = 1_200_000;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

export function validateUsername(value) {
  const username = normalizeUsername(value);
  if (!/^[a-z0-9_-]{3,24}$/.test(username)) {
    return { error: "用户名需为 3-24 位小写字母、数字、横线或下划线" };
  }
  return { username };
}

export function validatePassword(value) {
  const password = String(value || "");
  if (password.length < 6 || password.length > 72) return { error: "密码需为 6-72 位" };
  return { password };
}

export function authEmailForUsername(username) {
  const suffix = randomBytes(6).toString("hex");
  return `cdp.${normalizeUsername(username)}.${suffix}@accounts.invalid`;
}

export function accountAuthStatus() {
  return {
    configured: Boolean(SUPABASE_URL && SUPABASE_SECRET_KEY && AUTH_SESSION_SECRET),
    storageConfigured: Boolean(SUPABASE_URL && SUPABASE_SECRET_KEY),
    avatarBucket: AVATAR_BUCKET,
    avatarFrameBucket: AVATAR_FRAME_BUCKET
  };
}

function signatureFor(encodedPayload, secret) {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

export function createSessionToken(accountId, secret = AUTH_SESSION_SECRET, nowMs = Date.now()) {
  if (!secret) throw new Error("登录会话密钥尚未配置");
  const payload = Buffer.from(JSON.stringify({
    accountId,
    expiresAt: nowMs + AUTH_SESSION_SECONDS * 1000
  })).toString("base64url");
  return `${payload}.${signatureFor(payload, secret)}`;
}

export function verifySessionToken(token, secret = AUTH_SESSION_SECRET, nowMs = Date.now()) {
  if (!secret || !token) return null;
  const [payload, signature, extra] = String(token).split(".");
  if (!payload || !signature || extra) return null;
  const expected = signatureFor(payload, secret);
  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (receivedBuffer.length !== expectedBuffer.length || !timingSafeEqual(receivedBuffer, expectedBuffer)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!parsed.accountId || Number(parsed.expiresAt) <= nowMs) return null;
    return parsed;
  } catch {
    return null;
  }
}

function cookiesFromRequest(req) {
  return Object.fromEntries(String(req.headers.cookie || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.indexOf("=");
      if (separator < 0) return [part, ""];
      return [part.slice(0, separator), decodeURIComponent(part.slice(separator + 1))];
    }));
}

export function accountIdFromRequest(req) {
  return verifySessionToken(cookiesFromRequest(req)[AUTH_COOKIE_NAME])?.accountId || null;
}

function requestUsesHttps(req) {
  const forwarded = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  if (forwarded) return forwarded === "https";
  return !String(req.headers.host || "").startsWith("localhost")
    && !String(req.headers.host || "").startsWith("127.0.0.1");
}

export function sessionCookie(req, accountId) {
  const secure = requestUsesHttps(req) ? "; Secure" : "";
  const token = createSessionToken(accountId);
  return `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${AUTH_SESSION_SECONDS}${secure}`;
}

export function clearedSessionCookie(req) {
  const secure = requestUsesHttps(req) ? "; Secure" : "";
  return `${AUTH_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

function supabaseHeaders(extra = {}) {
  return {
    apikey: SUPABASE_SECRET_KEY,
    authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
    ...extra
  };
}

async function supabaseRequest(path, options = {}) {
  if (!accountAuthStatus().configured) {
    const error = new Error("账号服务尚未配置");
    error.status = 503;
    throw error;
  }
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: supabaseHeaders(options.headers)
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text };
  }
  if (!response.ok) {
    const error = new Error(data?.msg || data?.message || data?.error_description || "Supabase 请求失败");
    error.status = response.status;
    error.code = data?.code || data?.error_code || "SUPABASE_ERROR";
    throw error;
  }
  return data;
}

export async function createSupabaseUser({ email, password, username, role }) {
  const data = await supabaseRequest("/auth/v1/admin/users", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { username, role }
    })
  });
  return data.user || data;
}

export async function deleteSupabaseUser(accountId) {
  return supabaseRequest(`/auth/v1/admin/users/${encodeURIComponent(accountId)}`, { method: "DELETE" });
}

export async function updateSupabasePassword(accountId, password) {
  return supabaseRequest(`/auth/v1/admin/users/${encodeURIComponent(accountId)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password })
  });
}

export async function signInSupabaseUser(email, password) {
  const data = await supabaseRequest("/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  return data.user || null;
}

async function ensurePublicStorageBucket(bucket, fileSizeLimit, allowedMimeTypes) {
  if (!accountAuthStatus().storageConfigured) return { ready: false };
  const current = await fetch(`${SUPABASE_URL}/storage/v1/bucket/${bucket}`, {
    method: "GET",
    headers: supabaseHeaders()
  });
  if (current.ok) return { ready: true };
  try {
    await supabaseRequest("/storage/v1/bucket", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: bucket,
        name: bucket,
        public: true,
        file_size_limit: fileSizeLimit,
        allowed_mime_types: allowedMimeTypes
      })
    });
    return { ready: true };
  } catch (createError) {
    const retry = await fetch(`${SUPABASE_URL}/storage/v1/bucket/${bucket}`, {
      method: "GET",
      headers: supabaseHeaders()
    });
    if (retry.ok) return { ready: true };
    throw createError;
  }
}

export async function ensureAvatarBucket() {
  return ensurePublicStorageBucket(AVATAR_BUCKET, AVATAR_MAX_BYTES, ["image/webp", "image/jpeg", "image/png"]);
}

export async function ensureAvatarFrameBucket() {
  return ensurePublicStorageBucket(AVATAR_FRAME_BUCKET, AVATAR_FRAME_MAX_BYTES, ["image/png"]);
}

function avatarImageType(buffer, declaredType) {
  if (declaredType === "image/webp" && buffer.slice(0, 4).toString("ascii") === "RIFF" && buffer.slice(8, 12).toString("ascii") === "WEBP") {
    return { contentType: declaredType, extension: "webp" };
  }
  if (declaredType === "image/png" && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return { contentType: declaredType, extension: "png" };
  }
  if (declaredType === "image/jpeg" && buffer[0] === 0xff && buffer[1] === 0xd8) {
    return { contentType: declaredType, extension: "jpg" };
  }
  return null;
}

export function decodeAvatarDataUrl(dataUrl) {
  const match = String(dataUrl || "").match(/^data:(image\/(?:webp|png|jpeg));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw Object.assign(new Error("头像格式不正确"), { status: 400 });
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > AVATAR_MAX_BYTES) {
    throw Object.assign(new Error("头像必须小于 300KB"), { status: 413 });
  }
  const type = avatarImageType(buffer, match[1]);
  if (!type) throw Object.assign(new Error("头像文件内容与格式不匹配"), { status: 400 });
  return { buffer, ...type };
}

function invalidAvatarFrame(message) {
  return Object.assign(new Error(message), { status: 400 });
}

function paethPredictor(left, above, upperLeft) {
  const prediction = left + above - upperLeft;
  const leftDistance = Math.abs(prediction - left);
  const aboveDistance = Math.abs(prediction - above);
  const upperLeftDistance = Math.abs(prediction - upperLeft);
  return leftDistance <= aboveDistance && leftDistance <= upperLeftDistance
    ? left
    : aboveDistance <= upperLeftDistance
      ? above
      : upperLeft;
}

function validateAvatarFramePng(buffer) {
  if (buffer.length < 33 || !buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw invalidAvatarFrame("头像框文件不是有效的 PNG");
  }
  let offset = PNG_SIGNATURE.length;
  let header = null;
  const imageDataChunks = [];
  let ended = false;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) throw invalidAvatarFrame("头像框 PNG 文件不完整");
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buffer.subarray(dataStart, dataEnd);
    if (type === "IHDR") {
      if (header || data.length !== 13) throw invalidAvatarFrame("头像框 PNG 头信息不正确");
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        compression: data[10],
        filter: data[11],
        interlace: data[12]
      };
    } else if (type === "IDAT") {
      imageDataChunks.push(data);
    } else if (type === "IEND") {
      ended = true;
      break;
    }
    offset = dataEnd + 4;
  }
  if (!header || !ended || !imageDataChunks.length) throw invalidAvatarFrame("头像框 PNG 缺少图片数据");
  if (header.width !== 512 || header.height !== 512) throw invalidAvatarFrame("头像框必须是 512 × 512 px");
  if (header.bitDepth !== 8 || header.colorType !== 6 || header.compression !== 0 || header.filter !== 0 || header.interlace !== 0) {
    throw invalidAvatarFrame("头像框必须导出为非隔行的 8-bit RGBA PNG");
  }

  const bytesPerPixel = 4;
  const stride = header.width * bytesPerPixel;
  let pixels;
  try {
    pixels = inflateSync(Buffer.concat(imageDataChunks), { maxOutputLength: (stride + 1) * header.height });
  } catch {
    throw invalidAvatarFrame("头像框 PNG 图像数据无法读取");
  }
  if (pixels.length !== (stride + 1) * header.height) throw invalidAvatarFrame("头像框 PNG 像素数据不完整");

  let pixelOffset = 0;
  let previous = Buffer.alloc(stride);
  let hasVisibleFramePixel = false;
  for (let y = 0; y < header.height; y += 1) {
    const filter = pixels[pixelOffset];
    pixelOffset += 1;
    const encoded = pixels.subarray(pixelOffset, pixelOffset + stride);
    pixelOffset += stride;
    const current = Buffer.alloc(stride);
    for (let index = 0; index < stride; index += 1) {
      const left = index >= bytesPerPixel ? current[index - bytesPerPixel] : 0;
      const above = previous[index];
      const upperLeft = index >= bytesPerPixel ? previous[index - bytesPerPixel] : 0;
      const value = encoded[index];
      if (filter === 0) current[index] = value;
      else if (filter === 1) current[index] = (value + left) & 0xff;
      else if (filter === 2) current[index] = (value + above) & 0xff;
      else if (filter === 3) current[index] = (value + Math.floor((left + above) / 2)) & 0xff;
      else if (filter === 4) current[index] = (value + paethPredictor(left, above, upperLeft)) & 0xff;
      else throw invalidAvatarFrame("头像框 PNG 使用了不支持的滤镜");
    }
    for (let x = 0; x < header.width; x += 1) {
      const alpha = current[x * bytesPerPixel + 3];
      const outsideCanvasSafeEdge = x < 8 || x >= 504 || y < 8 || y >= 504;
      if (outsideCanvasSafeEdge && alpha !== 0) {
        throw invalidAvatarFrame("头像框四边 8 px 必须完全透明");
      }
      if (!outsideCanvasSafeEdge && alpha > 0) hasVisibleFramePixel = true;
    }
    previous = current;
  }
  if (!hasVisibleFramePixel) throw invalidAvatarFrame("头像框没有可见的框体内容");
}

export function decodeAvatarFrameDataUrl(dataUrl) {
  const match = String(dataUrl || "").match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw invalidAvatarFrame("头像框只支持 PNG 格式");
  const buffer = Buffer.from(match[1], "base64");
  if (!buffer.length || buffer.length > AVATAR_FRAME_MAX_BYTES) {
    throw Object.assign(new Error("头像框必须小于 1.2MB"), { status: 413 });
  }
  validateAvatarFramePng(buffer);
  return {
    buffer,
    contentType: "image/png",
    extension: "png",
    contentVersion: createHash("sha256").update(buffer).digest("hex").slice(0, 16)
  };
}

export async function uploadSupabaseAvatar(profileId, version, avatar) {
  await ensureAvatarBucket();
  const safeProfileId = String(profileId || "").replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeProfileId) throw Object.assign(new Error("玩家编号不正确"), { status: 400 });
  const uniqueSuffix = randomBytes(5).toString("hex");
  const path = `${safeProfileId}/v${Number(version)}-${uniqueSuffix}.${avatar.extension}`;
  await supabaseRequest(`/storage/v1/object/${AVATAR_BUCKET}/${path}`, {
    method: "POST",
    headers: {
      "content-type": avatar.contentType,
      "cache-control": "31536000",
      "x-upsert": "false"
    },
    body: avatar.buffer
  });
  return `${SUPABASE_URL}/storage/v1/object/public/${AVATAR_BUCKET}/${path}`;
}

export async function uploadSupabaseAvatarFrame(assetKey, avatarFrame) {
  await ensureAvatarFrameBucket();
  const safeAssetKey = String(assetKey || "").trim();
  if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(safeAssetKey)) {
    throw Object.assign(new Error("头像框主题编号不正确"), { status: 400 });
  }
  const contentVersion = String(avatarFrame?.contentVersion || "");
  if (!/^[a-f0-9]{16}$/.test(contentVersion)) throw Object.assign(new Error("头像框内容版本不正确"), { status: 400 });
  const path = `${safeAssetKey}/${contentVersion}.${avatarFrame.extension}`;
  await supabaseRequest(`/storage/v1/object/${AVATAR_FRAME_BUCKET}/${path}`, {
    method: "POST",
    headers: {
      "content-type": avatarFrame.contentType,
      "cache-control": "31536000, immutable",
      "x-upsert": "false"
    },
    body: avatarFrame.buffer
  });
  return `${SUPABASE_URL}/storage/v1/object/public/${AVATAR_FRAME_BUCKET}/${path}?v=${contentVersion}`;
}
