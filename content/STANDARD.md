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
2. **这个产品有工艺感。** 打开网站的前 10 秒你能感受到。字体、间距、文案、交互。粗糙的 landing page 背后几乎不会有精致的产品。
3. **这个产品解决了一个真实的、具体的问题。** 不是"让团队更高效"。是"让开发者在 issue tracker 里不再等 3 秒刷新"。越具体越好。

如果三个维度一个都不满足，不收录。即使它融了 $100M。

---

## 第二章：策展流程

每个收录从一条融资新闻开始，经过 5 个阶段到达发布。每个阶段都可能淘汰候选。

```
Stage 1: 发现 ──→ Stage 2: 初筛 ──→ Stage 3: 深度评估 ──→ Stage 4: 内容创作 ──→ Stage 5: 验证发布
   │                  │                    │                     │                    │
   │                  ↓                    ↓                     ↓                    ↓
   │              rejected.jsonl       rejected.jsonl         重写直到通过          自动验证
   │              (记录原因)           (记录原因)                                  build-db.sh
   ↓
 融资新闻
 TechCrunch
 Bloomberg
 The Information
```

### Stage 1: 发现

**输入**: 近 30 天的创业融资新闻。

**搜索方式**:
```
"raises" "seed" OR "series" site:techcrunch.com
"funding" "startup" site:bloomberg.com
```

**产出**: 10-20 个候选 URL。

**这个阶段不做判断**，只做收集。

### Stage 2: 初筛（60 秒/项目）

对每个候选，快速检查 4 个硬性条件。**任何一条不满足，立即淘汰并记录。**

| # | 条件 | 怎么检查 | 淘汰标准 |
|---|------|---------|---------|
| F1 | 产品可评估 | 打开官网、文档、demo、产品截图、API、SDK、案例或应用商店页 | 404、coming soon、纯 waitlist、纯概念页、只有泛泛营销文案且没有任何可检查的产品证据 |
| F2 | 独立公司 | 查公司背景 | 大公司子产品、内部工具、白标 |
| F3 | 阶段适配 | 看融资轮次、估值、公司状态 | 已上市、已被收购、非独立公司；普通项目优先 Seed-Series C，明星项目可走突破性项目例外 |
| F4 | 非排除品类 | 看产品内容 | 加密货币/NFT、赌博、成人、SEO 工具、模板商店、VPN 评测 |

**F1 不是"必须能无登录试用"。** ToB、API、基础设施、医疗、防务、金融等产品常常需要登录、SSO、合规审核或销售流程。只要有足够公开证据能判断产品本身，就可以进入深度评估。公开证据包括但不限于：开发者文档、API reference、SDK/GitHub、可运行 playground、录屏 demo、真实 UI 截图、应用商店页、benchmark、定价/用量页、客户案例中具体 workflow。登录墙或 demo CTA 本身不是淘汰理由；没有任何可检查的产品证据才淘汰。

**F3 不是"融资越多越该淘汰"。** VentureDex 默认偏早期，但可以收录突破性明星项目：即使是 Series D+、估值 > $10B、或融资金额很大，只要它仍是独立私有公司，并且产品赌注明确、公开证据充足、市场势能本身就是读者应该理解的信号，就可以继续评估。不能走例外的情况：已上市、已被收购、大公司部门、融资传闻未闭合、或者只是"融了很多钱"但产品判断站不住。

淘汰时记录到 `content/rejected.jsonl`：
```jsonl
{"slug":"bad-example","url":"https://bad.com","date":"2026-04-16","stage":"F2","reason":"Google subsidiary, not independent"}
```

通过初筛的候选进入 Stage 3。预期：10-20 个候选中，约 5-8 个通过初筛。

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
| **它有工艺感吗？** | 打开网站前 10 秒感觉"这个人在意" | 默认字体、默认颜色、"Empowering teams to..." |
| **它解决的问题具体吗？** | 你能说出一个人的名字（或角色）和他的痛点 | "帮助企业提升效率" — 无具体性 |

三问中至少 2 个通过才继续。0-1 个通过 → 淘汰。

淘汰时记录：
```jsonl
{"slug":"boring-saas","url":"https://boring.com","date":"2026-04-16","stage":"taste","reason":"No discernible bet. Generic SaaS dashboard, no craft signal. Solves 'team collaboration' with no specificity."}
```

**步骤 3.3: 交叉验证融资信息**

从融资新闻文章中提取以下信息，每一条都必须在原文中有明确出处：

