# VentureDex 内容标准

## 收录标准

### 必须满足（全部）
1. **有真实产品** — 有可访问的网站，不是纯概念或 landing page
2. **有明确的价值主张** — 一句话能说清楚做什么
3. **有用户或收入信号** — 已上线、有用户在用、或已获得融资
4. **非抄袭/山寨** — 有独立的产品思路，不是纯 clone

### 加分项（满足越多越好）
- 获得知名 VC 投资（YC、a16z、Sequoia 等）
- 技术方案有创新性
- 用户增长数据突出
- 创始团队有知名背景
- 开源且有社区活跃度
- 解决了一个被忽视的真实问题

### 明确排除
- 纯加密货币/NFT/meme 项目
- 赌博、成人内容
- 已关闭的项目（dead）
- 大公司的子产品（Google、Microsoft 内部工具等）
- 超过 Series D 的成熟公司（不再是 startup）

## 编辑短评标准 (editor_note)

### 必须包含
- 3-5 句话
- 说清楚这个产品 **为什么值得关注**，不是 **做什么**（summary 已经说了做什么）
- 有观点，不是中性描述
- 引用具体事实（融资金额、用户数、技术选型等）

### 风格
- 直接、有态度，像一个懂行的朋友推荐
- 不用营销语言（"革命性"、"颠覆"、"赋能"）
- 可以指出不足或风险
- 中英文均可，保持单篇一致

### 反面案例（不要这样写）
❌ "这是一个创新的 AI 产品，致力于为用户提供更好的体验。"
❌ "该公司获得了融资，发展前景广阔。"

### 正面案例
✅ "Linear is what happens when someone with taste builds project management. Every interaction feels considered. In a market drowning in feature-bloated tools, Linear chose speed and focus. That bet paid off."
✅ "Perplexity did what Google should have done five years ago: just answer the question. No ten blue links, no ads above the fold."

## why_featured 标签标准

- 最多 40 个字符
- 一个短语，不是句子
- 说明被选中的核心原因

### 示例
- "YC S26 batch"
- "Bootstrapped to $1M ARR"
- "Changed how developers code"
- "Open source done right"
- "The Google killer that might actually be"

## editor_rating 评分标准

| 分数 | 含义 | 标准 |
|------|------|------|
| 1 | 值得关注 | 有趣的想法，但产品/市场还在早期验证 |
| 2 | 有潜力 | 产品成型，有初步用户，方向对 |
| 3 | 推荐 | 产品好用，有增长，值得试用 |
| 4 | 强烈推荐 | 品类里的标杆，用过就不想换 |
| 5 | 必看 | 改变了一个领域的游戏规则 |

## 数据源优先级

1. **Hacker News Show HN** — 最高质量，开发者社区验证
2. **Y Combinator batch 列表** — 最有投资价值
3. **Product Hunt 首页** — 新品发现
4. **TechCrunch / The Information 融资新闻** — 融资信号
5. **GitHub Trending** — 开源项目
6. **Twitter/X 创业社区** — 口碑传播

## Codex 自动化规则

### 发现阶段
- 从以上数据源发现候选项目
- 自动抓取 URL 的 title、description
- 判断是否满足收录标准
- 不满足的直接跳过，不创建文件

### 内容生成阶段
- product_name: 从网站抓取，去掉多余后缀（"— The platform for..."）
- slug: 小写，连字符，最短可识别形式
- summary: 从 meta description 提取，限 100 字以内
- editor_note: 基于产品信息生成 3-5 句有观点的短评
- why_featured: 生成 40 字以内的标签
- editor_rating: 根据评分标准打分
- 其他字段: 尽可能从公开信息补充

### 质量检查
- editor_note 不能包含营销语言
- editor_note 必须有具体事实
- summary 和 editor_note 不能重复
- 所有 URL 必须可访问
- 截图必须成功

### 提交规则
- 每次 commit 只包含一个 startup 或一期 weekly
- commit message 格式: `content: add {name}` 或 `content: weekly #{n}`
- 不修改代码文件，只修改 content/ 目录和 public/screenshots/
