import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const SUPABASE_URL = String(process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
const SUPABASE_SECRET_KEY = String(process.env.SUPABASE_SECRET_KEY || "").trim();
const AUTH_SESSION_SECRET = String(process.env.AUTH_SESSION_SECRET || SUPABASE_SECRET_KEY || "").trim();
const AUTH_COOKIE_NAME = "cdp_auth";
const AUTH_SESSION_SECONDS = 7 * 24 * 60 * 60;
const AVATAR_BUCKET = "player-avatars";
const AVATAR_MAX_BYTES = 300_000;

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
  if (password.length < 8 || password.length > 72) return { error: "密码需为 8-72 位" };
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
    avatarBucket: AVATAR_BUCKET
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
  const headers = { apikey: SUPABASE_SECRET_KEY, ...extra };
  if (SUPABASE_SECRET_KEY && !SUPABASE_SECRET_KEY.startsWith("sb_")) {
    headers.authorization = `Bearer ${SUPABASE_SECRET_KEY}`;
  }
  return headers;
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

export async function ensureAvatarBucket() {
  if (!accountAuthStatus().storageConfigured) return { ready: false };
  const current = await fetch(`${SUPABASE_URL}/storage/v1/bucket/${AVATAR_BUCKET}`, {
    method: "GET",
    headers: supabaseHeaders()
  });
  if (current.ok) return { ready: true };
  if (current.status !== 404) return { ready: false };
  await supabaseRequest("/storage/v1/bucket", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: AVATAR_BUCKET,
      name: AVATAR_BUCKET,
      public: true,
      file_size_limit: AVATAR_MAX_BYTES,
      allowed_mime_types: ["image/webp", "image/jpeg", "image/png"]
    })
  });
  return { ready: true };
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
