# Info 导航站

团队只读网址导航与管理员内容管理服务。普通用户只能查看；管理员登录后才能新增、修改或删除分组、卡片和链接。配置统一保存在 Linux 服务器的 JSON 文件中。

## 环境要求

- Linux
- Node.js 18 或更高版本
- 项目没有第三方 npm 依赖，无需执行 `npm install`

## 最简单的启动方法

进入项目目录：

```bash
cd /opt/it-info-website
```

复制配置模板：

```bash
cp .env.example .env
nano .env
```

`.env` 示例：

```bash
export ADMIN_USERNAME=admin
export ADMIN_PASSWORD=请修改为你的管理员密码
export HOST=0.0.0.0
export PORT=4173
export DATA_DIR=/opt/it-info-website/data
export COOKIE_SECURE=false
export TRUST_PROXY=false
```

启动：

```bash
npm start
```

访问：

- 用户页：`http://服务器IP:4173/`
- 管理端：`http://服务器IP:4173/admin.html`
- 登录页：`http://服务器IP:4173/login.html`

如果没有 `.env`，默认管理员用户名和密码都是 `admin`。这只用于首次启动，正式使用前必须修改。

配置优先级：系统环境变量高于 `.env`，`.env` 高于代码默认值。

## systemd 正式运行

创建服务用户和目录：

```bash
sudo useradd --system --home /opt/info-navigation --shell /usr/sbin/nologin info-nav
sudo mkdir -p /opt/info-navigation /var/lib/info-navigation
sudo chown info-nav:info-nav /var/lib/info-navigation
```

将代码放到 `/opt/info-navigation` 后创建服务环境文件：

```bash
sudo cp deploy/info-navigation.env.example /etc/info-navigation.env
sudo chmod 600 /etc/info-navigation.env
sudo nano /etc/info-navigation.env
```

使用 Nginx 和 HTTPS 时建议配置：

```ini
HOST=127.0.0.1
PORT=4173
DATA_DIR=/var/lib/info-navigation
ADMIN_USERNAME=admin
ADMIN_PASSWORD=请设置一个强密码
SESSION_HOURS=8
COOKIE_SECURE=true
TRUST_PROXY=true
```

安装并启动 systemd 服务：

```bash
sudo cp deploy/info-navigation.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now info-navigation
sudo systemctl status info-navigation
```

查看日志：

```bash
sudo journalctl -u info-navigation -f
```

重启和停止：

```bash
sudo systemctl restart info-navigation
sudo systemctl stop info-navigation
```

## Nginx

```bash
sudo cp deploy/nginx.conf /etc/nginx/conf.d/info-navigation.conf
sudo nano /etc/nginx/conf.d/info-navigation.conf
sudo nginx -t
sudo systemctl reload nginx
```

将示例中的 `nav.example.com` 替换为实际域名，并配置 HTTPS。

## 更安全的哈希密码配置

如果不希望环境文件保存明文密码，可以生成 `scrypt` 哈希：

```bash
read -s -p "Admin password: " ADMIN_PASS
echo
printf '%s' "$ADMIN_PASS" | node scripts/hash-password.mjs --stdin
unset ADMIN_PASS
```

将输出配置为：

```ini
ADMIN_PASSWORD_HASH='完整的scrypt哈希'
```

配置 `ADMIN_PASSWORD_HASH` 后会优先使用哈希，并忽略 `ADMIN_PASSWORD`。

## 数据文件

数据保存在 `DATA_DIR/directory.json`。正式配置示例中的位置是：

```text
/var/lib/info-navigation/directory.json
```

请定期备份该文件。服务采用临时文件加原子重命名方式保存，建议通过管理页面修改数据。

## 权限边界

- `GET /api/directory`：公开只读。
- `PUT /api/directory`：仅已登录管理员。
- `/admin.html`：未登录时跳转至登录页。
- 管理会话默认 8 小时；服务重启后会话失效。
- 同一来源连续登录失败会被临时限制。
