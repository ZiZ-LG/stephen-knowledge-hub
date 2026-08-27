# Stephen 审核后发布闭环运行手册

> 任务：`SAAS-608`
> 边界：本流程只把人工批准内容合入公开仓库并生成 GitHub 原生不可变 Release；不连接网站服务器，不执行流量切换。

## 1. 闭环结果

一次成功运行会留下六项互相校验的证据：

1. 仍处于 Draft 状态、只包含当日 manifest 与 ledger 的候选 PR；
2. 项目所有者输入的完整 40 位候选 SHA 和确认句；
3. 以候选 SHA 为父提交的“候选转正式内容”提交；
4. 以转正式提交为父提交的“人工批准封印”提交；
5. 原批准运行的私有 handoff artifact、受信任步骤成功顺序，以及使用封印 SHA 作为并发保护条件的 merge commit；
6. 指向封印 SHA、包含校验元数据与静态站点压缩包的不可变 GitHub Release。

AI 和每日候选工作流只能生成 `pending_owner_review / not_published` 候选，不能生成上述第 2–6 项结果。

## 2. 启用前置条件

在首次真实使用前，必须依次满足：

- 公开仓库 bootstrap PR 已经单独批准并合入 `main`；
- SAAS-608 工作流 PR 已经单独批准并合入 `main`；
- 合并后的 `main` 精确 SHA CI 全绿；
- 仓库原生 Immutable Releases 设置已由项目所有者单独启用，并经 API 复核为 `enabled: true`；
- 仓库存在启用中的 `Protect Stephen immutable Release tags` tag ruleset，include 仅匹配 `refs/tags/stephen-content-*`、exclude 必须为空、无 bypass actor，并禁止 update 与 deletion；
- 仓库只有 `ZiZ-LG` 一个具备 push 权限的 collaborator；每日候选与人工批准共用 `stephen-public-content-writer` 并发组，Release 使用按审批 run ID 与 attempt 区分的独立并发组，避免待运行交接被后续每日任务或另一审批 attempt 替换；静态审计禁止候选/批准工作流调用 tag 或 Release 接口；
- 仓库 Secret `STEPHEN_RELEASE_GOVERNANCE_TOKEN` 已存在。其值必须是 fine-grained token，resource owner 为 `ZiZ-LG`，repository access 仅选择 `ZiZ-LG/stephen-knowledge-hub`，Repository permissions 仅授予 `Administration: read`；不得增加 contents、actions、pull requests 或任何 write 权限；
- 公共审计必须继续以解析后的 YAML 结构把该 Secret 仅绑定到两个指定治理读取步骤的 `env.GH_TOKEN`，并锁定顶层/job 执行结构、步骤顺序和这两个步骤的只读命令体；两个步骤必须使用绝对路径的无 profile Bash、固定系统 PATH，并清空 Bash 启动加载变量。不得使用 workflow/job defaults、job env、container、services、意外步骤、anchor/alias 转移、`secrets: inherit`、外传命令或非 GET API 调用；
- 原批准工作流的 handoff artifact 必须按工作流固定的 `retention-days: 90` 保留且尚未过期；恢复窗口以该 90 天保留期为上限，过期后不得伪造或手工替代证据；
- 当日候选由默认分支上的 live 工作流形成，分支名为 `codex/stephen-daily-YYYY-MM-DD`；
- 候选 PR 仍为 open Draft，且相对 `main` 只增加或修改当日 `review-manifest.json` 与 `discovery-ledger.json`。

缺少任一项时停止，不用功能分支、fixture PR 或手工 Release 绕过。

治理 token 只在 Release 工作流的两项只读治理步骤中注入，用于读取 Immutable Releases、collaborator 与 ruleset 事实；exact-seal 构建、artifact 下载、PR 读取、Draft/asset/tag/Release 操作均看不到该 token。创建 token 后通过 GitHub 仓库 Settings → Secrets and variables → Actions 保存为上述名称；命令行只核对 Secret 名称，不读取或输出其值：

```bash
gh secret list --repo ZiZ-LG/stephen-knowledge-hub
```

