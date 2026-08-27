# Stephen 审核后发布闭环运行手册

> 任务：`SAAS-608`
> 边界：本流程只把人工批准内容合入公开仓库并生成 GitHub 原生不可变 Release；不连接网站服务器，不执行流量切换。

## 1. 闭环结果

一次成功运行会留下六项互相校验的证据：

1. 仍处于 Draft 状态、只包含当日 manifest 与 ledger 的候选 PR；
2. 项目所有者输入的完整 40 位候选 SHA 和确认句；
3. 以候选 SHA 为父提交的“候选转正式内容”提交；
4. 以转正式提交为父提交的“人工批准封印”提交；
5. 封印 SHA 上完整通过的 `stephen-reviewed-release` 检查和使用该 SHA 作为并发保护条件的 merge commit；
6. 指向封印 SHA、包含校验元数据与静态站点压缩包的不可变 GitHub Release。

AI 和每日候选工作流只能生成 `pending_owner_review / not_published` 候选，不能生成上述第 2–6 项结果。

## 2. 启用前置条件

在首次真实使用前，必须依次满足：

- 公开仓库 bootstrap PR 已经单独批准并合入 `main`；
- SAAS-608 工作流 PR 已经单独批准并合入 `main`；
- 合并后的 `main` 精确 SHA CI 全绿；
- 仓库原生 Immutable Releases 设置已由项目所有者单独启用，并经 API 复核为 `enabled: true`；
- 仓库存在启用中的 `Protect Stephen immutable Release tags` tag ruleset，仅匹配 `refs/tags/stephen-content-*`，无 bypass actor，并禁止 update 与 deletion；
- 仓库只有 `ZiZ-LG` 一个具备 push 权限的 collaborator；每日候选与人工批准共用 `stephen-public-content-writer` 并发组，Release 使用按审批 run ID 与 attempt 区分的独立并发组，避免待运行交接被后续每日任务或另一审批 attempt 替换；静态审计禁止候选/批准工作流调用 tag 或 Release 接口；
- 当日候选由默认分支上的 live 工作流形成，分支名为 `codex/stephen-daily-YYYY-MM-DD`；
- 候选 PR 仍为 open Draft，且相对 `main` 只增加或修改当日 `review-manifest.json` 与 `discovery-ledger.json`。

缺少任一项时停止，不用功能分支、fixture PR 或手工 Release 绕过。

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

工作流以普通 fast-forward push 写回当日分支；若分支已漂移，push 失败，不 force-push。随后在封印树上执行 `npm ci`、`npm run check` 和精确 SHA 静态产物校验。全部成功后才创建 `stephen-reviewed-release` 成功检查，把 PR 转为 ready，并调用 GitHub merge API：

- merge 方法固定为 merge commit；
- API `sha` 参数固定为封印 SHA；
- 合并前再次读取 PR，要求 head、base、Draft 状态、同仓库身份及默认分支当前 SHA 均未漂移；
- PR head 发生任何变化都会让合并失败。

## 6. 不可变 GitHub Release

批准工作流在合并前写入 GitHub Actions 私有、不可修改的交接 artifact。审批运行完成时，独立 Release 工作流由 `workflow_run` 自动唤起；即使审批运行在合并后的非关键收尾处失败，交接 artifact、已合并 PR 和精确检查仍形成可恢复的持久证据。Release 工作流重新验证：

- PR 已合并，merge SHA 与事件一致；
- PR head 是封印 SHA；
- 封印 SHA 上存在成功的 `stephen-reviewed-release` 检查，且 GitHub App、external ID、运行链接与发起批准的 workflow run 完全一致；
- 发起批准的 workflow run 由仓库所有者从受信任控制 SHA 触发且已经完成；是否成功由持久的精确检查、封印链和已合并 PR 共同决定，不依赖合并后的脆弱通知步骤；
- merge SHA 仍可从当前远端默认分支 head 到达；默认分支可以在之后正常向前演进；
- 两个父提交、批准记录、仓库身份和标签全部一致；
- Immutable Releases 设置仍为开启；
- push collaborator 仍只有仓库所有者，标签规则集仍启用、无 bypass 且禁止 update/deletion；
- 已有 tag、Draft Release 和已上传资产没有发生身份或 digest 漂移。

Release 严格按以下顺序形成：

1. 从封印 SHA 重新构建并生成 `.stephen-release.json`；
2. 生成确定性 `stephen-site-<seal-sha-12>.tar.gz`；
3. 创建或复用目标为封印 SHA、但尚不创建 tag 的 Draft Release；
4. 上传缺少的、digest 匹配的两个资产；
5. 紧邻发布动作要求 tag 仍不存在，并重新读取当前远端 `main`、单写入者、标签规则集、Draft Release 和全部资产；完整复核后由 GitHub 在发布 Draft 时创建 tag；
6. 重新读取 API，要求 `immutable: true`、受保护 tag 指向封印 SHA、资产集合和 SHA-256 全部一致。

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
| 合并后审批运行收尾失败 | 已合并，交接 artifact 已持久化 | `workflow_run` 仍按持久证据尝试发布；若 Release 工作流失败，调查后重跑该 Release 工作流，不重新合并 |
| Draft Release 已有部分资产 | Draft 保留 | 同一事件只补上传 digest 匹配的缺少资产 |
| 已有 tag、Release 或资产不匹配 | 失败关闭 | 人工调查，不删除或覆盖证据 |
| 不可变 API 状态未出现 | Release 不宣告成功 | 保留运行证据并调查仓库设置/API 状态 |

## 8. 更正、撤回与外部发布边界

不可变 Release 不能原地修改。内容需要更正或撤回时，必须通过新的候选、人工批准、merge commit 和更晚的不可变 Release 向前修正，并在新记录中引用被替代版本。不得删除旧 Release 来改写历史。

本闭环的终点是 GitHub Release。它不包含 GitHub Environment、服务器凭据、SSH、Nginx、DNS、流量切换或站点自动更新。任何把 Release 投放到线上站点的动作继续由私有运维边界单独批准和执行。
