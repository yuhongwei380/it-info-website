#!/usr/bin/env bash

set -Eeuo pipefail

SERVICE_NAME="info-navigation"
SCRIPT_PATH="$(readlink -f -- "${BASH_SOURCE[0]}")"
SCRIPT_DIR="$(dirname -- "${SCRIPT_PATH}")"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

info() {
  printf '\n\033[1;34m[INFO]\033[0m %s\n' "$*"
}

fail() {
  printf '\n\033[1;31m[ERROR]\033[0m %s\n' "$*" >&2
  exit 1
}

[[ "$(uname -s)" == "Linux" ]] || fail "该安装脚本仅支持 Linux。"
[[ "${SCRIPT_DIR}" == /* ]] || fail "无法解析项目的绝对路径：${SCRIPT_DIR}"
[[ ! "${SCRIPT_DIR}" =~ [[:space:]] ]] || fail "项目路径不能包含空格或制表符：${SCRIPT_DIR}"
[[ -f "${SCRIPT_DIR}/server.mjs" ]] || fail "未在脚本目录找到 server.mjs。"
command -v systemctl >/dev/null 2>&1 || fail "系统未安装或未使用 systemd。"

if [[ "${EUID}" -ne 0 ]]; then
  fail "安装 systemd 服务需要 root 权限，请执行：sudo bash install.sh"
fi

INSTALL_USER="${SUDO_USER:-}"
[[ -n "${INSTALL_USER}" && "${INSTALL_USER}" != "root" ]] || fail "请从实际运行服务的普通用户执行：sudo bash install.sh"
INSTALL_GROUP="$(id -gn "${INSTALL_USER}")"
INSTALL_HOME="$(getent passwd "${INSTALL_USER}" | cut -d: -f6)"
[[ -n "${INSTALL_HOME}" ]] || fail "无法确定用户 ${INSTALL_USER} 的主目录。"

NODE_BIN=""
node_candidates=()
[[ -n "${INFO_NAV_NODE:-}" ]] && node_candidates+=("${INFO_NAV_NODE}")

shopt -s nullglob
nvm_nodes=("${INSTALL_HOME}"/.nvm/versions/node/*/bin/node)
shopt -u nullglob
if [[ "${#nvm_nodes[@]}" -gt 0 ]]; then
  latest_nvm_node="$(printf '%s\n' "${nvm_nodes[@]}" | sort -V | tail -n 1)"
  node_candidates+=("${latest_nvm_node}")
fi

node_candidates+=(
  "${INSTALL_HOME}/.volta/bin/node"
  "${INSTALL_HOME}/.local/share/fnm/aliases/default/bin/node"
  "$(command -v node || true)"
)

for candidate in "${node_candidates[@]}"; do
  [[ -n "${candidate}" && -x "${candidate}" ]] || continue
  candidate="$(readlink -f -- "${candidate}")"
  candidate_major="$("${candidate}" -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null || true)"
  if [[ "${candidate_major}" =~ ^[0-9]+$ && "${candidate_major}" -ge 18 ]]; then
    NODE_BIN="${candidate}"
    break
  fi
done

[[ -n "${NODE_BIN}" ]] || fail "未找到 Node.js 18+。如果 Node 安装在自定义路径，请执行：sudo INFO_NAV_NODE=\"$(command -v node 2>/dev/null || printf '/path/to/node')\" bash install.sh"
[[ ! "${NODE_BIN}" =~ [[:space:]] ]] || fail "Node.js 路径不能包含空格或制表符：${NODE_BIN}"

info "项目目录：${SCRIPT_DIR}"
info "运行用户：${INSTALL_USER}"
info "Node.js：${NODE_BIN} ($("${NODE_BIN}" --version))"

if [[ ! -f "${SCRIPT_DIR}/.env" ]]; then
  info "首次安装，正在创建 .env。"
  admin_username="admin"
  if [[ -t 0 ]]; then
    read -r -p "管理员用户名 [admin]: " input_username
    admin_username="${input_username:-admin}"
    while true; do
      read -r -s -p "管理员密码（至少 12 位；直接回车则临时使用 admin）: " admin_password
      printf '\n'
      if [[ -z "${admin_password}" ]]; then
        admin_password="admin"
        break
      fi
      [[ "${#admin_password}" -ge 12 ]] && break
      printf '\033[1;33m密码不足 12 位，请重新输入。\033[0m\n' >&2
    done
  else
    admin_password="${ADMIN_PASSWORD:-admin}"
    admin_username="${ADMIN_USERNAME:-admin}"
    if [[ "${admin_password}" != "admin" && "${#admin_password}" -lt 12 ]]; then
      fail "非交互安装时，ADMIN_PASSWORD 必须至少为 12 位。"
    fi
  fi

  [[ "${admin_username}" =~ ^[A-Za-z0-9_.@-]+$ ]] || fail "管理员用户名只能包含字母、数字、点、下划线、@ 和连字符。"
  {
    printf 'export ADMIN_USERNAME=%s\n' "${admin_username}"
    if [[ "${admin_password}" == "admin" ]]; then
      printf 'export ADMIN_PASSWORD=admin\n'
    else
      password_hash="$(printf '%s' "${admin_password}" | "${NODE_BIN}" "${SCRIPT_DIR}/scripts/hash-password.mjs" --stdin)"
      printf "export ADMIN_PASSWORD_HASH='%s'\n" "${password_hash}"
    fi
    printf 'export HOST=0.0.0.0\n'
    printf 'export PORT=4173\n'
    printf 'export DATA_DIR=./data\n'
    printf 'export COOKIE_SECURE=false\n'
    printf 'export TRUST_PROXY=false\n'
  } > "${SCRIPT_DIR}/.env"
  chmod 600 "${SCRIPT_DIR}/.env"
  chown "${INSTALL_USER}:${INSTALL_GROUP}" "${SCRIPT_DIR}/.env"

  if [[ "${admin_username}" == "admin" && "${admin_password}" == "admin" ]]; then
    printf '\n\033[1;33m[WARN]\033[0m 当前仍为 admin/admin，请尽快修改 .env 后重启服务。\n' >&2
  fi
  unset admin_password password_hash
else
  info "检测到已有 .env，保留现有管理员配置。"
  chmod 600 "${SCRIPT_DIR}/.env"
  chown "${INSTALL_USER}:${INSTALL_GROUP}" "${SCRIPT_DIR}/.env"
  if grep -Eq '^[[:space:]]*(export[[:space:]]+)?ADMIN_PASSWORD[[:space:]]*=[[:space:]]*admin[[:space:]]*$' "${SCRIPT_DIR}/.env"; then
    printf '\n\033[1;33m[WARN]\033[0m .env 当前仍使用默认密码 admin，请尽快修改。\n' >&2
  fi
fi

mkdir -p "${SCRIPT_DIR}/data"
chmod 700 "${SCRIPT_DIR}/data"
chown -R "${INSTALL_USER}:${INSTALL_GROUP}" "${SCRIPT_DIR}/data"

temporary_service="$(mktemp)"
trap 'rm -f "${temporary_service}"' EXIT

{
  printf '[Unit]\n'
  printf 'Description=Info Navigation Website\n'
  printf 'After=network.target\n\n'
  printf '[Service]\n'
  printf 'Type=simple\n'
  printf 'User=%s\n' "${INSTALL_USER}"
  printf 'Group=%s\n' "${INSTALL_GROUP}"
  printf 'WorkingDirectory=%s\n' "${SCRIPT_DIR}"
  printf 'Environment=NODE_ENV=production\n'
  printf 'Environment=DATA_DIR=%s/data\n' "${SCRIPT_DIR}"
  printf 'ExecStart=%s %s/server.mjs\n' "${NODE_BIN}" "${SCRIPT_DIR}"
  printf 'Restart=on-failure\n'
  printf 'RestartSec=3\n'
  printf 'TimeoutStopSec=15\n'
  printf 'UMask=0077\n'
  printf 'NoNewPrivileges=true\n'
  printf 'PrivateTmp=true\n\n'
  printf '[Install]\n'
  printf 'WantedBy=multi-user.target\n'
} > "${temporary_service}"

install -m 0644 "${temporary_service}" "${SERVICE_FILE}"
systemctl daemon-reload
if command -v systemd-analyze >/dev/null 2>&1 && ! systemd-analyze verify "${SERVICE_FILE}"; then
  fail "systemd 服务文件校验失败，请检查上方错误信息。"
fi
systemctl enable "${SERVICE_NAME}" >/dev/null
systemctl restart "${SERVICE_NAME}"
sleep 1

if systemctl is-active --quiet "${SERVICE_NAME}"; then
  port="$(sed -nE 's/^[[:space:]]*(export[[:space:]]+)?PORT[[:space:]]*=[[:space:]]*([^#[:space:]]+).*$/\2/p' "${SCRIPT_DIR}/.env" | head -n 1)"
  port="${port:-4173}"
  printf '\n\033[1;32m安装完成。\033[0m\n'
  printf '访问地址：http://服务器IP:%s/\n' "${port}"
  printf '管理页面：http://服务器IP:%s/admin.html\n' "${port}"
  printf '服务状态：sudo systemctl status %s\n' "${SERVICE_NAME}"
  printf '实时日志：sudo journalctl -u %s -f\n' "${SERVICE_NAME}"
  printf '重启服务：sudo systemctl restart %s\n' "${SERVICE_NAME}"
else
  printf '\n服务启动失败，最近日志如下：\n' >&2
  journalctl -u "${SERVICE_NAME}" -n 50 --no-pager >&2
  exit 1
fi
