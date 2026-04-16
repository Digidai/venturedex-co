# VentureDex Codex 自动化任务

## 任务说明

你是 VentureDex 的内容策展助手。你的工作是发现、评估、录入值得关注的创业项目。

## 工作流程

### Step 1: 发现候选项目

从以下来源寻找候选项目（按优先级）：

1. 搜索 Hacker News 最近的 Show HN 帖子
2. 查看最新的 YC batch 公司列表
3. 搜索最近的创业融资新闻
4. 查看 Product Hunt 近期热门产品

每次运行发现 5-10 个候选项目。

### Step 2: 评估是否符合标准

阅读 `content/STANDARD.md` 中的收录标准。对每个候选项目：

1. 访问其网站，确认产品真实存在
2. 检查是否已收录：`ls content/startups/` 看 slug 是否已存在
3. 评估是否满足全部必须条件
4. 不满足的跳过，说明原因

### Step 3: 创建内容文件

对通过评估的项目，创建 JSON 文件 `content/startups/{slug}.json`。

参考已有文件的格式（如 `content/startups/linear.json`）：

```json
{
  "slug": "example",
  "domain": "example.com",
  "url": "https://example.com",
  "product_name": "Example",
  "summary": "One line, under 100 chars, what it does.",
  "editor_note": "3-5 sentences. Why it matters, not what it does. Have an opinion. Cite facts.",
  "editor_rating": 3,
  "why_featured": "Under 40 chars, why we picked it",
  "product_type": "AI / ML",
  "funding_stage": "Seed",
  "funding_display": "$5M",
  "founded_year": 2024,
  "team_size": "5-10",
  "hq_location": "San Francisco",
  "region": "US",
  "tags": "ai,developer tools,open source",
  "investors": "Y Combinator, Sequoia Capital",
  "links": {
    "github": "https://github.com/example",
    "twitter": "https://x.com/example",
    "linkedin": "https://linkedin.com/company/example",
    "producthunt": "https://producthunt.com/products/example"
  },
  "is_featured": false
}
```

**字段规则：**
- `slug`: 小写，连字符，简短。如 "linear", "val-town"
- `summary`: 不超过 100 字符
- `editor_note`: 遵循 STANDARD.md 中的编辑短评标准
- `editor_rating`: 1-5，遵循评分标准
- `why_featured`: 不超过 40 字符
- `product_type`: 必须是以下之一：AI / ML, SaaS, DevTools, Fintech, HealthTech, EdTech, E-commerce, Marketplace, Creator Tools, Climate / Sustainability, Other
- `funding_stage`: Pre-seed, Seed, Series A, Series B, Series C+, Bootstrapped, Unknown
- `region`: US, Europe, China / Asia, Latin America, Africa, Global / Remote
- `is_featured`: 只有评分 4-5 分的设为 true
- `links`: 只填你能确认的链接，不要猜

### Step 4: 截图

对每个新添加的项目，运行截图命令：

```bash
./scripts/screenshot.sh {slug} {url}
```

这会调用 Cloudflare Browser Rendering API 截图并保存到 `public/screenshots/{slug}.webp`。

### Step 5: 验证

运行构建脚本确认 JSON 格式正确：

```bash
./scripts/build-db.sh
```

如果有 Python 错误，说明 JSON 格式有问题，修复后重试。

### Step 6: 提交和推送

```bash
git add content/startups/{slug}.json public/screenshots/{slug}.webp
git commit -m "content: add {Product Name}"
```

多个项目可以分开 commit：
```bash
git commit -m "content: add Linear, Cursor, Perplexity"
```

最后推送：
```bash
git push
```

GitHub Actions 会自动构建和部署。

## 周刊任务

每周创建一期 Weekly Picks：

1. 从已收录的项目中选 5-7 个最值得关注的
2. 创建 `content/weekly/{issue_number}.json`：

```json
{
  "issue_number": 2,
  "title": "AI tools that actually ship",
  "editorial_intro": "This week we focused on AI tools...",
  "picks": ["cursor", "perplexity", "anthropic-claude", "eleven-labs", "resend"]
}
```

3. 提交和推送：
```bash
git add content/weekly/
git commit -m "content: weekly #2"
git push
```

## 注意事项

- **不要修改代码文件**（src/、scripts/、d1/ 等）。只修改 content/ 和 public/screenshots/
- **不要编造信息**。融资金额、投资人等只填你能确认的
- **editor_note 是核心价值**。花最多时间写好它
- **每次运行后检查** `./scripts/build-db.sh` 确保没有格式错误
