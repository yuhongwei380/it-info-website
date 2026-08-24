import { randomBytes, scryptSync } from "node:crypto";

const password = await readPassword();
if (password.length < 12) {
  console.error("管理员密码至少需要 12 个字符");
  process.exit(1);
}

const N = 16384;
const r = 8;
const p = 1;
const salt = randomBytes(16);
const hash = scryptSync(password, salt, 64, { N, r, p, maxmem: 64 * 1024 * 1024 });
console.log(`scrypt$${N}$${r}$${p}$${salt.toString("base64url")}$${hash.toString("base64url")}`);

async function readPassword() {
  if (process.argv.includes("--stdin") || !process.stdin.isTTY) {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    return Buffer.concat(chunks).toString("utf8").replace(/[\r\n]+$/, "");
  }
  console.error("请通过标准输入传入密码，避免密码进入命令历史。参见 README.md。 ");
  process.exit(1);
}
