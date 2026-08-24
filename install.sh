#!/usr/bin/env bash

set -Eeuo pipefail

SERVICE_NAME="info-navigation"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

info() {
  printf '\n\033[1;34m[INFO]\033[0m %s\n' "$*"
}

fail() {
  printf '\n\033[1;31m[ERROR]\033[0m %s\n' "$*" >&2
  exit 1
}

escape_systemd_value() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  printf '%s' "$value"
}

[[ "$(uname -s)" == "Linux" ]] || fail "该安装脚本仅支持 Linux。"
[[ -f "${SCRIPT_DIR}/server.mjs" ]] || fail "未在脚本目录找到 server.mjs。"
command -v systemctl >/dev/null 2>&1 || fail "系统未安装或未使用 systemd。"
command -v sudo >/dev/null 2>&1 || fail "未找到 sudo，请先安装 sudo 或让管理员安装服务。"

if [[ "${EUID}" -eq 0 ]]; then
  fail "请使用实际运行服务的普通用户执行：bash install.sh（脚本会自行调用 sudo）。"
fi

INSTALL_USER="$(id -un)"
INSTALL_GROUP="$(id -gn)"
NODE_BIN="$(command -v node || true)"
[[ -n "${NODE_BIN}" ]] || fail "未找到 node，请先为当前用户安装 Node.js 18 或更高版本。"
NODE_BIN="$(readlink -f "${NODE_BIN}")"
NODE_MAJOR="$("${NODE_BIN}" -p 'Number(process.versions.node.split(".")[0])')"
[[ "${NODE_MAJOR}" =~ ^[0-9]+$ && "${NODE_MAJOR}" -ge 18 ]] || fail "需要 Node.js 18 或更高版本。"

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

  if [[ "${admin_username}" == "admin" && "${admin_password}" == "admin" ]]; then
    printf '\n\033[1;33m[WARN]\033[0m 当前仍为 admin/admin，请尽快修改 .env 后重启服务。\n' >&2
  fi
  unset admin_password password_hash
else
  info "检测到已有 .env，保留现有管理员配置。"
  chmod 600 "${SCRIPT_DIR}/.env"
  if grep -Eq '^[[:space:]]*(export[[:space:]]+)?ADMIN_PASSWORD[[:space:]]*=[[:space:]]*admin[[:space:]]*$' "${SCRIPT_DIR}/.env"; then
    printf '\n\033[1;33m[WARN]\033[0m .env 当前仍使用默认密码 admin，请尽快修改。\n' >&2
  fi
fi

mkdir -p "${SCRIPT_DIR}/data"
chmod 700 "${SCRIPT_DIR}/data"

escaped_project="$(escape_systemd_value "${SCRIPT_DIR}")"
escaped_node="$(escape_systemd_value "${NODE_BIN}")"
escaped_user="$(escape_systemd_value "${INSTALL_USER}")"
escaped_group="$(escape_systemd_value "${INSTALL_GROUP}")"
temporary_service="$(mktemp)"
trap 'rm -f "${temporary_service}"' EXIT

{
  printf '[Unit]\n'
  printf 'Description=Info Navigation Website\n'
  printf 'After=network.target\n\n'
  printf '[Service]\n'
  printf 'Type=simple\n'
  printf 'User="%s"\n' "${escaped_user}"
  printf 'Group="%s"\n' "${escaped_group}"
  printf 'WorkingDirectory="%s"\n' "${escaped_project}"
  printf 'Environment=NODE_ENV=production\n'
  printf 'Environment="DATA_DIR=%s/data"\n' "${escaped_project}"
  printf 'ExecStart="%s" "%s/server.mjs"\n' "${escaped_node}" "${escaped_project}"
  printf 'Restart=on-failure\n'
  printf 'RestartSec=3\n'
  printf 'TimeoutStopSec=15\n'
  printf 'UMask=0077\n'
  printf 'NoNewPrivileges=true\n'
  printf 'PrivateTmp=true\n\n'
  printf '[Install]\n'
  printf 'WantedBy=multi-user.target\n'
} > "${temporary_service}"

info "需要 sudo 权限来安装 systemd 服务。"
sudo -v
sudo install -m 0644 "${temporary_service}" "${SERVICE_FILE}"
sudo systemctl daemon-reload
sudo systemctl enable "${SERVICE_NAME}" >/dev/null
sudo systemctl restart "${SERVICE_NAME}"
sleep 1

if sudo systemctl is-active --quiet "${SERVICE_NAME}"; then
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
  sudo journalctl -u "${SERVICE_NAME}" -n 50 --no-pager >&2
  exit 1
fi
