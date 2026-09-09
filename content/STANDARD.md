# VentureDex 内容标准与策展流程

> 这是 VentureDex 唯一的内容规范文档。所有策展决策以此为准。

---

## 第一章：我们是谁

VentureDex 是一个有观点的创业项目目录。我们不追求全面，追求准确。不追求速度，追求深度。不追求中立，追求诚实。

我们的读者是创业者和投资人。他们不需要又一个融资新闻聚合器。他们需要一个值得信赖的声音告诉他们："在噪音中，这几个值得你花 5 分钟了解。"

### 编辑信条

**我们只收录让我们觉得"这个产品有意思"的公司。** 不是"这个公司融资了所以应该收录"。融资是发现信号，不是收录理由。发现之后，我们要做的是判断：这个产品是否值得一个有品味的人推荐给朋友？

这个判断基于三个维度：

1. **这个产品做了一个有意思的赌注。** 它放弃了什么来换取什么？如果你找不到它的赌注，它要么没有主见，要么在做所有人都在做的事。
2. **这个产品有工艺感。** 用适合行业的产品证据判断：软件看真实流程、信息架构和交互；开发工具看 API、文档与错误处理；企业服务看集成和部署流程；硬件看规格、测试与现场演示；医疗看已披露的验证方法和使用流程。官网美观是辅助信号，不能用模板、字体或注册门槛推断产品质量。
3. **这个产品解决了一个真实的、具体的问题。** 不是"让团队更高效"。是"让开发者在 issue tracker 里不再等 3 秒刷新"。越具体越好。

三个维度至少两个有具体证据支持才通过。证据不足先待复审；证据充分但仅 0-1 个通过才是质量淘汰。融资金额不替代产品判断。

---

## 第二章：策展流程

每个收录从可核验的融资信号或有明确触发条件的复审开始，经过 5 个阶段到达发布。各阶段区分证据待补、访问受阻、合格待发布、质量拒绝与政策排除，不把尚未发布都称为淘汰。

```
Stage 1: 发现 ──→ Stage 2: 初筛 ──→ Stage 3: 深度评估 ──→ Stage 4: 内容创作 ──→ Stage 5: 验证发布
   │                  │                    │                     │                    │
   │                  ↓                    ↓                     ↓                    ↓
   │             decision overlay     decision overlay      重写直到通过          自动验证
   │              (记录原因)           (记录原因)                                  build-db.sh
   ↓
 融资新闻
 TechCrunch
 Bloomberg
 The Information
```

### Stage 1: 发现

**输入**: 近 30 天的创业融资新闻。

**搜索方式**：先运行 `npm run curation:plan`，最多选 3 个到期复审；再补充新发现，与复审合计固定为 10-20 个唯一公司。至少尝试三类互补来源：公司/投资机构原始公告、原创媒体、地区媒体、行业媒体或研究机构。记录查询和结果，未找到也如实记录；不强制每类入选。聚合器只作发现线索，融资事实回到原始报道或公告。不要只用英文、美元金额或少数美国科技媒体构造查询。

**产出**：按 `docs/automation/curation-decisions.md` 保存 `content/curation-runs/{run_id}.json`。锁定公司和发现来源的身份摘要，再逐个评估；不能为凑拒绝数追加候选。固定池所有候选都必须有明确结果，最多发布 5 个，合格溢出记 `qualified_pending`。无拒绝或无收录都可以是正常结果。

### Stage 2: 初筛（60 秒/项目）

60 秒是初步分流时间，不是完成尽调的期限。确定违反 F2/F4 才作政策排除；身份、融资或产品证据尚不明确进入待补队列，不能直接判为低质量。

| # | 条件 | 怎么检查 | 淘汰标准 |
|---|------|---------|---------|
| F1 | 产品可评估 | 检查官网及适合行业的原始产品材料 | 403/404/超时或暂时无法查看记 access_blocked；证据不完整记 evidence_pending；完成多来源核查仍确认没有可评估产品才可给出具体质量否决 |
| F2 | 独立公司 | 查公司背景 | 大公司子产品、内部工具、白标 |
| F3 | 阶段适配 | 看融资轮次、估值、公司状态 | 已上市、已被收购、非独立公司；普通项目覆盖 Pre-Seed、Seed、Pre-Series A 至 Series C，明星项目可走突破性项目例外 |
| F4 | 非排除品类 | 看产品内容 | 加密货币/NFT、赌博、成人、SEO 工具、模板商店、VPN 评测 |

**F1 不是"必须能无登录试用"。** ToB、API、基础设施、医疗、防务、金融等产品常常需要登录、SSO、合规审核或销售流程。只要有足够公开证据能判断产品本身，就可以进入深度评估。公开证据包括但不限于：开发者文档、API reference、SDK/GitHub、可运行 playground、录屏 demo、真实 UI 截图、应用商店页、benchmark、定价/用量页、客户案例中具体 workflow。登录墙或 demo CTA 本身不是淘汰理由。硬件与医疗可以用规格、现场测试、试点流程及公开验证材料建立证据；厂商性能和临床主张标记为厂商披露，不能写成独立验证。无法取得材料与确认没有产品是不同结论。

