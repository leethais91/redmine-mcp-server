# Redmine MCP Server

> 🇬🇧 English version: [README.md](./README.md)

[Model Context Protocol](https://modelcontextprotocol.io) server giúp Claude (Desktop, Code, claude.ai, OpenClaw) thao tác trực tiếp với Redmine bằng ngôn ngữ tự nhiên — liệt kê/tìm kiếm issue, tạo & cập nhật ticket, log thời gian, tra cứu project, user, status, custom field...

**Điểm nổi bật**
- 🛠️ **20 tools** cho issues, projects, time tracking và lookups
- 🔁 **Hai transport, một core** — cùng `createServer()` chạy được ở cả stdio local và Cloudflare Worker
- 🔐 **Auth fail-closed** trên Worker (bắt buộc `MCP_AUTH_TOKEN` Bearer, không có chế độ public)
- ⚡ **Stateless & nhẹ** — native `fetch`, input validate bằng zod, output markdown tối ưu cho LLM
- 🆓 **Host miễn phí** — vừa với Cloudflare Workers free tier

**Chọn chế độ phù hợp**

| Chế độ | Hợp với | Latency | Always-on | Multi-device |
|---|---|---|---|---|
| **Stdio** (`src/index.ts`) | Chỉ Claude Desktop | In-process, ~0ms | Khi app chạy | 1 máy |
| **Cloudflare Workers** (`src/worker.ts`) | Claude Code, claude.ai (web + mobile), OpenClaw | ~50–200ms | Có | Có |

Có thể dùng cả hai song song — share chung tool implementation trong `src/server.ts`.

**Yêu cầu**

- Node.js 18+ (dùng native `fetch`, chạy được trên Node 18+ và Cloudflare Workers)
- Một Redmine instance đã bật API access
- Riêng cho Workers mode: tài khoản [Cloudflare](https://cloudflare.com) free

---

## Các tool có sẵn

### Issues
| Tool | Mô tả |
|---|---|
| `redmine_list_issues` | Liệt kê/tìm kiếm issue với nhiều bộ lọc |
| `redmine_get_issue` | Xem chi tiết 1 issue (kèm history, comments) |
| `redmine_create_issue` | Tạo issue mới |
| `redmine_update_issue` | Cập nhật issue (status, assignee, v.v.) |
| `redmine_add_note` | Thêm comment vào issue |

### Projects
| Tool | Mô tả |
|---|---|
| `redmine_list_projects` | Liệt kê tất cả project |
| `redmine_get_project` | Xem chi tiết project |
| `redmine_list_versions` | Liệt kê version/milestone của project |

### Time Tracking
| Tool | Mô tả |
|---|---|
| `redmine_list_time_entries` | Xem log thời gian |
| `redmine_create_time_entry` | Log thời gian làm việc |
| `redmine_update_time_entry` | Sửa time entry |
| `redmine_delete_time_entry` | Xoá time entry |

### Tra cứu
| Tool | Mô tả |
|---|---|
| `redmine_list_statuses` | Danh sách trạng thái issue |
| `redmine_list_trackers` | Danh sách tracker (Bug, Feature, Task...) |
| `redmine_list_priorities` | Danh sách mức ưu tiên |
| `redmine_list_users` | Danh sách user |
| `redmine_get_current_user` | Thông tin user hiện tại |
| `redmine_list_custom_fields` | Danh sách custom fields |
| `redmine_list_memberships` | Thành viên project và role của họ |
| `redmine_list_activities` | Activity cho time entry (Design, Dev...) |

---

## Lấy API Key Redmine

Đăng nhập Redmine → **My Account** (góc trên phải) → **API access key** → **Show**

---

## Cài như một plugin

Repo này đóng gói sẵn theo cả hai chuẩn plugin, nên hầu hết client cài được chỉ
bằng một bước. Cả hai manifest đều khởi động cùng một package npm qua stdio.

| Client | Cách cài |
|---|---|
| Cursor, ChatGPT, Kiro | cài từ URL của repository |
| VS Code | **Chat: Install Plugin From Source**, hoặc marketplace `@agentPlugins` |
| GitHub Copilot | cài từ URL của repository (IDE hoặc CLI) |
| Claude Code | `claude plugin marketplace add leethais91/redmine-mcp-server` rồi `claude plugin install redmine@leethais91` |
| Codex | `codex plugin marketplace add leethais91/redmine-mcp-server` rồi `codex plugin add redmine@leethais91` |

Cài kiểu này là có luôn cả MCP server lẫn skill Redmine — không phải tải thêm gì.
Muốn thử mà chưa cài, chạy `claude --plugin-dir .` trong thư mục checkout, plugin
chỉ được nạp cho phiên đó.

Codex khoá `@latest` thành một version cố định ngay lúc cài, nên sau mỗi release
mới phải chạy lại `codex plugin add` thì mới cập nhật.

Manifest: `plugin.json` + `mcp.json` theo chuẩn [Agent Plugins](https://agent-plugins.org)
v1. Claude Code và Codex mỗi bên cần manifest riêng — `.claude-plugin/plugin.json`
và `.codex-plugin/plugin.json` — nhưng cùng đọc một file `.mcp.json`, file này khai
báo server ở dạng cả hai đều hiểu.

Agent Plugins phải có `mcp.json` riêng vì hai chuẩn expand placeholder khác nhau:
Claude Code thay `${CLAUDE_PLUGIN_DATA}` và để nguyên `${PLUGIN_DATA}`.

> **Version vừa publish có thể chưa cài được.** Thiết lập chống tấn công chuỗi cung
> ứng `min-release-age` của npm từ chối package mới hơn khoảng thời gian đã cấu
> hình, báo `ENOVERSIONS: No versions available`. Hoặc chờ hết khoảng đó, hoặc cài
> kèm `--min-release-age=0`.

### Thông tin đăng nhập

**Claude Code** hỏi ngay lúc cài plugin — điền Redmine URL và API key vào ô nhập là
xong. Key được cất trong keychain của hệ điều hành, không nằm trong file nào của
repo. Muốn đổi sau thì dùng `/config`.

**Các client còn lại**, chạy setup một lần:

```bash
npx @leethais91/redmine-mcp-server --init
```

Lệnh này hỏi Redmine URL và API key, kiểm tra với server trước khi lưu, rồi ghi ra
`~/.config/redmine-mcp/config.json` với quyền chỉ chủ sở hữu đọc được. Key sai sẽ
báo ngay lúc đó, thay vì đợi đến lần gọi tool đầu tiên.

Cần chạy tự động — trong Dockerfile, trong CI, hoặc để coding agent gọi — thì
truyền thẳng giá trị thay vì trả lời từng câu hỏi:

```bash
npx @leethais91/redmine-mcp-server --init \
  --url https://redmine.example.com --api-key <key>
```

Cả hai cách đều kiểm tra thông tin trước khi ghi bất cứ thứ gì.

Nếu bỏ qua bước setup, server vẫn khởi động bình thường và mọi tool sẽ trả về đúng
hướng dẫn này — không có chuyện hỏng âm thầm.

Server tìm thông tin đăng nhập theo thứ tự:

1. biến môi trường `REDMINE_URL` và `REDMINE_API_KEY`
2. file JSON tại `REDMINE_CONFIG_PATH`, nếu file đó tồn tại — đây là cách các
   manifest plugin trỏ vào thư mục dữ liệu riêng của chúng
3. `~/.config/redmine-mcp/config.json` (hoặc `$XDG_CONFIG_HOME/redmine-mcp/config.json`)

Việc bước 2 rơi xuống bước 3 khi file chưa tồn tại chính là thứ giúp `--init` dùng
được cho cả bản cài plugin: client trỏ `REDMINE_CONFIG_PATH` vào thư mục dữ liệu của
nó, chưa có gì ghi vào đó, nên file do `--init` tạo được dùng thay.

Tóm lại `--init` lo cho bản cài thủ công, còn `REDMINE_CONFIG_PATH` vẫn để dành cho
client có thư mục dữ liệu riêng từng plugin. Claude Code trỏ biến đó vào
`~/.claude/plugins/data/redmine/config.json`, đồng thời truyền thẳng hai biến môi
trường lấy từ thông tin đã hỏi lúc cài; Codex không có placeholder tương tự nên kế
thừa hai biến môi trường từ shell của bạn qua allowlist `env_vars` trong `.mcp.json`.
Chỉ cần một trong các đường đó hoạt động là đủ.

---

## Chế độ 1 — Claude Desktop (Stdio)

### Cài đặt

Không cần bước cài nào — `npx` sẽ tải package đã publish ngay lần chạy đầu. Nếu
muốn chạy từ source:

```bash
git clone https://github.com/leethais91/redmine-mcp-server.git
cd redmine-mcp-server
npm install
npm run build
```

### Cấu hình

Thêm vào `claude_desktop_config.json`:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "redmine": {
      "command": "npx",
      "args": ["-y", "@leethais91/redmine-mcp-server@latest"],
      "env": {
        "REDMINE_URL": "https://redmine.example.com",
        "REDMINE_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

Nếu chạy từ source, trỏ vào file build ra:

```json
{
  "mcpServers": {
    "redmine": {
      "command": "node",
      "args": ["/đường-dẫn-tuyệt-đối/redmine-mcp-server/dist/index.js"],
      "env": {
        "REDMINE_URL": "https://redmine.example.com",
        "REDMINE_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

Khởi động lại Claude Desktop. MCP server sẽ xuất hiện trong danh sách tools.

---

## Chế độ 2 — Cloudflare Workers (Remote HTTP)

Dùng cho **Claude Code**, **claude.ai**, **OpenClaw** — không cần chạy gì trên máy local.

### Bước 1 — Cài dependencies

```bash
npm install
```

### Bước 2 — Login Cloudflare

```bash
npx wrangler login
```

Trình duyệt sẽ mở để xác thực.

### Bước 3 — Set secrets

```bash
npx wrangler secret put REDMINE_URL
# Nhập: https://redmine.example.com

npx wrangler secret put REDMINE_API_KEY
# Nhập: your-api-key

npx wrangler secret put MCP_AUTH_TOKEN
# Nhập: một chuỗi bất kỳ để bảo vệ endpoint (ví dụ: my-secret-token-123)
```

> Tạo token random mạnh bằng lệnh:
> ```bash
> openssl rand -base64 32
> ```
> Copy output và paste khi `wrangler secret put MCP_AUTH_TOKEN` hỏi. Lưu lại token vì sẽ cần dùng để cấu hình client.

> `MCP_AUTH_TOKEN` là **bắt buộc**. Nếu không set, mọi request sẽ trả về `500 Server misconfigured`. Endpoint không hỗ trợ chế độ public — MCP server này được thiết kế cho cá nhân.

### Bước 4 — Deploy

```bash
npm run worker:deploy
```

Sau khi deploy xong, bạn sẽ thấy URL dạng:
```
https://redmine-mcp-server.<subdomain>.workers.dev
```

### Bước 5 — Cấu hình client

**Claude Code** — chạy lệnh:

```bash
# Thêm cho project hiện tại (local scope)
claude mcp add cc-redmine --transport http https://redmine-mcp-server.<subdomain>.workers.dev/mcp --header "Authorization: Bearer your-mcp-auth-token"

# Hoặc thêm global (dùng được ở mọi project)
claude mcp add cc-redmine --transport http https://redmine-mcp-server.<subdomain>.workers.dev/mcp --header "Authorization: Bearer your-mcp-auth-token" --scope user
```

**Claude.ai** — vào **Settings → Integrations → Add custom integration**:
- URL: `https://redmine-mcp-server.<subdomain>.workers.dev/mcp`
- Header: `Authorization: Bearer your-mcp-auth-token`

**OpenClaw** — thêm MCP server với URL và header tương tự.

### Test sau khi deploy

```bash
# Health check
curl https://redmine-mcp-server.<subdomain>.workers.dev/health \
  -H "Authorization: Bearer your-mcp-auth-token"

# List tools
curl https://redmine-mcp-server.<subdomain>.workers.dev/mcp \
  -H "Authorization: Bearer your-mcp-auth-token" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

---

## Development

```bash
# Chạy local stdio (dev mode)
npm run dev

# Chạy Workers local (cần set env vars trong .dev.vars)
npm run worker:dev

# Build TypeScript
npm run build
```

**File `.dev.vars`** (dùng cho `worker:dev`, không commit):
```
REDMINE_URL=https://redmine.example.com
REDMINE_API_KEY=your-api-key
MCP_AUTH_TOKEN=dev-token
```

---

## Ví dụ sử dụng

Sau khi cấu hình xong, bạn có thể nói với Claude:

- "Liệt kê tất cả issue đang mở của project X"
- "Tạo bug mới: lỗi đăng nhập trên mobile"
- "Cập nhật issue #123 thành đã hoàn thành"
- "Log 2 giờ cho issue #456 hôm nay"
- "Ai đang được assign nhiều issue nhất?"

---

> 🇬🇧 English version: [README.md](./README.md)
