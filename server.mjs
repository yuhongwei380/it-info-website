import { createServer } from "node:http";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultDirectory } from "./src/default-data.js";

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));
await loadEnvFile(path.join(rootDirectory, ".env"));

const dataDirectory = path.resolve(process.env.DATA_DIR || path.join(rootDirectory, "data"));
const dataFile = path.join(dataDirectory, "directory.json");
const host = process.env.HOST || "127.0.0.1";
const port = Number.parseInt(process.env.PORT || "4173", 10);
const adminUsername = process.env.ADMIN_USERNAME || "admin";
const passwordHash = process.env.ADMIN_PASSWORD_HASH || "";
const plainPassword = passwordHash ? "" : (process.env.ADMIN_PASSWORD || "admin");
const secureCookie = process.env.COOKIE_SECURE === "true";
const trustProxy = process.env.TRUST_PROXY === "true";
const sessionHours = Number.parseInt(process.env.SESSION_HOURS || "8", 10);
const sessionMaxAgeMs = sessionHours * 60 * 60 * 1000;
const sessionCookie = "info_admin_session";
const sessions = new Map();
const loginAttempts = new Map();
let writeQueue = Promise.resolve();
const plainPasswordSalt = passwordHash ? null : randomBytes(16);
const plainPasswordDigest = passwordHash ? null : scryptSync(plainPassword, plainPasswordSalt, 64, { maxmem: 64 * 1024 * 1024 });
delete process.env.ADMIN_PASSWORD;

if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT 必须是有效端口号");
if (!passwordHash && adminUsername === "admin" && plainPassword === "admin") {
  console.warn("安全警告：当前使用默认管理员账号和密码 admin/admin，请立即在 .env 中修改 ADMIN_PASSWORD。");
}

await ensureDataFile();

const staticFiles = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/admin.html", "admin.html"],
  ["/login.html", "login.html"],
  ["/styles.css", "styles.css"],
  ["/src/app.js", "src/app.js"],
  ["/src/admin.js", "src/admin.js"],
  ["/src/login.js", "src/login.js"],
  ["/src/store.js", "src/store.js"],
  ["/src/default-data.js", "src/default-data.js"]
]);

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"]
]);

const server = createServer(async (request, response) => {
  const startedAt = Date.now();
  try {
    applySecurityHeaders(response);
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    const pathname = url.pathname;

    if (pathname === "/api/directory" && request.method === "GET") {
      return sendJson(response, 200, await readDirectory(), { "Cache-Control": "no-store" });
    }

    if (pathname === "/api/directory" && request.method === "PUT") {
      if (!getSession(request)) return sendJson(response, 401, { error: "登录已失效，请重新登录" });
      if (!isSameOrigin(request)) return sendJson(response, 403, { error: "请求来源无效" });
      const nextDirectory = await readJsonBody(request, 1024 * 1024);
      if (!isValidDirectory(nextDirectory)) return sendJson(response, 400, { error: "导航数据格式不正确" });
      await queueDirectoryWrite(nextDirectory);
      return sendJson(response, 200, { ok: true });
    }

    if (pathname === "/api/auth/status" && request.method === "GET") {
      const session = getSession(request);
      return sendJson(response, 200, { authenticated: Boolean(session), username: session?.username || null }, { "Cache-Control": "no-store" });
    }

    if (pathname === "/api/auth/login" && request.method === "POST") {
      if (!isSameOrigin(request)) return sendJson(response, 403, { error: "请求来源无效" });
      const clientAddress = getClientAddress(request);
      if (isRateLimited(clientAddress)) return sendJson(response, 429, { error: "登录尝试过多，请稍后再试" });
      const credentials = await readJsonBody(request, 16 * 1024);
      const valid = credentials?.username === adminUsername && verifyAdminPassword(String(credentials?.password || ""));
      if (!valid) {
        recordLoginFailure(clientAddress);
        return sendJson(response, 401, { error: "用户名或密码错误" });
      }
      loginAttempts.delete(clientAddress);
      const token = randomBytes(32).toString("base64url");
      sessions.set(token, { username: adminUsername, expiresAt: Date.now() + sessionMaxAgeMs });
      response.setHeader("Set-Cookie", buildSessionCookie(token, sessionHours * 60 * 60));
      return sendJson(response, 200, { ok: true, username: adminUsername });
    }

    if (pathname === "/api/auth/logout" && request.method === "POST") {
      if (!isSameOrigin(request)) return sendJson(response, 403, { error: "请求来源无效" });
      const token = readCookie(request, sessionCookie);
      if (token) sessions.delete(token);
      response.setHeader("Set-Cookie", buildSessionCookie("", 0));
      return sendJson(response, 200, { ok: true });
    }

    if (pathname.startsWith("/api/")) return sendJson(response, 404, { error: "接口不存在" });
    if (!['GET', 'HEAD'].includes(request.method || '')) return sendJson(response, 405, { error: "请求方法不允许" });

    if (pathname === "/admin.html" && !getSession(request)) {
      response.writeHead(302, { Location: "/login.html?next=%2Fadmin.html" });
      return response.end();
    }

    const relativeFile = staticFiles.get(pathname);
    if (!relativeFile) return sendText(response, 404, "Not Found");
    const filePath = path.join(rootDirectory, relativeFile);
    const content = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes.get(path.extname(filePath)) || "application/octet-stream",
      "Cache-Control": pathname.endsWith(".html") ? "no-cache" : "public, max-age=300"
    });
    if (request.method === "HEAD") return response.end();
    return response.end(content);
  } catch (error) {
    const status = error.statusCode || 500;
    if (status >= 500) console.error(error);
    return sendJson(response, status, { error: status >= 500 ? "服务器内部错误" : error.message });
  } finally {
    console.log(`${request.method} ${request.url} ${response.statusCode} ${Date.now() - startedAt}ms`);
  }
});