**F3 不是"融资越多越该淘汰"。** VentureDex 默认偏早期，但可以收录突破性明星项目：即使是 Series D+、估值 > $10B、或融资金额很大，只要它仍是独立私有公司，并且产品赌注明确、公开证据充足、市场势能本身就是读者应该理解的信号，就可以继续评估。不能走例外的情况：已上市、已被收购、大公司部门、或者只是"融了很多钱"但产品判断站不住。

凡 `funding[].stage` 为具名 `Series D` 或更晚轮次，startup JSON 必须增加结构化 `research.breakout_exception`，不能靠评语暗示例外已经通过：

```json
{
  "research": {
    "breakout_exception": {
      "reason": "80-500 characters explaining why this independent private company clears the late-stage breakout bar.",
      "source_ids": ["official_site", "funding_1", "product_1"]
    }
  }
}
```

`source_ids` 至少三个且不能重复，必须引用 `research.sources` 中的官方来源和融资来源，并覆盖至少两条 `research.product_evidence`。这个字段只记录例外理由和证据绑定；它不替代 F2 独立公司核验、F3 人工判断、完整 research、品牌或发布门禁。`Growth`、`Late Stage`、`Series AA` 等模糊或非具名轮次仍不进入 schema。

新决策首先记到 `content/curation-reviews.json`。只有确证质量否决或政策排除才可另写 v2 历史记录到 `content/rejected.jsonl`；访问、证据、格式或发布阻塞不写拒绝行：
```jsonl
{"schema_version":2,"slug":"bad-example","company_url":"https://example.com/","decision_source_url":"https://parent.example.com/products/bad-example","decision_source_type":"official","rejected_at":"2026-07-26","stage":"F2","reason":"The official parent-company page identifies this as a subsidiary, not an independent company.","lifecycle":{"status":"active","revisit_triggers":["company_status_change","governance_change"]}}
```

`rejected.jsonl` 当前第 1-872 行的无版本五字段记录是冻结的 **legacy v1 区块**。它们继续有效，但旧字段 `url` 可能是公司官网，也可能是发现或融资报道；不要复制这个歧义。验证器同时固定该区块的有序 slug 摘要和完整区块摘要，因此不要插入、删除、重排、改名或改写历史字段。第 872 行之后的所有新增记录必须使用上面的 v2 合同：

- `company_url` 只保存已核验的官方公司或产品主页。
- `decision_source_url` 保存实际支撑拒绝决定的页面；`decision_source_type` 只能是 `official`、`funding` 或 `discovery`。
- `lifecycle.status` 新增时必须是 `active`；`revisit_triggers` 至少列出一个可复审条件，只能使用 `later_funding_round`、`new_product_evidence`、`company_status_change` 或 `governance_change`。
- 新的复审结论写入独立 decision overlay，引用原始行 SHA-256；不改写旧行或冻结摘要。有效 overlay 优先于旧拒绝用于去重，`accepted` 仅在对应 startup 和全部门禁通过时成立。既有 v2 `superseded` 记录仍兼容，但新的复审统一走 overlay。
- 不迁移或猜测 legacy v1 的 URL 角色，不升级或修改冻结区块摘要。复审重新核验公司官网，以准确来源和原行摘要建立 overlay；v2 缺字段、混用旧字段或生命周期不完整仍阻断验证。

通过初筛进入 Stage 3。没有预设通过率；按状态报告真实结果。

### Stage 3: 深度评估（5-10 分钟/项目）

这是品味发挥作用的阶段。初筛只检查"这个公司有没有资格"，深度评估要回答"这个产品是否值得推荐"。

**步骤 3.1: 使用产品**

实际打开产品网站，花 3-5 分钟评估产品。不是看一眼 landing page，也不是只看融资新闻。能试用就试用；需要普通注册且风险可控就注册；有 demo 就看 demo；是开源项目就看 README、代码和 demo 站；是 ToB/API/基础设施产品，就看文档、API、SDK、真实界面、benchmark、客户案例和定价/用量细节。

记录你的第一印象：
- 前 5 秒你看到了什么？
- 最让你惊讶的一个细节是什么？
- 最让你失望的一个点是什么？

**步骤 3.2: 品味三问**

