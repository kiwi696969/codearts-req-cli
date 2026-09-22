#!/usr/bin/env node
// codearts-req-cli — 把华为云 CodeArts 需求管理封装成命令行工具
//
// 好 CLI 的关键要素：
//   - 子命令：issue create / issue list
//   - 参数与标志：--project-id / --subject / --type / --json
//   - --help：每条命令都有用法说明
//   - 退出码：0=成功 / 1=运行错误 / 2=参数错误
//   - 结构化输出：默认 JSON（--json 显式声明，方便脚本与智能体消费）
//
// 环境变量：
//   CODEARTS_REQ_ENDPOINT   API 终端节点，如 https://projectman-ext.cn-north-4.myhuaweicloud.com
//   CODEARTS_REQ_AK / CODEARTS_REQ_SK   华为云 AK/SK
//   CODEARTS_REQ_REGION     默认 cn-north-4
//
// 用法示例：
//   codearts-req-cli --help
//   codearts-req-cli issue create --help
//   codearts-req-cli issue create --project-id=xx --subject="优化登录" --type=task --json
//   codearts-req-cli issue list --project-id=xx
import { signRequest, iso8601Basic } from "../lib/hwsign.mjs";

const { CODEARTS_REQ_ENDPOINT = "", CODEARTS_REQ_AK = "", CODEARTS_REQ_SK = "", CODEARTS_REQ_REGION = "cn-north-4", CODEARTS_REQ_SECURITY_TOKEN = "" } = process.env;
const SERVICE = "projectman";
const ISSUE_TYPES = ["task", "story", "bug", "epic", "feature"];

// ---------- 输出与退出码 ----------
function fail(msg, code = 1, extra = {}) {
  process.stdout.write(JSON.stringify({ ok: false, error: msg, ...extra }, null, process.env.JSON_PRETTY ? 2 : 0));
  process.exit(code);
}
function ok(data) {
  process.stdout.write(JSON.stringify({ ok: true, ...data }));
  process.exit(0);
}

function checkConfig() {
  if (!CODEARTS_REQ_AK || !CODEARTS_REQ_SK) return "缺少 CODEARTS_REQ_AK / CODEARTS_REQ_SK（华为云访问密钥）";
  if (!CODEARTS_REQ_ENDPOINT) return "缺少 CODEARTS_REQ_ENDPOINT（CodeArts Req 终端节点）";
  return null;
}

async function callApi(method, uri, query, payload) {
  const missing = checkConfig();
  if (missing) return { configError: missing };
  const date = iso8601Basic();
  const headers = {
    "X-Sdk-Date": date,
    "Content-Type": "application/json",
    ...(CODEARTS_REQ_SECURITY_TOKEN ? { "X-Security-Token": CODEARTS_REQ_SECURITY_TOKEN } : {}),
    Host: new URL(CODEARTS_REQ_ENDPOINT).host,
  };
  // 该 API 网关会将路径规范化为末尾带斜杠再验签，签名与请求保持一致
  const canonUri = uri.endsWith("/") ? uri : `${uri}/`;
  headers.Authorization = signRequest({
    ak: CODEARTS_REQ_AK, sk: CODEARTS_REQ_SK,
    method, uri: canonUri, query, headers, payload: payload || "", region: CODEARTS_REQ_REGION, service: SERVICE,
  });
  const resp = await fetch(`${CODEARTS_REQ_ENDPOINT}${canonUri}${query ? `?${query}` : ""}`, {
    method, headers, body: payload || undefined, signal: AbortSignal.timeout(15000),
  });
  const body = await resp.text();
  let json = {}; try { json = JSON.parse(body); } catch { json = { raw: body }; }
  return { status: resp.status, json };
}

// ---------- 参数解析 ----------
function parseArgs(argv) {
  const args = { positionals: [], flags: {} };
  for (const a of argv) {
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq > 0) args.flags[a.slice(2, eq)] = a.slice(eq + 1);
      else args.flags[a.slice(2)] = true;
    } else args.positionals.push(a);
  }
  return args;
}