## 3. 项目所有者如何终审候选

### 3.1 删除不合格对象

在 Draft PR 分支中：

- 删除 `candidates` 中不采用的完整对象；
- 处理后删除 `manualReviewRecords` 中的完整对象；批准前该数组必须为空；
- 不删除 discovery ledger 中的发现 ID，避免同日任务把已拒绝内容重新加入。

### 3.2 补齐 `publicationDraft`

每个保留候选都必须由人核对并补齐 `publicationDraft`。最小结构如下；内容只是字段示例，不是可直接采用的事实：

```json
{
  "publicationDraft": {
    "slug": "customer-specific-kebab-case-slug",
    "kind": "update",
    "domains": ["ai_technology", "enterprise_sales"],
    "topicSlugs": ["agent-business-model"],
    "tags": ["推理速度", "服务等级"],
    "toolIds": ["poc-success-canvas"],
    "audience": ["transitioning_seller", "ai_ae"],
    "freshness": "current",
    "conclusionScope": "cross_organization",
    "primaryEvidenceLevel": "official",
    "primaryEvidenceLanguage": "en",
    "primaryEvidenceDateBasis": "published",
    "additionalEvidence": [
      {
        "sourceId": "anthropic-news",
        "title": "Second independent source title",
        "publisher": "Anthropic",
        "url": "https://www.anthropic.com/news/example",
        "publishedAt": "2026-08-26T09:00:00.000Z",
        "level": "official",
        "language": "en",
        "dateBasis": "published"
      }
    ],
    "supportingFacts": [
      { "statement": "第一项可核验事实。", "evidenceIndexes": [1] },
      { "statement": "第二项独立事实。", "evidenceIndexes": [2] }
    ],
    "deeperAnalysis": {
      "mechanism": "为什么会发生。",
      "businessValue": "为什么会为业务带来价值。",
      "boundary": "结论在哪些条件下不成立。"
    },
    "changeWindow": "within_30_days",
    "factType": "editorial_inference",
    "verificationNotes": "人工核验的来源、口径、日期和限制条件。"
  }
}
```

`evidenceIndexes` 从 1 开始：1 是候选自带原文，2 以后按 `additionalEvidence` 顺序编号。每条结论至少需要两个不同事实；`cross_organization` 还必须实际引用至少两个不同登记信源。专业名词 Agent 保留英文。

提交修改后，等待候选 PR 自身 CI 全绿，再从 GitHub PR 的 Commits 页复制当前完整 SHA。不要复制短 SHA，也不要在复制后继续修改分支。

## 4. 发起精确 SHA 人工批准

只有 `ZiZ-LG` 仓库所有者本人可以从 `main` 运行 `approve-reviewed-content.yml`，输入：

- `pr_number`：当日 open Draft PR 编号；
- `candidate_sha`：当前 PR head 的完整 40 位小写 SHA；
- `confirmation`：精确填写 `APPROVE <candidate_sha>`。

GitHub CLI 示例：

```bash
candidate_sha="<40-character-current-head-sha>"
gh workflow run approve-reviewed-content.yml \
  --ref main \
  -f pr_number="<draft-pr-number>" \
  -f candidate_sha="$candidate_sha" \
  -f confirmation="APPROVE $candidate_sha"
```

工作流会从本次 dispatch 的精确 `github.sha` 检出受信任控制代码，并重新读取 PR API，而不是信任输入描述。actor、triggering actor、仓库、base、head 仓库、分支日期、Draft 状态、精确 head/base SHA、两条文件路径、文件状态、空 `manualReviewRecords` 和所有 `publicationDraft` 必须同时匹配。该控制 SHA 必须等于 PR 当前 base SHA，而且 base SHA 必须是候选 SHA 与最终封印 SHA 的祖先；落后于当前 `main` 的候选必须先更新并重新审核。

## 5. 两次提交与 CI 合并

通过身份门后，受信任的默认分支脚本在候选树上创建且只创建两次提交：

```text
候选 SHA
└── promotion commit
    └── approval seal commit
```

promotion commit：