| 问题 | 通过标准 | 淘汰标准 |
|------|---------|---------|
| **这个产品做了什么赌注？** | 你能用一句话说出"它选择了 X 放弃了 Y" | 你找不到它的取舍，它在做所有人都在做的事 |
| **它有工艺感吗？** | 同行业可检查的流程、接口、测试或实物细节体现明确取舍 | 已检查的产品证据显示关键流程粗糙且缺乏解释；不能仅凭官网样式否定 |
| **它解决的问题具体吗？** | 你能说出一个人的名字（或角色）和他的痛点 | "帮助企业提升效率" — 无具体性 |

三问逐项记录证据，至少 2 个通过才继续。材料不足 → evidence_pending；完成相应行业评估后仅 0-1 个通过 → quality_rejected。

淘汰时记录：
```jsonl
{"schema_version":2,"slug":"boring-saas","company_url":"https://boring.example/","decision_source_url":"https://boring.example/","decision_source_type":"official","rejected_at":"2026-07-26","stage":"taste","reason":"No discernible bet. Generic SaaS dashboard, no craft signal, and no specific user problem.","lifecycle":{"status":"active","revisit_triggers":["new_product_evidence","governance_change"]}}
```

**步骤 3.3: 交叉验证融资信息**

从融资新闻文章中提取以下信息，每一条都必须在原文中有明确出处：

| 字段 | 来源要求 | 如果找不到 |
|------|---------|-----------|
| 融资金额 | 原文明确提到的数字 | 保留必填 amount 键，值写 "undisclosed" |
| 融资轮次 | 原文明确标注，按 funding-terms.md 保留原词并标准化 | 未具名先 evidence_pending，不猜测或永久拒绝 |
| Lead investor | 原文明示的 lead/co-lead；不能把首个提及的参投方推断为领投 | 保留必填 lead_investor 键，值写 "undisclosed" |
| 日期 | 文章发布日期 | 必须有 |
| 来源 URL | 文章 URL | 必须有，没有来源不收录 |

金额保留来源币种，非美元使用 `EUR 6.5M` 等格式及 `currency`；不自动换汇。`stage_raw` 保留 `Series A+` 等原始扩展轮次；`instrument` 区分 equity/debt/mixed/grant/undisclosed，不把混合融资总额写成股权金额。原币种、扩展轮次和未披露 lead 都不是淘汰条件。详见 `docs/automation/funding-terms.md`。

**绝对规则：不编造。不确定的非必填信息省略；amount / lead_investor 未披露时使用已有的 "undisclosed" 值，不省略必填键。来源不存在的不收录。缺少已披露的领投方名称本身不是 F3 淘汰条件。**

**投资机构资料维护：** 每个准备新增或更新的 startup 涉及的明确参投方和领投方，都先按 canonical directory 精确去重。结构化资料存放在 `content/investor-profiles.json`，按 `docs/automation/investor-research.md` 执行：90 天内已完整核验的机构跳过；满 90 天复查；实质变化或事实错误提前复查；新机构必须补充有官方来源的档案。未披露字段省略，不以来源访问失败刷新 `reviewed_at`。历史缺档案机构按本次关联范围逐步补齐，不扫描整个目录。这里的 90 天规则不改变 startup 的融资时间窗和收录标准。

通过 Stage 3 进入 Stage 4；超过本轮发布容量的合格项目保留 qualified_pending，不降低其评价。

### Stage 4: 内容创作

#### 4.1 JSON 文件结构

创建 `content/startups/{slug}.json`：

```json
{
  "slug": "example",
  "domain": "example.com",
  "url": "https://example.com",
  "product_name": "Example",
  "summary": "不超过 100 字符。说它做什么，不说为什么好。",
  "editor_note": "见下方详细标准",
  "research": {
    "verified_at": "2026-05-26",
    "sources": [
      {
        "id": "official_site",
        "label": "Official product site",
        "url": "https://example.com",
        "type": "official"
      },
      {
        "id": "funding_1",
        "label": "Funding source name",
        "url": "https://source.example/article",
        "type": "funding"
      }
    ],
    "product_evidence": [
      {
        "claim": "A concrete product-surface claim verified from the official site.",
        "source_ids": ["official_site"]
      },
      {
        "claim": "A second concrete product, docs, pricing, customer, integration, or workflow claim.",
        "source_ids": ["official_site"]
      }
    ],
    "market_context": {
      "primary_user": "Who evaluates or uses the product.",
      "category": "DevTools",
      "differentiation": "Specific evidence-backed difference.",
      "why_now": "Why the current funding/product signal matters now."
    },
    "risks": [
      {
        "claim": "A falsifiable risk or open question.",
        "basis": "VentureDex editorial assessment based on official product evidence and funding-source review."
      }
    ]
  },
  "editor_rating": 4,
  "why_featured": "不超过 40 字符。具体的理由，不是形容词。",
  "product_type": "DevTools",
  "founded_year": 2023,
  "team_size": "10-30",
  "hq_location": "San Francisco",
  "region": "US",
  "tags": "developer tools,api,open source",
  "investors": "只填有来源可查的。逗号分隔。",
  "links": {
    "github": "只填官方组织页",
    "twitter": "只填产品官方账号",
    "linkedin": "只填公司页",
    "producthunt": "只填产品页",
    "careers": "只填官方 Careers/Jobs/Open Roles 入口页；可选，不抓取岗位列表"
  },
  "is_featured": false,
  "funding": [
    {
      "amount": "$20M",
      "stage": "Series A",
      "lead_investor": "Sequoia Capital",
      "date": "2026-04-01",
      "source_url": "https://techcrunch.com/2026/...",
      "source_name": "TechCrunch"
    }
  ]
}
```