server.listen(port, host, () => {
  console.log(`Info Navigation listening on http://${host}:${port}`);
  console.log(`Data file: ${dataFile}`);
});

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [token, session] of sessions) if (session.expiresAt <= now) sessions.delete(token);
  for (const [address, attempt] of loginAttempts) if (attempt.resetAt <= now) loginAttempts.delete(address);
}, 10 * 60 * 1000);
cleanupTimer.unref();

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}

async function ensureDataFile() {
  await mkdir(dataDirectory, { recursive: true });
  try {
    await access(dataFile, fsConstants.R_OK | fsConstants.W_OK);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await writeFile(dataFile, `${JSON.stringify(defaultDirectory, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
  }
}

async function readDirectory() {
  const data = JSON.parse(await readFile(dataFile, "utf8"));
  if (!isValidDirectory(data)) throw new Error("服务器导航数据格式不正确");
  return data;
}

function queueDirectoryWrite(data) {
  const snapshot = JSON.parse(JSON.stringify(data));
  writeQueue = writeQueue.catch(() => {}).then(async () => {
    const temporaryFile = `${dataFile}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporaryFile, `${JSON.stringify(snapshot, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporaryFile, dataFile);
  });
  return writeQueue;
}

function isValidDirectory(data) {
  if (!data || !Array.isArray(data.groups) || data.groups.length > 100) return false;
  return data.groups.every((group) =>
    group && typeof group.id === "string" && group.id.length <= 100 && typeof group.name === "string" && group.name.length <= 100 &&
    Array.isArray(group.cards) && group.cards.length <= 500 && group.cards.every((card) =>
      card && typeof card.id === "string" && typeof card.title === "string" && card.title.length <= 200 &&
      Array.isArray(card.links) && card.links.length <= 100 && card.links.every((link) =>
        link && typeof link.id === "string" && typeof link.label === "string" && link.label.length <= 200 &&
        typeof link.url === "string" && link.url.length <= 2048 && isAllowedUrl(link.url)
      )
    )
  );
}

function isAllowedUrl(value) {
  try {
    return ["http:", "https:", "mailto:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

async function readJsonBody(request, limit) {
  if (!(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
    const error = new Error("请求必须使用 application/json");
    error.statusCode = 415;
    throw error;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) {
      const error = new Error("请求内容过大");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("JSON 格式不正确");
    error.statusCode = 400;
    throw error;
  }
}

function verifyPassword(password, encodedHash) {
  try {
    const [algorithm, nValue, rValue, pValue, saltValue, hashValue] = encodedHash.split("$");
    if (algorithm !== "scrypt") return false;
    const expected = Buffer.from(hashValue, "base64url");
    const actual = scryptSync(password, Buffer.from(saltValue, "base64url"), expected.length, {
      N: Number(nValue), r: Number(rValue), p: Number(pValue), maxmem: 64 * 1024 * 1024
    });
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function verifyAdminPassword(password) {
  if (passwordHash) return verifyPassword(password, passwordHash);
  const actual = scryptSync(password, plainPasswordSalt, plainPasswordDigest.length, { maxmem: 64 * 1024 * 1024 });
  return timingSafeEqual(plainPasswordDigest, actual);
}

function getSession(request) {
  const token = readCookie(request, sessionCookie);
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  return session;
}

function readCookie(request, name) {
  const cookieHeader = request.headers.cookie || "";
  for (const pair of cookieHeader.split(";")) {
    const [key, ...parts] = pair.trim().split("=");
    if (key === name) return decodeURIComponent(parts.join("="));
  }
  return null;
}

function buildSessionCookie(value, maxAge) {
  const attributes = [`${sessionCookie}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "SameSite=Strict", `Max-Age=${maxAge}`];
  if (secureCookie) attributes.push("Secure");
  return attributes.join("; ");
}

function isSameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
}

function isRateLimited(address) {
  const attempt = loginAttempts.get(address);
  return Boolean(attempt && attempt.resetAt > Date.now() && attempt.count >= 5);
}

function recordLoginFailure(address) {
  const current = loginAttempts.get(address);
  if (!current || current.resetAt <= Date.now()) loginAttempts.set(address, { count: 1, resetAt: Date.now() + 15 * 60 * 1000 });
  else current.count += 1;
}

function getClientAddress(request) {
  if (trustProxy) {
    const forwarded = request.headers["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded) return forwarded.split(",")[0].trim();
  }
  return request.socket.remoteAddress || "unknown";
}

async function loadEnvFile(filePath) {
  let contents;
  try {
    contents = await readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }

  for (const rawLine of contents.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("export ")) line = line.slice(7).trim();
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = parseEnvValue(rawValue);
  }
}

function parseEnvValue(rawValue) {
  const value = rawValue.trim();
  if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
    return value.slice(1, -1);
  }
  return value.replace(/\s+#.*$/, "").trim();
}

function applySecurityHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "same-origin");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.setHeader("Content-Security-Policy", "default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
}

function sendJson(response, status, payload, headers = {}) {
  if (response.writableEnded) return;
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...headers });
  response.end(JSON.stringify(payload));
}

function sendText(response, status, text) {
  response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(text);
}