- 删除已审核 manifest 与 ledger；
- 为每个保留候选写入一个 `src/content/published/<ITEM-ID>.json`；
- 将每个获批条目的安全 slug 写入 `public/sitemap.xml`，该 sitemap 变更与正式内容一起进入 promotion commit；
- 写入包含候选 SHA、输入文件 SHA-256、批准人、时间、PR 和来源风险溯源的 `promotion.json`。

approval seal commit：

- 记录 promotion SHA、候选 SHA、批准人、输入摘要、条目 ID 和固定 Release 标签规则；
- 不记录凭据、主机或外部发布目标；
- 完整 Release 标签只能在封印提交 SHA 产生后计算，格式为 `stephen-content-YYYY-MM-DD-<seal-sha-12>`。

工作流以普通 fast-forward push 写回当日分支；若分支已漂移，push 失败，不 force-push。随后在封印树上执行 `npm ci`、`npm run check` 和精确 SHA 静态产物校验，再验证封印链、构建并持久化私有 handoff artifact。全部成功后才把 PR 转为 ready，并调用 GitHub merge API：

- merge 方法固定为 merge commit；
- API `sha` 参数固定为封印 SHA；
- 合并前再次读取 PR，要求 head、base、Draft 状态、同仓库身份及默认分支当前 SHA 均未漂移；
- PR head 发生任何变化都会让合并失败。

## 6. 不可变 GitHub Release

批准工作流在合并前写入 GitHub Actions 私有 handoff artifact。审批运行成功完成时，独立 Release 工作流由 `workflow_run` 自动唤起；若 Release 工作流自身失败，仓库所有者可以从修复后的默认分支用原 approval run ID 与 attempt 进入同一恢复路径。Release 工作流重新验证：

- PR 已合并，merge SHA 与事件一致；
- PR head 是封印 SHA；
- 发起批准的 workflow run ID/attempt、仓库、workflow 路径、默认分支、actor、triggering actor、control SHA、完成状态和成功结论完全一致；
- 原 run 中只有一个未过期的精确命名 handoff artifact，artifact digest 与 workflow run identity 有效；
- 原 `approve` job 中“完整 exact-seal CI → 封印链验证 → 构建 handoff → 持久化 handoff → exact-seal merge”五个步骤均成功且顺序严格递增；旧的自建 `stephen-reviewed-release` check 不再作为证据，也不再创建；
- Release 工作流从本次 workflow 所在的受信任默认分支 SHA 执行修复后的策略代码，并在无治理 token 的构建步骤中重新运行 `npm ci`、`npm run check` 与静态产物 exact-SHA 校验；原 approval `controlSha` 只用于绑定原 handoff；
- merge SHA 仍可从当前远端默认分支 head 到达；默认分支可以在之后正常向前演进；
- 两个父提交、批准记录、仓库身份和标签全部一致；
- Immutable Releases 设置仍为开启；
- push collaborator 仍只有仓库所有者，标签规则集仍启用、exclude 为空、无 bypass 且禁止 update/deletion；
- 已有 tag、Draft Release 和已上传资产没有发生身份或 digest 漂移。
- 两次 tag 探测都只能把 GitHub REST 的明确 `404` 解释为“不存在”；`403`、`5xx`、超时、DNS 或其他传输错误全部失败关闭，不得继续发布。

Release 严格按以下顺序形成：

1. 用治理 token 只读确认 Immutable Releases、单写入者与无 bypass 标签规则；
2. 从封印 SHA 重新构建并生成 `.stephen-release.json`，记录本次 exact-seal rebuild 成功事实；
3. 生成确定性 `stephen-site-<seal-sha-12>.tar.gz`；
4. 用原 approval run、artifact、job steps、合并链、治理事实和 rebuild 事实执行首次完整策略校验；
5. 创建或复用目标为封印 SHA、但尚不创建 tag 的 Draft Release，并只补上传 digest 匹配的缺少资产；
6. 紧邻发布动作再次用治理 token 只读刷新 Immutable Releases、单写入者和标签规则，再用普通 `GITHUB_TOKEN` 复核 tag 不存在、当前远端 `main` 可达、Draft Release 和全部资产；
7. 治理 token 离开作用域后，仅用 `GITHUB_TOKEN` 发布 Draft，由 GitHub 创建 tag；重新读取 API，要求 `immutable: true`、受保护 tag 指向封印 SHA、资产集合和 SHA-256 全部一致。