#### 4.2 editor_note 撰写标准

editor_note 是 VentureDex 的核心价值。每一条都应该让读者觉得"这个评论本身就值得读"。

**结构（3-5 句）:**

```
第 1 句: 判断。不是描述。
         不要: "This is a project management tool."
         要:   "Someone finally built project management for people who hate project management."

第 2 句: 证据。支撑你判断的具体事实。
         不要: "It's growing fast."
         要:   "Tab completion that reads your mind, inline diffs that make sense — shipped by a 50-person team in 18 months."

第 3 句: 赌注或洞察。这个产品做了什么取舍？创始人看到了什么？
         不要: "It has great potential."
         要:   "The VSCode fork approach was the right call: familiar enough to switch, different enough to stay."

第 4-5 句（可选）: 张力或风险。诚实地指出不确定性。
         不要: "It will be interesting to watch."
         要:   "Whether this replaces Google search or becomes a power-user tool is the billion dollar question."
```

**通过标准（全部满足才通过）:**

| # | 规则 | 为什么 |
|---|------|--------|
| N1 | 150-500 字符 | 太短没深度，太长失焦 |
| N2 | 第一句不以产品名开头 | 逼自己用判断开头而不是描述 |
| N3 | 包含至少 1 个具体事实（数字、技术名词、产品特性） | 区分观点和空谈 |
| N4 | 包含至少 1 个比较或对比 | 说清楚"不是什么"才能说清楚"是什么" |
| N5 | 不包含任何禁用词（见下方） | 避免 AI 腔和营销腔 |
| N6 | 如果去掉产品名，读者仍然觉得这段话有价值 | 品味测试：评论本身要有独立价值 |

**禁用词列表:**
```
中文: 革命性、颠覆性、赋能、一站式、全方位、下一代、生态、矩阵、抓手、触达
英文: revolutionary, comprehensive, robust, cutting-edge, game-changing, best-in-class, 
      innovative, powerful, seamless, empower, leverage, synergy, next-generation
```

**正面案例:**

> When someone with taste builds project management, every interaction feels considered. The keyboard shortcuts alone are worth the switch. In a market drowning in feature-bloated tools, Linear chose speed and focus. That bet paid off.

分析：判断开头 → 具体细节(keyboard shortcuts) → 赌注(speed over features) → 简短结论

> Perplexity did what Google should have done five years ago: just answer the question. The product is deceptively simple. You ask, it answers with sources. No ten blue links, no ads above the fold. Whether this replaces Google search or becomes a power-user tool is the billion dollar question.

分析：比较(vs Google) → 具体描述 → 诚实的张力(billion dollar question)

**反面案例:**

> ❌ "This is an innovative AI-powered platform that leverages cutting-edge technology to empower developers with comprehensive tools for building next-generation applications."

每个词都是禁用词。没有具体性。没有判断。没有品味。

> ❌ "The company raised $20M from a16z, showing strong investor confidence in their vision."

这是融资新闻摘要，不是编辑短评。融资不是产品。

#### 4.3 editor_rating 评分

每个维度 0 或 1 分，总分 1-5：

| 维度 | 1 分 = 是 | 0 分 = 否 | 判断依据 |
|------|----------|----------|---------|
| 产品完成度 | 核心功能已经被真实使用或公开证据足够完整 | 明显半成品 | 试用 3 分钟或检查公开产品证据 |
| 市场验证 | 有付费用户或可观的免费用户 | 只有 landing page | 看定价页/用户数 |
| 差异化 | 品类内某个维度明显最好 | 和竞品无明显区别 | 和前 3 竞品对比 |
| 工艺品味 | 有适合行业的可检查产品细节 | 产品证据显示关键流程粗糙 | 看真实流程、接口、测试或实物，不只看 landing page |
| 势能 | 近期被讨论/增长/融资 | 无明显动态 | 看 HN/Twitter/新闻 |

**is_featured 规则**: 总分 ≥ 4 且工艺品味 = 1。

#### 4.3.1 research 结构化研究

每个收录公司必须有 `research`，否则不能发布。

