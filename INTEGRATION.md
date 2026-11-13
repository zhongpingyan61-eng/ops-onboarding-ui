# 如何把收集界面接到运营 Agent MCP

这套页面仍然只负责收集和预览。浏览器不能直接调用 MCP，也没有虚构的「MCP HTTP 接口」。本地服务负责保存收集结果；运营 Agent（或你自己的宿主服务）读取这些结果，再调用已连接的运营 MCP 工具。

这里说的是运营 Agent 工具，例如 `list_accounts`、`submit_account`、`confirm_positioning`、`request_content`、`review_work`、`report_publication`。不要把房源视频 MCP 的 `project`、`materials`、`production`、`edit`、`workflow_state` 混进来。真实接口和自动交接仍需逐项落地验证。

## 怎么运行

需要 Node.js 18 或更高版本。

```bash
npm start
```

浏览器打开 [http://127.0.0.1:8787](http://127.0.0.1:8787)。用这个地址打开页面时，提交会把去掉密钥的结构化 JSON 存到仓库里的 `data/` 目录。如果填写了密码，服务会把它单独写到 `data/secrets/<id>.json`，文件权限为 `0600`。`data/` 和 `data/secrets/` 都已加入 `.gitignore`。

提交后请直接回到原来的对话。我会自行读取已保存的资料，不必把结果粘贴回来，也不要把密码发在对话里。

也可以继续用 `file://` 直接打开 HTML。这时不会写入本地服务。普通档案可以记在本机，但密码不会写入 `localStorage`；页面会说明这次密码没有保存，因为本地收集服务没有运行。

查看已保存的公开记录：

- `GET /api/collections`
- `GET /api/collections/<id>`

这两个接口都不会返回原始密码。公开记录在单独保存了密码时，可以带 `passwordStored: true`。

如需由本机上的 Agent 读取某条收集记录对应的密码，可使用：

- `GET /api/secrets/<id>`

该接口只应在本机使用，不会出现在收集列表里。不要把密钥写入日志或聊天。

不需要也不要在仓库里放置 API Key、平台密码或其他密钥。

## 数据怎么变成 MCP 参数

```bash
npm test      # 解析、密钥隔离和参数映射测试，不需要凭证
npm run dry-run
```

`dry-run` 会读取 `examples/fixtures/` 里的示例收集结果，并按当前目标流程打印应当发出的工具名和参数。它不会连接真实 MCP，也不会假装发布成功。密码不会出现在 dry-run 输出里。

核心代码：

| 文件 | 作用 |
| --- | --- |
| `lib/parse.js` | 解析中文纯文本，或页面提交的 JSON；解析时会去掉密码字段 |
| `lib/sanitize.js` | 从公开档案和明文中剥离密钥 |
| `lib/store.js` | 把公开记录写到 `data/`，把密码写到 `data/secrets/` |
| `lib/mcp-payloads.js` | 把收集记录转成真实工具参数，并提供 `createHost(callTool)`；`submit_account` 不会包含密码 |
| `lib/flow.js` | 按 README 中的目标流程，生成下一步应调用的工具或应跳过的步骤 |
| `lib/calendar.js` | 根据已确认主题和更新节奏自动排期 |
| `server.js` | 托管页面，保存公开 JSON，并单独保存密码 |
| `ops-collect-client.js` | 页面在同源服务下 POST 结果；密码不会写入 localStorage；`file://` 时明确返回未保存密码 |

宿主只要实现 `callTool(name, args)`，例如在已连接 `topmoon` / `topmoon-lab2` 的环境里转发到对应 MCP 工具：

```js
import { parseCollection } from "./lib/parse.js";
import { createHost } from "./lib/mcp-payloads.js";
import { planIntakeHandoff } from "./lib/flow.js";

const host = createHost((name, args) => mcp.call(name, args));
const intake = parseCollection(savedJson); // 读取 /api/collections 返回的 JSON，其中不含密码
await host.submitAccount(intake);
```

支持的收集类型：`intake`、`topics`、`calendar`、`production_plan`、`film_review`，以及以往的 `listing_materials`、`deal_story`、`bio`。

## 和目标流程的对应关系

1. **接入 MCP**：在对话中完成授权，复用已有工作空间。没有新的授权界面，也不要发明授权 HTTP 接口。
2. **前置信息收集**：读取开号结果 → `list_accounts` → 只提交已核实且非密钥的字段到 `submit_account` 或 `edit_submission` → `get_diagnosis`。服务地区未填时不要写入 `intake.region`。「全球不限」只表示传播范围，不是业务服务区域。平台名称不限于 Instagram / TikTok，自行补充的平台也应保留。密码不得进入这些参数。
3. **提出长期运营方案**：`get_positioning`，在对话里整理成可审阅方案。先给一版，不让用户从空白开始写。事实、建议和待验证判断分开表达。
4. **修改并确认长期方案**：只有用户明确回复后，才调用 `confirm_positioning`，且必须带上 `customer_words`。确认后保存正式版本，再进入前 5 期主题。
5. **前 5 期主题**：用户自己的选题优先。未确认的主题不能直接开做。确认后如需委托制作，再用 `request_content`（`intent=produce`）。需要建议时再 `request_content`（`intent=recommend`）或 `get_recommendations`。
6. **内容日历**：本地按已确认主题、顺序和更新节奏自动排布。`get_content_calendar` 若被调用，只能作为参考；与外部平台日历的实时同步尚未验证。
7. **补齐本期必要信息**：只在对话里进行，不使用表单。个人信息展示偏好在这里询问，不在开号页强制收集。
8. **本期制作方案**：必须在预览界面确认后再开始制作。不展示个人信息只省去信息补充，不跳过确认。
9. **制作与内部质检**：用 `get_work` 查看状态。内部检查不全部转交客户。
10. **成片审核与交付**：`review_work`（`approve` 或 `revise`）。成片确认与发布授权分开。只有作品已在对应渠道公开、并有真实链接时，才调用 `report_publication`。交付不等于发布，不要发明一次成功的发布。
11. **复盘并推进下一轮**：按需 `upload_metrics` 并更新日历。长期方案仍有效时不从头重做。

以往的材料映射仍可使用，但这些页面已不在主流程里：

- 房源展示 → `request_content`，常用 `source_url` 为房源链接
- 成交故事 → `request_content`，默认形式为「轮播」
- 个人或团队介绍 → `request_content`，默认形式为「图文」

形式字段可以按用户在对话里的选择覆盖。
