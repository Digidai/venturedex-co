# VentureDex 内容标准

## 一、收录门槛（Gate）

候选项目必须通过以下 **全部 7 道门槛** 才能收录。任何一道不通过即淘汰。

### Gate 1: 产品可用性
- 网站可访问（HTTP 200），不是 coming soon、waitlist、或 404
- 有可使用的产品（可注册/试用/下载），不是纯概念页
- **验证方式**: 访问 URL，确认首页有产品功能入口（Sign up / Try / Download / Docs）

### Gate 2: 独立实体
- 是独立公司或独立开源项目
- **排除**: 大公司子产品（Google Cloud 的某个功能）、内部工具外部化、白标产品
- **边界案例**: 从大公司 spin-off 的独立公司可以收录（如 Vercel 脱离 ZEIT）

### Gate 3: 阶段限制
- Pre-seed 到 Series C 之间，或 Bootstrapped
- **排除**: Series D+、已上市公司、估值超过 $10B 的公司
- **验证方式**: 查 Crunchbase 或融资新闻确认阶段

### Gate 4: 差异化
- 有独立的产品思路，不是现有产品的 UI 换皮
- 至少在一个维度上做到了品类内最好：体验、性能、价格、开放性
- **验证方式**: 能用一句话说出"它比 [竞品] 好在哪里"

### Gate 5: 牵引力证据（至少满足一项）
- 已获得机构融资（天使轮以上，有公开新闻来源）
- 被 YC / Techstars / 500 Global 等加速器录取
- GitHub 星标 > 1,000（开源项目）
- Product Hunt 日榜前 5
- Hacker News 首页帖子且评论 > 50
- 公开披露的用户/收入数据（MAU > 10,000 或 ARR > $100K）
- **验证方式**: 提供具体的来源链接

### Gate 6: 内容排除清单
以下类型一律不收录，无例外：
- 加密货币/NFT/Web3/DeFi 核心业务（区块链基础设施工具除外）
- 赌博、成人内容、烟草
- 武器、监控软件
- SEO 工具、link building 工具
- 模板市场、WordPress 主题商店
- VPN 评测/比价类聚合站
- 已关闭/无法访问的项目

### Gate 7: 查重
- `ls content/startups/` 确认 slug 未被占用
- 确认同一公司没有以其他名称/域名已被收录
- 确认同一产品的不同版本没有重复收录（如 app.example.com 和 example.com）

---

## 二、发现流程（Discovery）

### 数据源及抓取规则

| 来源 | 抓取方式 | 频率 | 候选数/次 |
|------|---------|------|-----------|
| HN Show HN | 搜索 Algolia API `search_by_date?tags=show_hn&numericFilters=points>50` | 每次运行 | 最多 10 |
| YC Batch | 访问 ycombinator.com/companies，按最新 batch 筛选 | 每季度 | 最多 20 |
| Product Hunt | 访问首页，筛选近 7 天 upvotes > 200 的产品 | 每次运行 | 最多 5 |
| 融资新闻 | 搜索 "startup raised" site:techcrunch.com 近 30 天 | 每次运行 | 最多 5 |
| GitHub Trending | 访问 github.com/trending，筛选近 1 周新增星标最多的项目 | 每次运行 | 最多 5 |

### 候选评估流程

对每个候选项目，按顺序执行 Gate 1-7。**一旦某道 Gate 不通过，立即停止，记录淘汰原因到 `content/rejected.jsonl`**：

```jsonl
{"slug":"example","url":"https://example.com","rejected_at":"2026-04-16","gate":"3","reason":"Series E, valued at $15B"}
```

只有全部 7 道 Gate 通过的项目才进入内容生成阶段。

---

## 三、评分标准（Rating）

### editor_rating 量化标准

每个维度 0 或 1 分，总分即为 rating：

| 维度 | 1 分条件 | 0 分条件 |
|------|---------|---------|
| **产品完成度** | 核心功能完整可用，非 beta 标签遍地 | 明显半成品，功能缺失 |
| **市场验证** | 有付费用户/融资/$1M+ ARR/大量活跃用户 | 只有 landing page 和 waitlist |
| **差异化强度** | 品类内明显领先的某个维度 | 和竞品没有明显区别 |
| **技术品味** | 产品体验精致，细节考究 | 粗糙，明显是快速拼凑 |
| **趋势势能** | 正在被讨论/增长/融资/被大量引用 | 无明显增长势头 |

**总分 = 5 个维度得分之和（1-5）。**