| 字段 | 要求 | 禁止 |
|------|------|------|
| `sources` | 至少包含官方产品页和融资来源；只加入实际检查过的官方 docs/GitHub/LinkedIn/Product Hunt | 用二手摘要代替官方产品页 |
| `product_evidence` | 至少两条具体产品证据，每条用 `source_ids` 指向 `sources` | 把 “great team / huge market / investor confidence” 当产品证据 |
| `market_context` | 写清 primary user、category、differentiation、why_now | 空泛 TAM、预测式判断 |
| `risks` | 至少一条可验证的风险或开放问题 | 泛泛 “execution risk” |

融资事实放 `funding`；产品证据放 `research.product_evidence`。不要把融资本身写成产品证据。

#### 4.4 why_featured 标准

| 通过 | 不通过 | 为什么 |
|------|--------|--------|
| "$60M Series A at 18 months" | "Great startup" | 具体 vs 空洞 |
| "10K GitHub stars in 3 months" | "Popular project" | 有数据 vs 无数据 |
| "Replaced Jira at 500 teams" | "Better than Jira" | 有证据 vs 无证据 |
| "YC S26, solo founder" | "YC company" | 有细节 vs 无细节 |

#### 4.5 品牌素材

截图前先补齐品牌素材：

- 公司 Logo → `public/logos/companies/{slug}.{png|svg|ico|jpg}`
- 投资机构 Logo → `public/logos/investors/{slug}.{png|svg|ico|jpg}`
- 来源清单 → `content/brand-assets.json`

只接受官网直接暴露出来的资源：

- favicon / apple-touch-icon
- 官网静态资源
- 官网页头内联 SVG

`content/brand-assets.json` 必须记录：

- `source_page` = 官网页面
- `source_url` = 实际素材 URL

不允许：

- Google favicon
- 第三方 logo API
- 聚合站抓图

#### 4.6 截图

使用本次任务的 Codex 内置浏览器标签页打开产品官网，依据可见页面操作处理 consent/聊天浮层，确认产品内容可读后保存截图到绝对路径。先视觉复核原图，再导入；空白、加载未完成或产品被遮挡的截图不能标记为已复核。不得通过脚本删除真实产品内容来制造干净画面。

在 CUA 工具的持久 JavaScript 会话中，`taskTab` 必须是本次创建并已核验页面状态的标签页句柄。原生截图会显示图像并返回原始字节：

```javascript
var productCapture = await taskTab.getScreenshot();
```

先检查工具显示的图像，再在同一 CUA 会话中将原始字节保存到本次任务独占的绝对路径；目录须已存在，`wx` 防止覆盖已有文件：

```javascript
await (await import("node:fs/promises")).writeFile(
  "/absolute/run-artifacts/product.png", productCapture, { flag: "wx" }
);
```

这只是保存 Codex 原生捕获结果，不是启动或控制外部浏览器；不要把捕获字节序列化为 JSON 或改造成另一张图片。之后用该实际路径导入：

```bash
./scripts/screenshot.sh {slug} {url} --from-codex /absolute/run-artifacts/product.png --reviewed
```

截图应采用桌面视口（Codex 默认 1280x720 可直接使用）、默认缩放，不能用全页长图缩成缩略图。等待字体、图片与文字动画稳定；如果首页主视觉不适合静态截图，选择可读、完整的产品区域。至少比较一个稳定候选，不得将加载框、错误页、遮挡层、模糊动画残帧或极小主体当成成品。

导入工具只向下缩放并生成 WebP，保留原比例，不裁切、不补白、不放大，不启动浏览器或上传 R2。`--reviewed` 仅说明捕获原图已检查，导入后仍为 **UNREVIEWED**，不是发布批准。

必须由不同于捕获操作者的复核者检查最终 WebP、实际卡片和详情页：产品已加载（loaded）、无遮挡（unobstructed）、主要文字可读（legible）、主体完整（framing）、卡片展示完整（card）、详情展示完整（detail）。桌面和窄布局均不得裁掉主体；真实产品控件不能误判成弹窗。不能单凭尺寸、熵或工具退出码宣称视觉合格。

读取最终文件摘要，复核后逐项明确批准：

```bash
node scripts/screenshot-quality.mjs inspect {slug}
node scripts/screenshot-quality.mjs approve {slug} \
  --sha256 {实际已复核文件的摘要} --source-url {实际官方截图页面URL} \
  --capture-method codex-iab --capture-operator {捕获操作者} \
  --reviewer {独立复核者} --notes "具体看到的主体、可读性与展示结果" \
  --loaded --unobstructed --legible --framing --card --detail
node scripts/screenshot-quality.mjs validate
```

审批写入 `content/screenshot-reviews.json` 并绑定最终图片 SHA-256；图片任何字节变化都必须重新复核。`historical-reviewed` 仅用于真实审核后保留的历史图，不代表曾用 Codex 重拍，也不是新增截图的捷径。审批是可追溯的审阅声明，不是自动视觉模型评分或身份认证。将图片和审批清单一同提交；缺少审批、哈希不符、任一项目未通过、无效图片均阻止统一验证与站点构建。不合格时重新拍摄并复核，不能填假检查值来绕过门禁。操作细节见 `docs/automation/screenshot-quality.md`。

