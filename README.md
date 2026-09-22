# CLI · 如何将华为云服务封装成 CLI

ICT 大赛云赛道赛题 1.11：把华为云 CodeArts 需求管理「创建工作项 / 查询工作项」API（AK/SK 签名鉴权）封装成能被脚本与智能体稳定驱动的命令行工具。

## 作品内容

```
codearts-req-cli/
├── bin/codearts-req-cli.mjs   # CLI 主程序（子命令/--help/退出码/结构化输出）
├── lib/hwsign.mjs             # 华为云 AK/SK 签名（SDK-HMAC-SHA256）
└── package.json               # npm bin 声明
```

## 万物皆命令行（everything is a CLI）

CLI 是人、脚本、智能体三者之间的共同语言，一条设计良好的命令放大了六种能力：**可组合、可自动化、可复现、可共享、可编排、可被智能体驱动**。Skill 里跑的是脚本、MCP Server 内部包装的是 CLI、定时任务里调度的是命令——CLI 是整个 Agent 生态的底座。

## 好 CLI 的关键要素（本作品实现）

| 要素 | 实现 |
|------|------|
| 清晰的入口与子命令 | `codearts-req-cli issue create` / `issue list` |
| 完整的 --help | 主命令与每个子命令均提供用法说明 |
| 参数与标志 | `--project-id`、`--subject`、`--type`、`--json` 等 |
| 退出码 | 0 成功 / 1 运行错误 / 2 参数错误 |
| 结构化输出 | 默认 JSON（`{"ok":true,...}`），可直接被脚本/智能体消费 |

## 使用

```bash
export CODEARTS_REQ_ENDPOINT="https://projectman-ext.cn-north-4.myhuaweicloud.com"
export CODEARTS_REQ_AK="你的AK"
export CODEARTS_REQ_SK="你的SK"

node bin/codearts-req-cli.mjs --help
node bin/codearts-req-cli.mjs issue create --project-id=xx --subject="优化登录" --type=task --json
node bin/codearts-req-cli.mjs issue list --project-id=xx --json
```

## 测试记录（实测）

| 用例 | 操作 | 结果 |
|------|------|------|
| --help | `node bin/codearts-req-cli.mjs --help` | 完整帮助，exit 0 |
| 参数错误 | `issue create`（缺必填） | 中文报错 + 用法提示，exit **2** |
| 缺配置 | 清空 AK/SK | `{"ok":false,"error_code":"MISSING_CONFIG"}`，exit **1** |
| 真实签名调用 | 配置 STS 凭证调 `issue list --project-id=p1` | 签名通过，返回结构化 404（`APIGW.0101`，API 未发布/项目不存在）——证明 AK/SK 签名链路正确 |

> 注：工作项创建/查询依赖账号开通 CodeArts 需求管理服务并获得有效 project_id；未开通时 CLI 以结构化错误返回，便于脚本/智能体处理。
