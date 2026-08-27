# 自我修养｜Stephen Knowledge Hub

面向 AI 技术、大客户销售技术、AI 岗位与组织转型方法的公益知识聚合平台。

本仓库包含网站源码、已经项目所有者批准的公开知识内容，以及“AI 只生成候选稿、人工决定是否采用”的编辑工具。生产服务器配置、发布凭据、流量切换和回滚操作不属于本公开仓库。

## 本地运行

需要 Node.js 22：

```bash
npm ci
npm run check
npm run dev
```

生产构建输出到 `dist/`：

```bash
npm run build
```

构建产物可以由只读校验器生成 `.stephen-release.json`，其中固定记录本 public 仓库身份、精确源码 SHA、逐文件哈希、整体 checksum 和有限的浏览器冒烟路径。生产运维方必须同时核对 `sourceRepository + sourceSha + contentChecksum`，不能只凭分支名或单一 SHA 发布。

## 内容审核边界

- AI 只能生成候选稿，不能批准内容，也不能设置发布状态。
- 只有项目所有者明确批准的条目才能进入网站公开集合。
- 每日候选 Draft PR 即使尚未进入网站，在 public 仓库中也对公众可见。
- 定时候选工作流默认关闭；只有仓库变量 `STEPHEN_DAILY_SCHEDULE_ENABLED=1` 时才执行定时任务。

## 许可证

- 程序代码： [Apache License 2.0](LICENSE)。
- 项目原创知识内容和文档： [Creative Commons Attribution 4.0 International](LICENSE-CONTENT.md)。
- 第三方标题、来源信息、测试 fixture、监管标识及外部素材不在上述授权范围内，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

商用或改造时，请保留适用的版权与许可证声明、标明来源，并说明修改。推荐署名格式：

```text
Based on Stephen Knowledge Hub
Source: https://github.com/ZiZ-LG/stephen-knowledge-hub
Code: Apache-2.0; original content: CC BY 4.0
Changes: <简要说明修改内容>
```

名称和标识的使用边界见 [TRADEMARKS.md](TRADEMARKS.md)。