### Stage 5: 验证与发布

**5.1 自动验证**

```bash
./scripts/manage.sh validate  # 内容校验、D1 seed、测试、typecheck、Astro build
git diff --check              # 空白和补丁格式检查
```

`scripts/build-db.sh` 仍然负责生成 D1 seed，并与 `src/lib/content-transform.ts` / `tests/content-parity.test.ts` 共同保证 prerender 内容路径和 D1/newsletter 路径不漂移。新增 startup 时必须同步 `content/timestamps.json`，否则首页排序、RSS、sitemap 和 D1 seed 的发布时间会不一致。

**5.2 提交**

一次只新增一个项目时使用单项目 commit：

```
content: add {Product Name}

Funding: {amount} {stage} from {lead} ({source_name})
Rating: {N}/5 (dims: {list})
Bet: {一句话描述这个产品的赌注}
```

commit message 保持简洁。Gate check 清单不需要放在 commit 里（验证器已经做了）。重要的是把赌注写出来 — 如果你不能用一句话说出它的赌注，你还没有理解它。

一次 Daily 运行新增 2-5 个项目时，允许在所有项目分别通过同一套事实、品牌、research、taste 和发布门禁后合并为一个内容 commit：

```
content: add curated startups

Count: {N} startups
Names: {Name A}, {Name B}, ...
Note: every addition independently passed F1-F4, taste review, screenshot, and local gates
```

内容和自动化治理文档仍必须分开 commit；不要为了减少 commit 数量降低单项目审查粒度。

**5.3 推送**

```bash
git push
```

GitHub Actions 先对同一个 main commit 执行完整 Validate；只有 clean checkout 的该 SHA 仍是 `origin/main` 且验证成功时才进入串行 Deploy，手动触发也只能发布精确的当前 `origin/main` SHA。`scripts/manage.sh sync` 和 `scripts/manage.sh deploy` 不再直接修改生产；唯一允许发布 Worker 或写入 D1 的 CLI 路径是统一的 `scripts/manage.sh release`。当前站点页面主要由 `content/` 在 build 阶段 prerender；D1 继续支撑 newsletter、订阅和运行时发送状态。Release 流程执行 newsletter preflight、adapter v14 Worker 部署、远端 D1 同步和带界限的 live smoke 重试。D1 同步必须比较远端与本地完整的 published/manual startup slug 集合及 published Weekly issue_number 集合；任何远端条目缺失都默认阻塞，只有人工复核后才可用精确集合覆盖，Daily 自动化不得自行设置删除覆盖变量。

**5.4 Codex 浏览器与 Search Console 直提**

产品试用、页面核验、截图、登录态检查和 GSC 操作统一使用 Codex 内置浏览器的 CUA 工具。只创建和操作本次任务自己的 Codex 标签页，每次动作都依据新读取的可见页面；结束时只关闭这些标签页。不得依赖或退回 `bb-browser`、Comet/Chrome CDP 或共享 daemon，不操作用户标签页或其他浏览器进程。Codex 浏览器不可用时记录明确 blocker，不更换浏览器绕过。

部署和 live smoke 通过后，新增 Daily startup 详情页必须进入 Google Search Console 的 URL Inspection 请求流程。先执行只读计划，确认精确目标 URL：

```bash
python3 scripts/gsc-codex.py plan --latest-daily
```

新增 Weekly issue 发布后，对应 `/weekly/{N}` 详情页使用同一流程：

```bash
python3 scripts/gsc-codex.py plan --latest-weekly
```

计划不会控制浏览器、点击按钮或写入提交成功记录。[Codex GSC 操作协议](../docs/automation/gsc-codex-browser.md) 定义了精确命令、证据 schema 和恢复边界。之后逐个处理计划允许的 URL：

1. 在本次创建的 Codex 标签页打开 Search Console，确认 VentureDex property 的登录态，再进入目标 URL 的 Inspection 结果。必须看见结果绑定的精确目标 URL 和可用的 **Request indexing** 按钮，不能仅凭输入框内容判断。
2. 把本次实际可见状态的最小脱敏证据保存到工作树外的 durable artifacts 目录，按 `scripts/gsc-codex.py` 的证据 schema 执行 `begin --url URL --evidence FILE`。只有该命令成功并返回 attempt ID 后才允许下一步；它在点击前持久化意图，防止中断后重复提交。
3. 使用 CUA 工具至多点击一次 **Request indexing**，读取新的页面状态直到得到明确结果或有界等待结束。成功证据必须通过同一已观察的 tab 和完整 inspection route 绑定原 intent 的精确 URL，并含明确的请求成功标记。原生 modal 的 AX 只显示对话框时，post-click excerpt 可以没有 URL，必须忠实保存实际观察内容；禁止补写未显示的 URL 或拼接旧 AX 行，不能为凑 URL 文本而关闭成功 modal。若 excerpt 出现 VentureDex startup/weekly 详情 URL，只能是预期 URL，混入其他详情 URL 必须阻塞。没有 intent/tab/route 绑定的通用成功消息、按钮消失、输入框值或历史 ledger 仍不够。
4. 用同一 attempt ID 执行 `finish --attempt ID --evidence FILE`，让验证过的结果写入中央 ledger。不能伪造证据、直接编辑 ledger 或把未确认点击降级为可重试。如果工具或页面在点击后中断，保留 durable intent，结果按未知处理，不得再次点击。