- 1 分: 有一个维度突出
- 2 分: 有两个维度突出
- 3 分: 三个维度突出，推荐收录
- 4 分: 四个维度突出，强烈推荐
- 5 分: 五个维度全部满足，必看

**is_featured 规则**: 只有 rating >= 4 才能设为 `true`。

---

## 四、编辑短评标准（editor_note）

### 结构要求

3-5 句话，按以下结构：

1. **Hook（第 1 句）**: 一个有态度的判断。不是"这是什么"，而是"为什么它不一样"。
2. **Evidence（第 2-3 句）**: 用具体事实支撑判断。数据、技术选型、产品决策。
3. **Insight（第 4-5 句）**: 你的洞察。风险、机会、或一个大多数人没注意到的角度。

### 必须包含
- 至少 1 个可验证的具体事实（融资金额/用户数/技术决策/竞品对比）
- 至少 1 个有争议的观点（不是所有人都会同意的判断）

### 必须避免
- 第一句以产品名开头（"Linear is..."，应该用描述性开头）
- 营销词汇：革命性、颠覆、赋能、一站式、全方位、下一代
- 空洞形容词：创新的、强大的、高效的、出色的
- 模板句式："致力于..."、"旨在..."、"提供了..."

### 自动检测规则（Codex 必须自查）

生成 editor_note 后，检查以下条件。任何一条不通过必须重写：

```
CHECK 1: 字数在 150-500 字符之间
CHECK 2: 不包含以下词汇：革命, 颠覆, 赋能, 一站式, 下一代, innovative, revolutionary, comprehensive, robust, cutting-edge, game-changing, best-in-class
CHECK 3: 包含至少一个数字（融资金额、用户数、年份、百分比）
CHECK 4: 第一句不以产品名开头
CHECK 5: 不与 summary 字段有 > 50% 的词汇重叠
CHECK 6: 包含至少一个比较或对比（"比...更"、"不像...而是"、"而...选择了"）
```

---

## 五、why_featured 标签标准

- 最多 40 个字符（英文）或 20 个字符（中文）
- 一个短语，不是句子
- 必须具体，不能泛泛

### 通过标准

✅ "YC S26 batch"
✅ "Bootstrapped to $1M ARR"
✅ "$400M Series B at age 2"
✅ "10K GitHub stars in 6 months"

### 不通过标准

❌ "Great product" — 太笼统
❌ "AI startup" — 只是分类，不是理由
❌ "Worth watching" — 废话
❌ "Innovative approach" — 营销语言

---

## 六、数据准确性规则

### 必须可验证的字段
以下字段如果填写，必须有公开来源可查：
- `funding_stage` + `funding_display`: 来源为 Crunchbase、TechCrunch 或官方公告
- `investors`: 来源为融资新闻或公司官网
- `founded_year`: 来源为 Crunchbase 或 LinkedIn 公司页
- `team_size`: 来源为 LinkedIn 公司页（取范围值）

### 不确定就不填
以下字段在无法确认时必须留空（空字符串或不填），**绝对不能猜测**：
- `funding_display` — 宁可只写 stage 不写金额
- `investors` — 宁可不填不能瞎编
- `links.github` / `links.twitter` — 只填官方账号，不填个人账号

### links 验证规则
每个 link 必须是该公司/产品的官方页面：
- `github`: 组织页（github.com/linear），不是创始人个人页
- `twitter`: 产品官方账号（@linear），不是创始人个人账号
- `linkedin`: 公司页（linkedin.com/company/linear）
- `producthunt`: 产品页（producthunt.com/products/linear）

---

## 七、提交前检查清单（Codex 必须逐项确认）

每个新条目提交前，Codex 必须在 commit message 中附带以下检查结果：

```
content: add {Product Name}

Gate check:
- [x] G1 产品可用: URL 返回 200，有注册/试用入口
- [x] G2 独立实体: 独立公司
- [x] G3 阶段合格: {Series A}
- [x] G4 差异化: {比 X 好在 Y}
- [x] G5 牵引力: {具体证据，如 "YC S26" 或 "GitHub 5K stars"}
- [x] G6 非排除类: 不在排除清单中
- [x] G7 未重复: slug 不存在

Quality check:
- [x] Q1 editor_note 150-500 字符
- [x] Q2 无营销词汇
- [x] Q3 包含具体数字
- [x] Q4 首句不以产品名开头
- [x] Q5 与 summary 不重复
- [x] Q6 包含比较/对比
- [x] Q7 截图成功
- [x] Q8 build-db.sh 通过

Rating: {N}/5 ({通过的维度列表})
```