| 字段 | 来源要求 | 如果找不到 |
|------|---------|-----------|
| 融资金额 | 原文明确提到的数字 | 不填 amount，标注 "undisclosed" |
| 融资轮次 | 原文明确标注 (Seed/Series A 等) | 必须有，否则不收录 |
| Lead investor | 原文提到的 lead 或第一个提及的投资方 | 不填，写 "undisclosed" |
| 日期 | 文章发布日期 | 必须有 |
| 来源 URL | 文章 URL | 必须有，没有来源不收录 |

**绝对规则：不编造。不确定的留空。来源不存在的不收录。**

通过 Stage 3 的项目进入 Stage 4。预期：5-8 个候选中，约 2-4 个通过。

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
    "producthunt": "只填产品页"
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
| 工艺品味 | 前 10 秒感觉"这个人在意" | 粗糙或模板化 | 看字体/间距/文案/交互 |
| 势能 | 近期被讨论/增长/融资 | 无明显动态 | 看 HN/Twitter/新闻 |

**is_featured 规则**: 总分 ≥ 4 且工艺品味 = 1。

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

```bash
./scripts/screenshot.sh {slug} {url}
```

截图上传到 R2，同时保存 `public/screenshots/{slug}.webp` 到 git。

### Stage 5: 验证与发布

**5.1 自动验证**

```bash
./scripts/validate.sh    # 结构和格式检查
./scripts/build-db.sh    # 生成 SQL，确认无语法错误
```

**5.2 提交**

每个项目单独 commit：

```
content: add {Product Name}

Funding: {amount} {stage} from {lead} ({source_name})
Rating: {N}/5 (dims: {list})
Bet: {一句话描述这个产品的赌注}
```

commit message 保持简洁。Gate check 清单不需要放在 commit 里（验证器已经做了）。重要的是把赌注写出来 — 如果你不能用一句话说出它的赌注，你还没有理解它。

**5.3 推送**

```bash
git push
```

GitHub Actions 自动执行验证 → D1 同步 → 部署。
一个文件同时更新首页卡片和 News 表格。

---

## 第三章：周刊

每周从已收录的项目中选 5-7 个组成 Weekly Picks。

### 选题标准

- rating ≥ 3
- 优先选最近新收录的
- 有一个主题线索把本期串起来（不是随机拼凑）
- 周刊标题是一个观点，不是一个分类名

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
  "editorial_intro": "2-3 句。为什么选这些项目？它们之间的共同点是什么？",
  "picks": ["slug1", "slug2", "slug3", "slug4", "slug5"]
}
```

---

## 第四章：红线

这些是绝对不做的事情。没有例外。

1. **不编造数据。** 融资金额、用户数、投资人不确定就不填。
2. **不收录没有来源的融资。** source_url 必须指向一个可访问的新闻页面。
3. **不收录自己没评估过的产品。** 能试用就试用；不能直接试用的 ToB/API/基础设施产品，必须有文档、SDK、demo、真实界面、benchmark 或客户 workflow 等公开证据。不能只看融资新闻或泛泛 landing page 就写 editor_note。
4. **不用营销语言。** 禁用词列表里的词一个都不能出现。
5. **不批量收录。** 每次运行最多收录 5 个。宁缺毋滥。
6. **不越界修改。** 只操作 `content/`、`content/brand-assets.json`、`public/screenshots/`、`public/logos/`。
7. **不重复收录。** 先查 content/startups/ 和 rejected.jsonl。
8. **不重复消耗旧候选。** rejected.jsonl 中的条目默认不再评估，除非有新一轮融资、新产品证据，或人类明确修改了使原拒绝理由失效的治理规则。
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

### 品味 = 你拒绝了什么

VentureDex 的品味不体现在收录了什么。体现在拒绝了什么。

如果 rejected.jsonl 的条目数少于 content/startups/ 的条目数，说明标准不够高。

目标比例：**每收录 1 个项目，至少拒绝 3 个。**

### 品味 = 你怎么说

同一个产品，可以写出截然不同的 editor_note：

**没品味的写法:**
> Cursor is an AI-powered code editor that helps developers write code faster. It was founded in 2022 and has raised $60M from a16z.

**有品味的写法:**
> Cursor bet that the future of coding is not copilot-inside-VSCode but a ground-up rethinking of the editor. They were right. Tab completion that reads your mind, inline diffs that make sense, and a cmd-K that actually works. The VSCode fork approach was the right call: familiar enough to switch, different enough to stay.

区别不是文采。是你看到了什么。第一种看到了功能和数据。第二种看到了赌注、细节、和选择。