提交后检查 `$CODEX_HOME/automations/venturedex-daily-curator/gsc_submission_history.tsv` 这一权威 ledger，确认每个目标 URL 的最新状态为 `requested`；这只表示已请求，不等于 Google 已收录。仓库根目录的 `.gsc_submission_history.tsv` 仅是旧版兼容输入，不再作为完成证据。证据和失败诊断存放在 `$CODEX_HOME/automations/venturedex-daily-curator/gsc-artifacts/`，避免工作树清理丢失。如果登录态、Search Console UI 或配额阻塞，记录 blocker 和精确目标 URL，不要把它当作已提交。普通未点击积压先用 `python3 scripts/gsc-codex.py plan --retry-pending` 选择安全上限内的批次，再走同一流程。

登录/浏览器在 `begin` 前阻塞，或配额结果导致本批停止时，对其余从未点击的 URL 逐一执行 `python3 scripts/gsc-codex.py defer --url URL --reason "实际 blocker；目标从未点击"`。该命令不操作浏览器、不做 live check，在 authority 锁内只把未点击且无冲突 blocker 的目标写为 `retry_pending`，便于下次计划发现；property 全局配额 cooldown 不妨碍保留这些未点击目标。reason 必须单行、非敏感且不超过 500 字符。不得用 `defer` 重置已 requested、已点击、pending、unknown、orphan intent 或旧 reconciliation 状态，也不能把刚触发 quota 的 URL当作未点击目标。命令阻塞时保留错误，不手改 ledger。

如果写入 immutable receipt 后、追加终态 ledger 前中断，执行 `python3 scripts/gsc-codex.py recover --attempt ID`。它不操作浏览器、不接受新 evidence，只从权威目录读取该 attempt 已存在的 intent/receipt，核验精确 URL、终态及可见标记、同标签页/route 和观察晚于 intent 后，向仍由该 attempt 持有的 `request_click_pending` 补记原终态。原 receipt 可以超过五分钟；普通 `finish` 的五分钟新鲜度限制不变。重复恢复已一致的终态不追加记录。缺失或无效 receipt、authority 不匹配时继续保留 blocker，不得伪造或修改证据。

如果最新状态或 durable attempt 是 `post_request_confirmation_unknown`，不得用 `--force`、普通 retry 或新 attempt 猜测重发。`recover` 只是重放已有 receipt，unknown receipt 只能恢复为 `post_request_confirmation_unknown`，不能升级成成功或获得新的点击授权。零点击人工核对可以保留新观察，但不得修改原终态 ledger/artifact。对仍处于 `request_click_pending` 且尚无 receipt 的原 attempt，只能用符合协议的同标签页、同 route 新结果执行 `finish`；始终不能重复点击或借旧浏览器提交器恢复。

---

## 第三章：周刊

每周从已收录的项目中选 5-7 个组成 Weekly Picks。周刊不是新增卡片列表，而是一篇研究型编辑稿：它要解释本期为什么选择这些公司、当周值得关注的产品变化是什么、每家公司可验证的证据是什么，以及哪些判断边界不能越过。

周刊必须每周产出一个草稿；只有当所有 published 门槛满足时才发布。如果本周新增收录少于 5 个，可以从已发布目录中补入高质量相关项目，但必须说明它们与本期主题的关系，不能为了凑数重复泛泛推荐。

### 选题标准

- rating ≥ 3
- 优先选最近新收录的
- 有一个主题线索把本期串起来（不是随机拼凑）
- 周刊标题是一个观点，不是一个分类名
- 每个 pick 都必须有证据、评价、风险边界和一句结论
- 不写没有来源支持的用户数、收入、留存、市场份额或客户迁移判断

| 好标题 | 坏标题 |
|--------|--------|
| "The tools that changed how we build" | "This week's picks" |
| "AI that solves boring problems" | "AI startups" |
| "Five bets against conventional wisdom" | "Featured companies" |

### 文件格式