const HELP_MAIN = `codearts-req-cli — 华为云 CodeArts 需求管理命令行工具

用法:
  codearts-req-cli <子命令> [参数...]

子命令:
  issue create  创建工作项（POST /v4/projects/{project_id}/issue）
  issue list    查询项目工作项列表（GET /v4/projects/{project_id}/issues）
  --help        显示本帮助

全局标志:
  --json        以 JSON 输出结构化结果（可直接被脚本/智能体消费）

环境变量:
  CODEARTS_REQ_ENDPOINT  需求管理终端节点
  CODEARTS_REQ_AK        华为云 Access Key Id
  CODEARTS_REQ_SK        华为云 Secret Access Key
  CODEARTS_REQ_REGION    区域（默认 cn-north-4）

示例:
  codearts-req-cli issue create --help
  codearts-req-cli issue create --project-id=xx --subject="优化登录" --type=task --json
  codearts-req-cli issue list --project-id=xx`;

const HELP_CREATE = `用法: codearts-req-cli issue create [选项]

创建工作项（CreateIssueV4, POST /v4/projects/{project_id}/issue）

必填:
  --project-id <id>     项目 ID
  --subject <string>    工作项标题（1-255 字符）
  --type <type>         工作项类型：${ISSUE_TYPES.join(" / ")}（默认 task）

选填:
  --description <text>  描述
  --priority <high|middle|low>  优先级
  --json                输出 JSON

退出码: 0 成功 / 1 运行错误 / 2 参数错误`;

const HELP_LIST = `用法: codearts-req-cli issue list [选项]

查询项目工作项列表

必填:
  --project-id <id>     项目 ID

选填:
  --limit <n>           每页数量（默认 50）
  --offset <n>          偏移量（默认 0）
  --json                输出 JSON

退出码: 0 成功 / 1 运行错误 / 2 参数错误`;

async function cmdIssueCreate(flags) {
  const { "project-id": projectId, subject, type = "task", description = "", priority = "", json } = flags;
  if (!projectId || !subject) {
    process.stderr.write("参数错误：--project-id 与 --subject 必填\n" + HELP_CREATE + "\n");
    process.exit(2);
  }
  if (!ISSUE_TYPES.includes(type)) {
    process.stderr.write(`参数错误：--type 必须是 ${ISSUE_TYPES.join("/")}\n`);
    process.exit(2);
  }
  const body = { subject, type, description, ...(priority ? { priority } : {}) };
  const r = await callApi("POST", `/v4/projects/${projectId}/issue`, "", JSON.stringify(body));
  if (r.configError) return fail(r.configError, 1, { error_code: "MISSING_CONFIG" });
  if (r.status >= 400) {
    return fail(r.json?.error_msg || r.json?.message || "请求失败", 1,
      { error_code: r.json?.error_code || "API_ERROR", http_status: r.status });
  }
  ok({ action: "issue_create", data: r.json });
}

async function cmdIssueList(flags) {
  const { "project-id": projectId, limit = 50, offset = 0, json } = flags;
  if (!projectId) {
    process.stderr.write("参数错误：--project-id 必填\n" + HELP_LIST + "\n");
    process.exit(2);
  }
  const qs = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  const r = await callApi("GET", `/v4/projects/${projectId}/issues`, qs.toString(), "");
  if (r.configError) return fail(r.configError, 1, { error_code: "MISSING_CONFIG" });
  if (r.status >= 400) {
    return fail(r.json?.error_msg || r.json?.message || "请求失败", 1,
      { error_code: r.json?.error_code || "API_ERROR", http_status: r.status });
  }
  ok({ action: "issue_list", data: r.json });
}

async function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);
  if (args.flags.help || args.positionals.length === 0) {
    process.stdout.write(HELP_MAIN + "\n");
    process.exit(0);
  }
  const [sub, verb] = args.positionals;
  if (sub === "issue" && verb === "create") return cmdIssueCreate(args.flags);
  if (sub === "issue" && verb === "list") return cmdIssueList(args.flags);
  process.stderr.write(`未知子命令：${sub} ${verb || ""}\n\n${HELP_MAIN}\n`);
  process.exit(2);
}

main().catch((e) => fail(`未捕获异常: ${e.message}`));