匹配的不可变 Release 再次收到同一审批运行完成事件时按成功处理，不覆盖任何资产。

## 7. 失败与恢复

| 失败点 | 状态 | 恢复方式 |
|---|---|---|
| SHA、actor、PR 或文件范围不匹配 | 无写入 | 修正候选，复制新的完整 head SHA 后重新批准 |
| `publicationDraft`、证据或分析不完整 | 无写入 | 在 Draft PR 中补齐并重新等待 CI |
| promotion 或 seal 创建失败 | PR 未合并 | 检查已有输出；不得覆盖记录，使用新的候选提交重试 |
| 分支在 push 前漂移 | push 失败 | 审核新 head 的全部变化并使用新 SHA 批准 |
| 封印 CI 失败 | 两提交可能已在 Draft PR 分支，未合并 | 前进合并修复后的 `main`，恢复仅含两份审核文件的候选净差异，形成新候选 head 后重新完整批准；不 force-push、不手改 seal |
| merge compare-and-swap 失败 | 未合并 | 重新读取 PR head，不重用旧批准 |
| Release 工作流失败 | 已合并，原成功 approval run 与 handoff artifact 已持久化 | 修复 Release 控制代码并合入 `main`，待精确 `main` SHA CI 全绿后，从 `main` 用原 run ID/attempt 执行恢复 dispatch；不重跑批准、不重新合并 |
| 治理 token 缺失或权限不符 | 在 Release mutation 前失败关闭 | 创建/轮换仅限本仓库且只有 `Administration: read` 的 fine-grained token，保存为指定 Secret 后重跑恢复 dispatch；不得改用宽权限 token |
| tag 读取返回 `403`、`5xx` 或网络错误 | 在发布前失败关闭，不能解释为 tag 不存在 | 保留 Draft 与运行证据；排除权限或 GitHub API 故障后重新运行同一 recovery dispatch |
| Draft Release 已有部分资产 | Draft 保留 | 同一事件只补上传 digest 匹配的缺少资产 |
| 已有 tag、Release 或资产不匹配 | 失败关闭 | 人工调查，不删除或覆盖证据 |
| 不可变 API 状态未出现 | Release 不宣告成功 | 保留运行证据并调查仓库设置/API 状态 |

### 7.1 Owner-only 恢复 dispatch

恢复只能由 `ZiZ-LG` 从默认分支运行 `publish-reviewed-release.yml`，并填写原成功批准运行的精确 ID 与 attempt：

```bash
gh workflow run publish-reviewed-release.yml \
  --repo ZiZ-LG/stephen-knowledge-hub \
  --ref main \
  -f approval_run_id="<original-approval-run-id>" \
  -f approval_run_attempt="<original-approval-run-attempt>"
```

工作流会重新从 API 读取原 run、artifact 和 job steps；输入不能改变 PR、candidate、promotion、seal、approval record 或 Release tag。本次 SAAS-608 恢复绑定 `approval_run_id=33095856066`、`approval_run_attempt=1`，目标 tag 固定为 `stephen-content-2026-08-27-d24d2128bc5b`。任何 actor、默认分支、run attempt、artifact digest 或 handoff 字段不匹配都会在 Release mutation 前失败关闭。

## 8. 更正、撤回与外部发布边界

不可变 Release 不能原地修改。内容需要更正或撤回时，必须通过新的候选、人工批准、merge commit 和更晚的不可变 Release 向前修正，并在新记录中引用被替代版本。不得删除旧 Release 来改写历史。

本闭环的终点是 GitHub Release。它不包含 GitHub Environment、服务器凭据、SSH、Nginx、DNS、流量切换或站点自动更新。任何把 Release 投放到线上站点的动作继续由私有运维边界单独批准和执行。
