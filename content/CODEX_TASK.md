# VentureDex Codex 任务

**所有标准和流程见 `content/STANDARD.md`。**

本文件仅作为入口指引。STANDARD.md 是唯一的规范文档。

## 快速启动

```bash
# 1. 读标准（必须先读完再操作）
cat content/STANDARD.md

# 2. 搜索融资新闻
# 搜索近 30 天: "raises" "series" OR "seed" site:techcrunch.com

# 3. 对每个候选执行 STANDARD.md 第二章的 5 个 Stage

# 4. 创建/更新 content/startups/{slug}.json（含 funding 数组）

# 5. 截图
./scripts/screenshot.sh {slug} {url}

# 6. 验证
./scripts/validate.sh
./scripts/build-db.sh

# 7. 提交
git add content/startups/{slug}.json public/screenshots/{slug}.webp content/rejected.jsonl
git commit -m "content: add {Name}

Funding: {amount} {stage} from {lead} ({source})
Rating: {N}/5
Bet: {一句话赌注}"
git push
```

## 关键规则（详见 STANDARD.md 第四章）

- 没有来源的融资不收录
- 没试用过的产品不写 editor_note
- 禁用营销词汇
- 每次最多收录 5 个
- rejected:accepted 比例至少 3:1
