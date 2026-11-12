# 如何把收集界面接到运营 Agent MCP

这套页面仍然只负责收集。浏览器不能直接调用 MCP，也没有虚构的「MCP HTTP 接口」。本地服务负责保存收集结果；运营 Agent（或你自己的宿主服务）读取这些结果，再调用已连接的运营 MCP 工具。

这里说的是运营 Agent 工具，例如 `list_accounts`、`submit_account`、`confirm_positioning`、`request_content`、`review_work`、`report_publication`。不要把房源视频 MCP 的 `project`、`materials`、`production`、`edit`、`workflow_state` 混进来。

## 怎么运行

需要 Node.js 18 或更高版本。

```bash
npm start
```

浏览器打开 [http://127.0.0.1:8787](http://127.0.0.1:8787)。用这个地址打开页面时，「完成收集」会把结构化 JSON 存到仓库里的 `data/` 目录（已加入 `.gitignore`），同时仍会自动复制纯文本，方便粘贴回对话。

也可以继续用 `file://` 直接打开 HTML。这时不会写入本地服务，复制到剪贴板的行为与原来一样。

查看已保存记录：

- `GET /api/collections`
- `GET /api/collections/<id>`

助手不会主动探测表单。只有用户点「完成收集」（页面自己 POST），或把复制结果贴回对话后，才进入后续流程。

不需要也不要在仓库里放置 API Key、平台密码或其他密钥。开号页不收集登录密码；对外姓名、电话等信息只用于展示。

## 数据怎么变成 MCP 参数

```bash
npm test      # 解析和参数映射测试，不需要凭证
npm run dry-run
```

`dry-run` 会读取 `examples/fixtures/` 里的示例收集结果，打印 9 步流程里应当发出的工具名和参数。它不会连接真实 MCP，也不会假装发布成功。

核心代码：

| 文件 | 作用 |
| --- | --- |
| `lib/parse.js` | 解析粘贴的中文纯文本，或页面提交的 JSON |
| `lib/mcp-payloads.js` | 把收集记录转成真实工具参数，并提供 `createHost(callTool)` |
| `lib/flow.js` | 按 README 中的 9 步，生成下一步应调用的工具 |
| `server.js` | 托管页面，并把收集结果存成 JSON 文件 |
| `ops-collect-client.js` | 页面在同源服务下 POST 结果；`file://` 时静默跳过 |

宿主只要实现 `callTool(name, args)`，例如在已连接 `topmoon` / `topmoon-lab2` 的环境里转发到对应 MCP 工具：

```js
import { parseCollection } from "./lib/parse.js";
import { createHost } from "./lib/mcp-payloads.js";
import { planStep1Onboarding } from "./lib/flow.js";

const host = createHost((name, args) => mcp.call(name, args));
const intake = parseCollection(pastedText); // 或读取 /api/collections 返回的 JSON
await host.submitAccount(intake);
```

## 和 9 步流程的对应关系

1. **开号接入**：解析开号结果 → `list_accounts` → 只提交已核实字段到 `submit_account` 或 `edit_submission` → `get_diagnosis`。服务地区未填时不要写入 `intake.region`。「全球不限」只表示传播范围，不是业务服务区域。对外展示资料保存在用户资料库里，不要当成登录名或密码。
2. **定位方案**：`get_positioning`，在对话里整理成可审阅方案。只有用户明确回复后，才调用 `confirm_positioning`，且必须带上 `customer_words`。信息不足标「待验证」。默认 `autonomy` 为 `confirm_each`。
3. **选题与开始制作**：用户已经指定的内容优先，用材料收集结果调用 `request_content`（`intent=produce`）。需要建议时再 `request_content`（`intent=recommend`）或 `get_recommendations`，并由用户 `decide_recommendations`。
4. **脚本、日历和材料**：`get_script`、`get_content_calendar`。若还缺展示材料，回到对应收集页。上传了文件时，原文件要随收集结果一起提供；JSON 里只保存文件名和类型。
5. **制作与交付**：用 `get_work` 查看状态。交付在对话里完成。诊断或脚本受阻时可 `expert_help`。
6. **验收与修改**：`review_work`（`approve` 或 `revise`）。确认交付后进入「已交付待发布」，不会自动公开。
7. **发布前确认**：发布方式仍要用户点头。只有作品已在对应渠道公开、并有真实链接时，才调用 `report_publication`。交付不等于发布。
8. **发布后跟进**：更新日历，并按需 `upload_metrics`。询问是否开始下一条。
9. **异常与停运**：验证码、2FA、身份验证或封号申诉只能用户本人在对应平台完成。删除账号必须用户明确同意，并同时提供 `account_id` 与 `confirm_handle`。

材料映射备忘：

- 房源展示 → `request_content`，常用 `source_url` 为房源链接
- 成交故事 → `request_content`，默认形式为「轮播」
- 个人或团队介绍 → `request_content`，默认形式为「图文」

形式字段可以按用户在对话里的选择覆盖。不要发明一次成功的发布。