```json
// content/weekly/{N}.json
{
  "issue_number": 2,
  "title": "一个观点，不是一个分类",
  "week_start": "2026-05-18",
  "week_end": "2026-05-24",
  "published_at": "2026-05-25",
  "status": "draft|published|archived",
  "editorial_intro": "2-3 句。为什么选这些项目？它们之间的共同点是什么？",
  "research_summary": "本期使用了哪些来源，哪些指标没有验证，哪些判断不做。",
  "evaluation_method": [
    "只使用 VentureDex 已发布记录、官网公开产品证据和链接来源。",
    "把可观察产品事实和编辑判断分开写。",
    "证据缺失时明确写缺口，不用猜测补齐。"
  ],
  "themes": [
    {
      "title": "主题线索",
      "summary": "这组公司共享的产品或市场变化。"
    }
  ],
  "picks": [
    {
      "slug": "slug1",
      "why_this_week": "为什么它属于本期，而不是泛泛值得关注。",
      "product_evaluation": "基于证据的产品评价，不写未验证指标。",
      "evidence": [
        {
          "label": "来源名",
          "source": "具体文件、官网页面或新闻来源",
          "url": "https://example.com/source"
        }
      ],
      "risks": [
        "证据边界、产品风险或尚未验证的关键问题。"
      ],
      "verdict": "一句可被证据支撑的结论。"
    }
  ]
}
```

### 自动化流程

周刊自动化只负责生成证据绑定的草稿，不负责自动发布评价。默认流程：

```bash
python3 scripts/weekly.py draft --week-start YYYY-MM-DD --week-end YYYY-MM-DD --write
python3 scripts/weekly.py validate
./scripts/manage.sh validate
git diff --check
```

`status: draft` 可以包含 TODO。`status: published` 不允许 TODO，且每个 pick 必须有 `why_this_week`、`product_evaluation`、`evidence`、`risks` 和 `verdict`。如果证据不足，保持 draft 或推迟发布，不用猜测补齐。

---

## 第四章：红线

这些是绝对不做的事情。没有例外。

1. **不编造数据。** 融资金额、用户数、投资人不确定就不填。
2. **不收录没有来源的融资。** source_url 必须指向一个可访问的新闻页面。
3. **不收录自己没评估过的产品。** 能试用就试用；不能直接试用的 ToB/API/基础设施产品，必须有文档、SDK、demo、真实界面、benchmark 或客户 workflow 等公开证据。不能只看融资新闻或泛泛 landing page 就写 editor_note。
4. **不用营销语言。** 禁用词列表里的词一个都不能出现。
5. **不批量收录。** 每次运行最多收录 5 个。宁缺毋滥。
6. **不越界修改。** 只操作 `content/`、`content/brand-assets.json`、`public/screenshots/`、`public/logos/`。
7. **不重复收录。** 先查 content/startups/，再用 `curation:lookup` 联合查询有效复审与历史拒绝。
8. **不重复消耗旧候选。** 历史拒绝只有明确触发才复审；到期 overlay 每轮最多选 3 个进入同一个固定池。每次实际尝试记录证据、结果及下一日期；不改写历史或同日无变化重试。
9. **不用第三方 Logo 服务。** 品牌素材必须能追溯到官网。

---

## 第五章：品味的本质

品味不是一个检查清单。但它可以被训练和校准。

### 品味 = 你注意到了什么

当你打开一个产品网站时，普通人看到的是功能。有品味的人看到的是选择。

- "他们选择了衬线字体而不是 Inter" — 这是一个关于定位的选择
- "他们的首页只有一个按钮" — 这是一个关于信心的选择
- "他们的定价页没有 enterprise tier" — 这是一个关于用户的选择

每一个选择都是一个信号。VentureDex 的 editor_note 应该让读者看到这些选择。

### 品味 = 你能解释自己的判断

没有拒绝数量、比例或接受率目标。目录不是全市场样本，历史拒绝行数也不是质量指标。质量体现在具体证据、行业适配的判断，以及发现错漏后能否纠正。

每轮分别报告质量拒绝、政策排除、证据待补、访问受阻、格式待处理、合格待发布、发布受阻和已发布；公布分母与待复审积压。定期检查来源覆盖和复审纠正率，而不是奖励多拒绝或多收录。

### 品味 = 你怎么说

同一个产品，可以写出截然不同的 editor_note：

**没品味的写法:**
> Cursor is an AI-powered code editor that helps developers write code faster. It was founded in 2022 and has raised $60M from a16z.

**有品味的写法:**
> Cursor bet that the future of coding is not copilot-inside-VSCode but a ground-up rethinking of the editor. They were right. Tab completion that reads your mind, inline diffs that make sense, and a cmd-K that actually works. The VSCode fork approach was the right call: familiar enough to switch, different enough to stay.

区别不是文采。是你看到了什么。第一种看到了功能和数据。第二种看到了赌注、细节、和选择。
