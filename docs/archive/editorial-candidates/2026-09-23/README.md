# 2026-09-23 遗留候选：未批准档案

这两份文件已进入历史主分支，但内容仍为 `pending_owner_review / not_published`。合并源码不等于逐条内容批准；它们未被导入网站正式内容集合。本次只把原字节移出活动候选目录，保留原状态和证据，不执行内容提升或发布。

- 原合并提交：`a08fcde5591fdb62c6878e2924d566041ff862d1`（PR #18）
- 本次整合前快照：`e7b14fb54c72e3365c612179822a6a2ed8f188b1`
- 原活动目录：`review-candidates/2026-09-23/`
- 归档原因：活动候选目录仅属于同日期候选分支；遗留文件在普通开发分支和主分支触发 `candidate-branch` 审计。保留档案并退出活动目录，不修改审计器、权限或审批规则。

| 原路径 | 档案文件 | Bytes | SHA-256 |
|---|---|---:|---|
| `review-candidates/2026-09-23/discovery-ledger.json` | `discovery-ledger.json` | 2407 | `1c2616f33c68c9a6438bcf71cf202b1b385cddac0adeb304a09e50f462c38784` |
| `review-candidates/2026-09-23/review-manifest.json` | `review-manifest.json` | 50154 | `6c0d666f1dade04e99ce08f4b67db71243ec986fa1540b3569016cccf042d8a8` |

后续若采用其中内容，应重新核对易变事实、保留原来源日期，并建立符合当前规则的候选审核；项目所有者的批准须绑定新的完整 SHA。不能仅改 `approved` 字段或把档案直接放进 `src/content/published/`。本目录也不进入 `public/` 或网站构建产物。
