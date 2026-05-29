# VentureDex 产品设计文档

> 日期：2026-04-12  
> 状态：Draft v1（**已被产品转向取代，见下方更新说明**）  
> 产品：`venturedex.co`  
> 目标：基于 `startups.gallery` 的研究框架，设计 VentureDex 的完整产品功能、用户流程、数据流程、Cloudflare 架构与本地 Codex 自动化方案  
> 说明：用户原始表述中的 `Cloudfare` 下文统一更正为 `Cloudflare`

> **更新（2026-05-29）：产品已转向，本文档定位已过时。**
> 本文档把 VentureDex 设计为「公开可发现的 Cloudflare 原生产品索引 + 证据信号」。
> 但**实际上线的产品是「精选初创公司目录」**：以 `content/startups/*.json` 为单一可信源，
> 提供编辑点评、融资信号、投资人页与每周研究简报（weekly），并不收录/验证 Cloudflare 部署信号。
> 因此本文档第 2 节起的「产品定义/边界/Codex 证据化索引」等内容**不代表当前实现**，仅作历史设计参考。
> 后续重写定位时，请以实际代码（`src/`、`content/`、`docs/newsletter.md`）为准。

---

## 1. 文档目标

本文档定义 VentureDex 的第一性原则、产品边界、全部核心功能、关键用户流程、Cloudflare 部署方案，以及“使用本地 Codex 自动化执行更新”的运营控制面设计。

本文档不是营销文案，也不是实现任务拆单。它的作用是：

1. 明确 VentureDex 到底是什么，不是什么。
2. 让设计、工程、运营对同一套产品模型达成一致。
3. 为后续 UI 设计、数据库建模、Cloudflare 部署、Codex 自动化和内容运营提供统一规格。

---

## 2. 产品定义

### 2.1 一句话定义

**VentureDex 是一个“公开可发现的 Cloudflare 原生产品索引与精选目录”。**

### 2.2 对外定位

推荐对外定位：

> The public index of products built on Cloudflare.

中文可用：

> 公开可发现的 Cloudflare 原生产品索引。

### 2.3 产品边界

VentureDex 不做：

- “收录所有使用 Cloudflare CDN/WAF 的网站”
- “承诺全网 100% 完整”
- “通用 technographics 数据销售平台”

VentureDex 要做：

- 收录可验证的 `Pages`、`Workers`、`pages.dev`、`workers.dev` 相关站点
- 对站点做证据化标注，而不是黑盒判断
- 在索引之上提供高可读的精选、专题和研究内容

### 2.4 产品原则

1. **Evidence-first**：每个站点都必须附带可解释的 Cloudflare 信号。
2. **Public-index, not complete-index**：不承诺全量，只承诺公开可发现和持续更新。
3. **Index + Curated 双层结构**：底层做索引，上层做精选。
4. **Cloudflare-native**：对用户公开的运行面和数据面全部部署在 Cloudflare。
5. **Codex-operated**：发现、验证、补录、分类、复查由本地 Codex 自动化执行。

---

## 3. 用户与使用场景

### 3.1 核心用户画像

#### A. Builder / Indie Hacker / Startup Founder

诉求：

- 看别人如何在 Cloudflare 上搭建产品
- 找设计、技术、信息架构灵感
- 获取同类产品列表和竞品案例

#### B. DevTools / Infra / Agency 团队

诉求：

- 找使用 Cloudflare 的潜在客户
- 识别迁移到 Workers / Pages 的公司
- 做生态 BD、销售、合作研究

#### C. 投资 / 研究 / 分析人员

诉求：

- 找 Cloudflare 生态中的优质产品
- 观察某个垂类中谁在用 Cloudflare
- 看近期活跃项目、新增项目、迁移趋势

#### D. Cloudflare 生态内容读者

诉求：

- 通过专题和研究页快速理解生态变化
- 订阅每周精选和最新收录

### 3.2 核心使用场景

1. 用户浏览首页，按部署类型和产品类别发现站点。
2. 用户在某个站点详情页查看“为什么它被判定为 Cloudflare-native”。
3. 用户按专题集合查看一组高质量案例，如 AI、DevTools、Pages、Workers。
4. 用户搜索某个产品或域名，看是否已收录。
5. 用户提交一个自己或他人的站点，进入待验证队列。
6. 运营通过本地 Codex 周期性发现、复查、分类并发布更新。

---

## 4. 成功指标与非目标

### 4.1 MVP 成功指标

上线后 90 天内：

- 收录 `500 - 2,000` 个高置信站点
- 首页和详情页 Lighthouse 移动端性能 > 85
- 站点详情页的证据卡覆盖率 > 95%
- 每周稳定新增或更新 20+ 条记录
- 形成至少 8 个可索引专题页
- 首批 newsletter 订阅 > 300

### 4.2 北极星指标

**高质量已验证条目数 x 周活跃浏览用户数**

原因：

- 只有数据在持续增长且质量足够，目录才有护城河
- 只有用户真的回来逛，精选和研究模块才有价值

### 4.3 非目标

MVP 阶段不做：

- 用户登录系统
- 收藏夹和私人工作台
- 评论系统
- 自动对外开放 API
- 大规模付费 lead export
- 实时浏览器内全网搜索引擎

---

## 5. 信息架构

### 5.1 顶层导航

推荐主导航：

- `Explore`
- `Collections`
- `Research`
- `Submit`

右侧次级入口：

- `Subscribe`
- `Sponsor`

### 5.2 页面结构总览

| 页面 | 路径 | 作用 |
|------|------|------|
| 首页 | `/` | 探索、筛选、发现 |
| 站点详情页 | `/sites/{slug}` | 展示单个产品、证据与快照 |
| 集合页 | `/collections/{slug}` | 展示某一专题的站点列表 |
| 研究页列表 | `/research` | 文章索引 |
| 研究详情页 | `/research/{slug}` | 深度文章 |
| 搜索结果页 | `/search` | 域名/产品/标签搜索 |
| 提交页 | `/submit` | 站点提交 |
| 订阅页 | `/subscribe` | 邮件订阅 |
| 赞助页 | `/sponsor` | 广告/赞助说明 |
| 运营后台 | `https://ops.venturedex.co/*` | Cloudflare Access 保护，仅内部使用 |

说明：

- 公开站点仅运行在 `venturedex.co`
- 人工运营后台和机器写入接口统一运行在 `ops.venturedex.co`
- 下文中出现的 `/api/ops/*` 为 `ops.venturedex.co` 下的路径示例

### 5.3 站点分类体系

#### 按部署类型

- Pages
- Workers Static
- Workers App
- Hybrid
- Unknown / Under Review

#### 按产品类型

- AI
- SaaS
- DevTools
- E-commerce
- Open Source
- Other

### 5.4 MVP 收录范围

MVP 首批只收录**产品站**，也就是以产品、服务、工具、应用为主体的网站。

明确纳入：

- AI
- SaaS
- DevTools
- E-commerce
- Open Source product sites

明确排除到后续阶段：

- 纯文档站
- 个人主页 / 作品集
- 单纯媒体站
- 纯社区入口页

只有在 Phase 3 之后，才评估是否扩展到更宽的“Cloudflare-built properties”。

#### 按置信等级

- A: 强验证
- B: 高概率
- C: 中概率
- D: 待人工确认

#### 按站点可用性

- Live
- Redirect
- Parked
- Dead

#### 按工作流状态

- Discovered
- Validating
- Enriched
- Review Required
- Approved
- Publish Requested
- Published
- Recheck Scheduled
- Rejected
- Duplicate
- Unpublished
- Archived

---

## 6. 核心功能设计

## 6.1 首页 Explore

### 目标

让用户最快看到：

- 值得逛的 Cloudflare 产品
- 最近新增或最近变化的条目
- 可按结构化条件快速筛选

### 页面结构

```
Nav
├── Hero
│   ├── H1
│   ├── Subheading
│   └── Primary CTA: Explore latest
├── Activity Strip
│   └── Recently added / recently migrated / recently updated
├── Route-backed section links
│   ├── Explore
│   ├── Collections
│   └── Research
├── Filter Bar
│   ├── Deployment
│   ├── Product Type
│   ├── Confidence
│   ├── Region
│   └── Search
├── Card Grid
│   └── Site cards
├── Load More / Pagination
└── Footer
```

说明：

- 这里的 `Explore / Collections / Research` 不是页面内状态 tabs
- 它们是顶层路由的可视化快捷入口，行为与主导航一致
- 首页是 `Explore` 的公开入口页，不承担单页式多视图切换

### 卡片字段

- 产品名
- 域名
- 一句话描述
- 首页截图
- `Pages / Workers / Hybrid` 标识
- 产品类型标签
- 置信度标签
- 最近检测时间

### 交互规则

- 桌面端支持左侧或顶部筛选
- 移动端用抽屉式 Filter
- 筛选更新 URL query params，支持分享
- 排序默认 `featured + recent`
- 次级排序可选 `newest`, `most viewed`, `highest confidence`

### 设计继承自 `startups.gallery` 的点

- 首页本身就是主体验，不做 landing page
- 顶部有可滚动的动态条，但内容从融资新闻改为产品动态
- 卡片网格是第一屏之后的主体
- 筛选不只做 UI 装饰，必须对应结构化数据

---

## 6.2 站点详情页

### 目标

详情页必须回答三个问题：

1. 这是什么产品？
2. 为什么判定它和 Cloudflare 有关？
3. 这条记录最近发生了什么变化？

### 页面结构

```
Nav
├── Hero Screenshot
├── Site Header
│   ├── Product Name
│   ├── Domain
│   ├── Deployment badge
│   └── Visit Site
├── Summary
├── Evidence Panel
│   ├── Detected signals
│   ├── Confidence tier
│   └── Last checked
├── Metadata Row
│   ├── Product Type
│   ├── Region
│   ├── Framework
│   ├── Status
│   └── First seen
├── Snapshot History
├── Related Sites
└── Footer
```

### Evidence Panel 设计

这是 VentureDex 的核心差异化模块。

至少展示：

- 证据信号类型
- 原始值
- 发现时间
- 信号权重

示例：

- `CNAME -> xyz.pages.dev`
- `workers.dev hostname detected`
- `Cloudflare zone managed`
- `Headers indicate Cloudflare edge`
- `Imported from BuiltWith and locally revalidated`

### Snapshot History

展示最近 3-10 次快照摘要：

- 标题变化
- 描述变化
- 截图变化
- 状态变化
- 部署类型变化

### Related Sites

按以下优先级推荐：

1. 同部署类型
2. 同产品类型
3. 同框架
4. 同地区

---

## 6.3 Collections 集合页

### 目标

集合页承担 SEO、策展和增长三件事。

### 典型集合

- `/collections/pages`
- `/collections/workers`
- `/collections/ai`
- `/collections/devtools`
- `/collections/new-this-week`
- `/collections/high-confidence`
- `/collections/china`
- `/collections/indie`

### 页面结构

```
Nav
├── Collection Header
│   ├── Title
│   ├── Intro copy
│   └── Meta stats
├── Optional Editorial Note
├── Card Grid
├── Pagination
└── Footer
```

### 规则

- 每个集合页必须有独立 title / description / H1
- 集合既可以自动生成，也可以人工置顶精选条目
- URL 和文案必须稳定，可长期被搜索引擎收录

---

## 6.4 Research 研究模块

### 目标

让 VentureDex 不只是目录，而是 Cloudflare 生态研究入口。

### 内容类型

- 生态趋势文章
- 迁移案例拆解
- 分类榜单
- 数据分析周报
- “本周新增产品”精选

### 页面设计

研究列表页：

- 卡片式文章列表
- 支持按主题筛选

文章详情页：

- 封面图
- 目录
- 正文
- 相关站点引用卡片
- 相关集合

### 与数据层联动

研究文章应能嵌入：

- 站点卡片
- 集合统计
- 最近变化榜单

这要求 CMS 或内容层支持引用结构化记录。

---

## 6.5 搜索

### 搜索目标

MVP 搜索只覆盖 `sites` 实体，支持用户按以下维度查找站点：

- 产品名
- 域名
- 标签
- 框架
- 部署类型

MVP 不承诺统一检索 `collections` 和 `research`。这两个实体继续通过导航、集合页和文章索引访问。

Phase 3 再扩展为跨站点、集合、研究内容的全局搜索。

### 搜索体验

- 顶部全局搜索框
- 结果页支持 site-level facet filtering
- 命中时高亮：
  - name
  - domain
  - summary
  - tags

### MVP 搜索方案

使用 D1 + 预计算搜索索引表完成：

- 规范化域名和产品名字段的精确匹配
- 前缀匹配
- 基于预计算 token / n-gram 表的弱模糊召回
- 标签过滤

MVP 不假设 D1 存在额外的全文或 trigram 扩展能力。  
如果后期查询压力增大，再增加专门搜索服务或独立搜索索引。

---

## 6.6 Submit 提交页

### 目标

让用户提交未收录站点，同时不让低质量垃圾数据污染主库。

### 提交字段

- Site URL
- Product name
- One-line description
- Claimed deployment type
- Submitter email
- Optional notes

### 校验规则

- 必填 URL
- 去重：已存在则提示
- 使用 Turnstile 防刷
- 提交后进入 `submission_queue`

### 用户流程

1. 用户填写表单
2. 前端调用提交 API
3. D1 以 `submission_key` 和 canonical 规则入队，重复提交不生成新工作项
4. 队列记录进入待验证状态，并带 lease / attempt 元数据
5. 本地 Codex 在下一轮任务中先 claim queue item，再处理

### 结果反馈

- 成功页不承诺收录
- 提示“公开可发现并通过验证后才会发布”

---

## 6.7 Subscribe 订阅页

### 目标

建立可持续的回访和分发渠道。

### 订阅内容

- 本周新增产品
- 本周迁移观察
- 本周高质量案例

### 字段

- Email
- Optional interests

### 规则

- 支持 double opt-in
- 支持按主题偏好分组
- 支持从集合页局部订阅

---

## 6.8 Sponsor 赞助页

### 目标

在不破坏产品调性的前提下建立收入入口。

### 可售资源

- 首页 Featured placement
- Collection sponsor
- Newsletter sponsor
- Research article sponsor

### 页面内容

- 当前流量和增长指标
- 赞助位说明
- 展示位置
- 可售周期
- 联系方式或表单

---

## 6.9 内部运营后台 Ops

### 目标

给内部运营和 Codex 自动化使用，不对公众开放。

### 访问方式

- Cloudflare Access 保护
- 仅允许指定邮箱 / 身份组

### 模块

- `ops/submissions`
- `ops/review`
- `ops/jobs`
- `ops/publish`
- `ops/reports`
- `ops/settings`

### 能力

- 查看待验证条目
- 审核 Codex 生成的摘要和标签
- 手动覆盖部署类型和置信度
- 触发重抓、重截图、重分类
- 发布到主站

### 权限边界

#### Human ops

- 通过 Cloudflare Access 登录 `ops.venturedex.co`
- 可以审批、拒绝、撤回、归档、执行发布
- 可以对记录做人工覆盖和重跑

#### Local Codex

- 不登录人工后台
- 只调用机器接口
- 默认只能执行发现、验证、补充、截图请求、发布请求
- 不能直接执行 destructive publish / unpublish / archive

---

## 7. 用户流程设计

## 7.1 访客发现流程

1. 用户进入首页。
2. Hero 明确说明站点定位。
3. 用户浏览 Recently Added 条或首屏精选卡片。
4. 用户通过 Deployment / Product Type / Confidence 筛选。
5. 用户打开详情页。
6. 用户查看证据卡和相关产品。
7. 用户继续探索集合页或订阅更新。

成功标准：

- 用户在 30 秒内理解产品价值
- 2 次点击内进入详情页
- 详情页停留时间显著高于列表页

## 7.2 搜索流程

1. 用户在全局搜索框输入域名或产品名。
2. 系统返回实时建议。
3. 用户进入搜索结果页。
4. 用户按类型和置信度继续筛选。
5. 用户打开详情页。

异常流程：

- 无结果时展示“提交该站点”
- 模糊命中时优先显示高置信条目

## 7.3 提交流程

1. 用户打开 `/submit`
2. 填写基本信息并通过 Turnstile
3. 表单提交到 API
4. 后端入库到 `submission_queue`
5. 用户收到成功反馈
6. 本地 Codex 在计划任务中消费该队列
7. 审核通过后自动或半自动发布

## 7.4 研究阅读流程

1. 用户在首页或集合页点击某篇 Research
2. 进入文章详情页
3. 文章内嵌相关站点卡片
4. 用户跳转至详情页或集合页
5. 用户订阅 newsletter

## 7.5 赞助询盘流程

1. 潜在赞助方打开 `/sponsor`
2. 查看产品指标和位置说明
3. 提交联系信息
4. 记录进入 `sponsor_leads`
5. 本地 Codex 汇总每周 sponsor lead report

---

## 8. 本地 Codex 自动化流程

### 8.1 设计目标

用户明确要求“自动化的更新使用本地的 Codex 来执行”。  
因此 VentureDex 的更新链路采用：

- **产品运行面**：Cloudflare
- **运营控制面**：本地 Codex

### 8.2 架构原则

这不是“部分部署在 Cloudflare，部分部署在别的云”。  
而是：

- 用户访问、页面渲染、API、数据库、对象存储、队列全部在 Cloudflare
- 本地 Codex 只是一个受信任的外部操作员，负责周期性执行发现、验证、分类和发布动作

### 8.3 Codex 自动化职责

#### Job A：Discovery

输入：

- `pages.dev` 种子列表
- 第三方 technographic 导入
- submission queue
- 上一轮未完成记录

输出：

- 新候选站点写入 `sites`，状态为 `Discovered`

#### Job B：Validation

动作：

- DNS 查询
- 响应链抓取
- 证据信号提取
- 可达性检测

输出：

- 生成 signal records
- 给出 `deployment_type`
- 给出 `confidence_tier`

#### Job C：Enrichment

动作：

- 抓取 title / description / OG image
- 生成一行摘要
- 分类标签
- 截图任务入队

输出：

- 完整 site profile

#### Job D：Screenshot Refresh

动作：

- 请求 Cloudflare Browser Rendering 或站内 screenshot worker
- 将截图存入 R2
- 计算 screenshot hash

#### Job E：Review & Publish

动作：

- 生成 `publish_request`
- 对低置信、冲突、submission 来源条目强制人工复核
- 对高置信非 submission 条目，可由**服务端策略引擎**自动批准
- 只有收到 approval token 的发布执行器才能真正写入 published state

#### Job F：Weekly Research Digest

动作：

- 汇总本周新增
- 汇总迁移变化
- 生成研究草稿和 newsletter 草稿

### 8.4 调度方式

推荐由 Codex 本地 automations 执行：

- 每 6 小时：Discovery + Validation
- 每天：Enrichment + Screenshot Refresh
- 每周：Research Digest + QA Review

MVP 截图和刷新节奏必须带预算上限：

- 不做“全站每日截图刷新”
- 每日只处理：
  - 新收录站点
  - 首页精选站点
  - 检测到首页内容变化的站点
- 默认上限：`150` 个截图任务/天
- 单轮并发上限：`10`
- 超限时自动顺延到下一轮
- Browser Rendering 使用 Workers Paid plan，不按 Free plan 设计

### 8.5 Codex 执行输入输出规范

每个自动化任务必须：

- 只做单一职责
- 产生结构化输出
- 写回 Cloudflare API，而不是直接改线上页面文件
- 自带 `idempotency_key`
- 能被安全重试

推荐输出格式：

```json
{
  "job": "validation",
  "run_at": "2026-04-12T12:00:00Z",
  "idempotency_key": "validation:site_123:2026-04-12T12",
  "site": "example.com",
  "deployment_type": "pages",
  "confidence_tier": "A",
  "signals": [
    {
      "type": "cname_pages_dev",
      "value": "example.pages.dev",
      "weight": 95
    }
  ],
  "status": "publishable"
}
```

### 8.6 人工介入点

本地 Codex 自动化不是无条件自动发布。

以下情况必须进入人工复核：

- 同一站点被判定为多个部署类型
- 置信度低于 B
- 站点状态不稳定
- 截图失败或结构异常
- 摘要与标题明显冲突
- 所有 submission 来源的候选
- 所有 publish / unpublish / archive 动作

### 8.7 截图任务的自动化边界

Codex 不在本机直接保存生产截图，也不把截图文件直接写入线上仓库。  
Codex 的职责是：

1. 判定哪些站点需要截图或重截图
2. 调用 VentureDex 内部截图请求 API
3. 记录任务状态与回执

真正截图由 Cloudflare 内部任务完成。

推荐接口：

- `POST /api/ops/screenshots/request`

请求体：

```json
{
  "site_id": "site_123",
  "url": "https://example.com",
  "mode": "detail",
  "reason": "first_capture",
  "priority": "normal"
}
```

响应体：

```json
{
  "accepted": true,
  "job_id": "shot_456",
  "idempotency_key": "screenshot:site_123:detail:example.com",
  "queued_at": "2026-04-12T16:00:00Z"
}
```

### 8.8 异步编排所有权

为避免重复执行，异步系统按职责硬切分：

- **Workflows**：拥有候选站点从 `Discovered -> Published` 的多步编排
- **Queues**：只负责 fan-out 型、可重试的边缘任务，例如截图、低优先级刷新、通知
- **Queue consumer**：不得直接改变最终发布状态，只能写入中间产物或回执
- **Publish executor**：只能由带 approval token 的服务调用

每一类任务都必须有唯一键：

- `submission_key`
- `publish_request_id`
- `screenshot idempotency_key`
- `workflow run key`

---

## 9. Cloudflare 系统架构

## 9.1 高层架构

```
Browser
  │
  ▼
Cloudflare Worker App
  ├── SSR / API Routes
  ├── Search / Filter / Submit
  ├── Access-protected Ops routes
  │
  ├── D1 (primary metadata store)
  ├── R2 (screenshots, article assets)
  ├── KV (eventual-consistent public read caches only)
  ├── Durable Objects (locks, leases, hot counters when needed)
  ├── Queues (screenshot and fan-out refresh jobs)
  ├── Workflows (candidate ingestion and publish-request orchestration)
  ├── Browser Rendering (screenshots / scrape actions)
  └── Analytics / Logs / Metrics

Local Codex
  └── Calls secure ingestion/publish APIs on Worker App
```

## 9.2 技术选型

### 前端与 API

- 运行时：Cloudflare Workers
- 前端：Astro 或 Next.js 静态输出后接 Workers
- 建议：**Astro + Workers** 作为 MVP，原因是内容型站点足够轻，复杂度更低

### 数据层

- 主数据库：D1
- 对象存储：R2
- 缓存：KV（只存 eventual-consistent read cache）
- 协调：Durable Objects（lease、lock、热计数可选）
- 异步任务：Queues（只做 fan-out work）
- 长流程编排：Workflows（只做主工作流）

### 抓取与截图

- Cloudflare Browser Rendering

### 安全与运营

- Cloudflare Access 保护内部路由
- Turnstile 保护提交表单
- Web Analytics 观察公开流量

## 9.3 为什么不是 Pages-only

虽然 Pages 可以承载静态站，但 VentureDex 不是纯展示页。它还需要：

- 提交 API
- 运营后台
- 数据发布 API
- 异步截图和处理任务
- 与本地 Codex 的安全写入接口

因此主运行时应为 Workers，静态资源使用 Workers Assets。

## 9.4 推荐运行模式

### Public app

- `venturedex.co`
- 公开页面
- 公开 site search
- 公开详情页

### Internal ops app

- `ops.venturedex.co`
- 仅通过 Cloudflare Access 访问
- 审核、发布、重跑任务
- `POST /api/ops/*` 机器接口

---

## 9.5 截图生成设计

### 目标

为每个站点生成稳定、可复检、可缓存的视觉快照，并将截图流程控制在 Cloudflare 内部完成。

### 方案选择

优先使用 Cloudflare Browser Rendering Quick Actions：

- `/screenshot`：生成截图
- `/snapshot`：同时返回 HTML 内容和 Base64 截图

推荐默认策略：

- **详情页首张图**：优先 `/snapshot`
- **普通刷新任务**：优先 `/screenshot`

原因：

- `/snapshot` 适合首次收录时同时落视觉和结构快照
- `/screenshot` 更适合日常刷新，负载更轻

### 截图任务流

```
Local Codex
  -> POST /api/ops/screenshots/request
  -> Worker writes Queue message
  -> Screenshot Worker consumes Queue
  -> Browser Rendering Quick Action
  -> Write image to R2
  -> Update D1 sites + site_snapshots
```

截图请求必须是幂等的：

- 相同 `site_id + mode + canonical_url + content_version`
- 在去重窗口内只允许创建一个活跃 job

### 默认截图参数

```json
{
  "url": "https://example.com",
  "viewport": {
    "width": 1440,
    "height": 900,
    "deviceScaleFactor": 2
  },
  "screenshotOptions": {
    "fullPage": true,
    "type": "webp"
  },
  "gotoOptions": {
    "waitUntil": "networkidle0",
    "timeout": 45000
  }
}
```

说明：

- 对 JavaScript-heavy 站点，使用 `waitUntil: networkidle0`
- 大视口时提高 `deviceScaleFactor`，避免模糊
- 默认输出 `webp`，减小 R2 存储体积

### R2 Key 规范

推荐目录结构：

```text
screenshots/
  {site_id}/
    latest.webp
    {yyyy}/{mm}/{dd}/{timestamp}.webp

snapshots/
  {site_id}/
    {timestamp}.html
```

### 数据写回规则

成功后更新：

- `sites.screenshot_r2_key`
- `sites.screenshot_hash`
- `sites.last_checked_at`
- `site_snapshots` 新增一条记录

如果使用 `/snapshot`，额外写入：

- `site_snapshots.description`
- `site_snapshots.html_r2_key`
- `site_snapshots.runtime_status`
- `site_snapshots.workflow_status`
- `site_snapshots.deployment_type`
- `site_snapshots.confidence_tier`
- `site_snapshots.diff_summary`（后续异步生成）

注意：

- `headers_json` 来自 Validation 阶段的独立 HTTP 抓取结果，不来自 `/snapshot` 响应本身
- `/snapshot` 负责返回渲染后的 HTML 与截图

### 失败与重试策略

- 首次失败：自动重试 2 次
- 连续失败：标记 `screenshot_status = failed`
- 失败不阻塞站点发布，但降低首页推荐优先级
- 对高价值站点进入人工复核列表

### 重要限制

Browser Rendering 请求会被目标网站识别为 bot，请不要把截图链路设计成“必须 100% 成功”的硬依赖。  
因此详情页需要支持以下降级：

- 无截图时展示占位图
- 显示 “visual capture unavailable”
- 仍然保留结构化证据卡和文本摘要

---

## 10. 数据模型

## 10.1 表：sites

| 字段 | 类型 | 说明 |
|------|------|------|
| id | text/uuid | 主键 |
| site_key | text | 稳定身份键，用于去重和合并 |
| slug | text | URL slug |
| domain | text | registrable domain / apex domain |
| canonical_hostname | text | 公开主身份 hostname |
| canonical_url | text | 公开主身份 URL |
| product_name | text | 产品名 |
| title | text | 当前页面标题 |
| summary | text | 一句话描述 |
| long_description | text | 长描述 |
| deployment_type | text | pages / workers-static / workers-app / hybrid / unknown |
| confidence_tier | text | A / B / C / D |
| runtime_status | text | live / redirect / parked / dead |
| workflow_status | text | discovered / validating / enriched / review_required / approved / publish_requested / published / recheck_scheduled / rejected / duplicate / unpublished / archived |
| framework | text | 可选 |
| region | text | 可选 |
| product_type | text | 主分类 |
| screenshot_r2_key | text | 截图路径 |
| screenshot_hash | text | 变化检测 |
| first_seen_at | datetime | 首次发现 |
| last_checked_at | datetime | 最近检测 |
| published_at | datetime | 发布时间 |
| source_count | integer | 来源数量 |
| is_featured | boolean | 是否置顶 |
| screenshot_status | text | pending / ready / failed |

## 10.1.1 表：site_aliases

| 字段 | 类型 | 说明 |
|------|------|------|
| id | text/uuid | 主键 |
| site_id | fk | 归属站点 |
| alias_hostname | text | 观察到的 hostname |
| alias_url | text | 观察到的 URL |
| alias_type | text | canonical / www / subdomain / pages_dev / workers_dev / redirect_target |
| is_active | boolean | 当前是否有效 |
| first_seen_at | datetime | 首次发现 |
| last_seen_at | datetime | 最近发现 |

## 10.2 表：site_signals

| 字段 | 类型 | 说明 |
|------|------|------|
| id | text/uuid | 主键 |
| site_id | fk | 站点 |
| signal_type | text | 信号类型 |
| raw_value | text | 原始值 |
| weight | integer | 权重 |
| detected_at | datetime | 检测时间 |
| source | text | local-codex / builtwith / wappalyzer / manual |

## 10.3 表：site_snapshots

| 字段 | 类型 | 说明 |
|------|------|------|
| id | text/uuid | 主键 |
| site_id | fk | 站点 |
| canonical_url | text | 本次抓取所用 canonical URL |
| title | text | 标题快照 |
| description | text | 描述快照 |
| screenshot_r2_key | text | 截图 |
| html_r2_key | text | 渲染后 HTML 快照 |
| headers_json | text | 头信息 |
| dns_json | text | DNS 摘要 |
| deployment_type | text | 当时的部署类型 |
| confidence_tier | text | 当时的置信度 |
| runtime_status | text | 当时的可用性状态 |
| workflow_status | text | 当时的工作流状态 |
| diff_summary | text | 变化摘要 |
| created_at | datetime | 时间 |

## 10.3.1 表：screenshot_jobs

| 字段 | 类型 | 说明 |
|------|------|------|
| id | text/uuid | 主键 |
| site_id | fk | 站点 |
| url | text | 目标地址 |
| mode | text | detail / refresh / manual |
| idempotency_key | text | 幂等键，唯一 |
| request_fingerprint | text | 去重指纹 |
| target_object_key | text | 预期写入的 R2 目标 |
| status | text | queued / processing / ready / failed |
| attempts | integer | 重试次数 |
| error_message | text | 最近错误 |
| requested_by | text | codex / ops-user |
| lease_owner | text | 当前处理方 |
| lease_expires_at | datetime | lease 到期时间 |
| created_at | datetime | 创建时间 |
| finished_at | datetime | 完成时间 |

## 10.4 表：collections

| 字段 | 类型 | 说明 |
|------|------|------|
| id | text/uuid | 主键 |
| slug | text | 路径 |
| title | text | 标题 |
| description | text | 说明 |
| type | text | auto / editorial |
| query_json | text | 自动集合规则 |
| hero_r2_key | text | 头图 |
| published | boolean | 是否发布 |

## 10.5 表：collection_sites

- collection_id
- site_id
- rank
- pinned

## 10.6 表：research_posts

- slug
- title
- summary
- body_md
- cover_r2_key
- status
- author
- published_at

## 10.7 表：submission_queue

- id
- submission_key
- canonical_hostname
- submitted_url
- submitted_name
- submitted_description
- submitter_email
- note
- dedupe_result
- workflow_status
- attempt_count
- claim_token
- lease_owner
- lease_expires_at
- processed_at
- linked_site_id
- created_at

## 10.8 表：automation_runs

- job_name
- started_at
- finished_at
- status
- items_processed
- summary_md
- error_log

## 10.9 表：search_index_terms

- site_id
- normalized_term
- term_type
- weight
- created_at

## 10.10 表：newsletter_subscriptions

- email
- interests_json
- status
- source
- created_at
- confirmed_at

## 10.11 表：sponsor_leads

- company_name
- contact_name
- email
- budget_range
- notes
- status
- created_at

---

## 11. API 设计

## 11.1 Public APIs

- `GET /api/sites`
- `GET /api/sites/{slug}`
- `GET /api/collections/{slug}`
- `GET /api/search?q=`
- `POST /api/submit`
- `POST /api/subscribe`

### Public API 规则

- 默认分页
- 默认只返回已发布记录
- 限流
- 结构化响应

## 11.2 Internal Ops APIs

- `POST /api/ops/candidates/import`
- `POST /api/ops/sites/upsert`
- `POST /api/ops/sites/{id}/signals`
- `POST /api/ops/sites/{id}/snapshot`
- `POST /api/ops/screenshots/request`
- `GET /api/ops/jobs/{id}`
- `POST /api/ops/publish-requests`
- `POST /api/ops/publish-requests/{id}/execute`
- `POST /api/ops/recompute`

### 内部 API 安全

- Human ops 通过 Access session 访问 UI 和人工审批接口
- Local Codex 通过 machine token + request signing 访问机器接口
- 所有请求带 `scope`，最小权限校验
- destructive 动作要求独立 `approval_token`

推荐 scope 划分：

- `candidate.import`
- `site.write`
- `signal.write`
- `snapshot.write`
- `screenshot.enqueue`
- `publish.request`
- `publish.execute`（仅人或策略执行器）
- `site.override`（仅人）
- `site.recompute`（仅人）

---

## 12. 页面与状态流转

## 12.1 Site 工作流生命周期

```
Discovered
  -> Validating
  -> Enriched
  -> Review Required
  -> Approved
  -> Publish Requested
  -> Published
  -> Recheck Scheduled

Side exits:
  -> Rejected
  -> Duplicate
  -> Unpublished
  -> Archived
```

### 状态说明

- `Discovered`: 已发现但未验证
- `Validating`: 正在抽取信号
- `Enriched`: 已补充摘要、标签、截图
- `Review Required`: 冲突或低置信
- `Approved`: 可发布
- `Publish Requested`: 已产生发布请求，等待 approval token
- `Published`: 对外可见
- `Recheck Scheduled`: 下次复检排队中
- `Rejected`: 审核未通过
- `Duplicate`: 已并入已有 site identity
- `Unpublished`: 从公开目录移除但保留记录
- `Archived`: 历史冻结，不再参与刷新

## 12.1.1 Site 运行时状态

- `Live`
- `Redirect`
- `Parked`
- `Dead`

规则：

- `runtime_status` 只描述站点当前可用性
- `workflow_status` 只描述编辑发布流水线
- Public API 读取两者，但不得混用

## 12.2 Collection 生命周期

- draft
- generated
- reviewed
- published
- unpublished
- rejected
- archived

## 12.3 Research 生命周期

- idea
- draft
- edited
- scheduled
- published
- unpublished
- archived

---

## 13. 非功能需求

### 性能

- 首页 p95 TTFB < 300ms
- 详情页 p95 < 500ms
- 搜索 p95 < 600ms
- 首屏 LCP < 2.5s

### 可用性

- Public app 99.9%
- Ops app 99.5%

### 可靠性

- 自动化失败不影响前台可读
- 截图失败不阻塞记录发布
- 发布动作支持幂等重试

### 安全

- 全站 HTTPS
- 表单使用 Turnstile
- 内部路由使用 Access
- 内部 API 使用短时 token
- 所有写操作审计留痕

### 成本

- MVP 基础设施优先使用 Cloudflare 免费或低成本组合
- 截图频率受控
- 低热度站点降低复检频率
- Browser Rendering 预算按日和按月双限额控制

---

## 14. 内容与运营策略

## 14.1 首页运营位

- Featured sites
- New this week
- Moved to Workers
- Research highlights

## 14.2 周运营动作

- 审核待发布候选
- 更新专题集合
- 发布每周 digest
- 清理 dead / parked 记录

## 14.3 Editorial 原则

- 不做无差别堆砌
- 不收录明显无内容的 parked domains
- 低置信条目不上首页推荐
- 高质量精选优先覆盖 AI / SaaS / DevTools / Open Source

---

## 15. 版本规划

## Phase 0：基础设施

- 初始化 Workers 项目
- 建 D1 schema
- 配置 R2 / KV / Durable Objects / Queues / Workflows / Access
- 打通本地 Codex 到内部 API

## Phase 1：Public MVP

- 首页
- 详情页
- 站点级基础搜索
- 集合页
- 只读研究列表入口

说明：`/submit` 在 Phase 1 保持关闭，直到 Phase 2 的 review/publish 闭环可用。

## Phase 2：Ops MVP

- submission queue
- review panel
- publish flow
- automation run log
- submit 页上线
- publish request / execute 分离

## Phase 3：Research + Newsletter

- 研究模块
- 自动周报草稿
- 订阅系统

## Phase 4：高级智能化

- 页面变化 diff
- 自动专题建议
- 迁移趋势榜单
- 更强的结构化提取

---

## 16. ADR

## ADR-001：使用 Workers 作为主运行时，而不是 Pages-only

### Status

Accepted

### Context

VentureDex 不只是静态目录，还需要内部 API、审核后台、数据写入、异步处理和与本地 Codex 的受控集成。

### Decision

使用 Cloudflare Workers 作为主运行时，静态资源使用 Workers Assets。

### Positive

- 统一运行时
- API 和页面共用一套部署
- 更适合内部控制面

### Negative

- 比纯静态 Pages 复杂
- 需要更明确的数据与缓存策略

### Alternatives Considered

- Pages-only：不满足复杂控制面要求
- Vercel + Cloudflare CDN：产品叙事不一致

## ADR-002：采用 D1 + R2 + KV + Durable Objects + Queues + Workflows 作为核心数据面

### Status

Accepted

### Context

产品需要结构化元数据、截图存储、热点缓存、异步处理和长流程编排。

### Decision

元数据存 D1，截图和文章资源存 R2，KV 只承担读缓存，Durable Objects 处理 lease / lock / 热计数，Queues 只做 fan-out 任务，多步骤主流程走 Workflows。

### Positive

- 全部留在 Cloudflare
- 模块职责清晰
- 对 MVP 成本友好

### Negative

- 需要设计好 schema 和异步任务边界
- D1 查询能力和高阶搜索能力需提前约束

### Alternatives Considered

- 外部 Postgres：削弱 Cloudflare-native 叙事
- 单表硬扛所有场景：后期维护差

## ADR-003：自动化更新由本地 Codex 执行，而不是站内自发闭环

### Status

Accepted

### Context

用户明确要求自动化更新使用本地 Codex 执行。产品需要一个可解释、可审阅、可中止的 operator plane。

### Decision

使用本地 Codex automation 负责发现、验证、补充、复查、研究草稿和发布请求；Cloudflare 只承载产品运行面、审批接口和最终写入接口。Codex 不直接执行 publish / unpublish / archive。

### Positive

- 充分利用本地 Codex 的代理能力
- 运营链路可审阅、可回放
- 不把重抓取逻辑硬塞进线上运行时

### Negative

- 自动化依赖本地机器在线
- 更新链路比纯云端 cron 更依赖操作纪律

### Alternatives Considered

- 全部用 Cloudflare Cron 直接抓取：灵活性不足，复杂研究链路较弱
- 外部第三方自动化平台：约束更大，成本更高

## ADR-004：Phase 1 内容运营允许本地 Codex 自动 commit/push 到 main

### Status

Accepted

### Context

用户随后明确要求：内容自动更新应通过本地 Codex automation 完成，并在本地验证通过后自动 commit / push，让站点持续更新。现有 ADR-003 中“Codex 不直接执行 publish / unpublish / archive”过于宽泛，会与当前 Phase 1 内容运营模式冲突。

### Decision

在 Phase 1 的 VentureDex 内容运营中，本地 Codex automation 可以在严格本地门禁通过后，直接把内容源文件 commit 并 push 到 `main`。真正的部署执行仍由 GitHub Actions 和 Cloudflare 完成，因此：

- Codex 负责内容发现、评估、写入、验证、commit、push
- GitHub Actions 负责二次验证、D1 同步与部署
- push to `main` 视为已批准的发布动作，只适用于这条受控的内容自动化链路

这条决策收窄并覆盖 ADR-003 最后一条表述，只对当前内容发布自动化生效，不自动扩展到 unpublish、archive 或任意后台写操作。

### Positive

- 与当前用户要求和 automation 行为一致
- 文档、自动化和部署链路保持一致
- 把 publish 风险收敛到本地 gate + CI gate 的双层门禁

### Negative

- `main` 分支成为自动化直接写入面，需要更强的 review 和日志纪律
- push 成功不等于部署成功，仍需要记录 CI 结果

### Alternatives Considered

- 保持 ADR-003 原样，把 automation 限制为只生成 publish request：不满足当前自动更新要求

---

## 17. 开放问题

1. `Hybrid` 是否在 MVP 就暴露给用户，还是内部字段先保留？
2. 自动批准规则是否允许非 submission 的 A 级站点跳过人工审批？
3. `Research` 模块是否一开始就公开，还是先做内部运营草稿？
4. 是否在 MVP 直接开放一个只读 JSON feed？
5. 何时扩展收录范围到 docs / portfolio / media 类站点？

---

## 18. 最终建议

VentureDex 第一版应该是一个**结构化、证据化、可运营的 Cloudflare-native 产品目录**。

正确的实现方式不是“把一个目录站部署到 Cloudflare”，而是：

1. **公开产品运行面全部放在 Cloudflare**
2. **把本地 Codex 设计成受控的自动化运营平面**
3. **用 evidence 和 confidence 管理数据质量**
4. **用 Collections 和 Research 放大目录价值**

这样做，VentureDex 才会同时具备：

- 产品感
- 数据壁垒
- 内容传播能力
- 长期商业化空间

---

## 19. 设计依据与参考来源

### 本地研究基础

- `startups.gallery` 深度研究文档：作为导航、集合页、卡片流、详情页、内容运营和赞助模式的参考基线
- `venturedex.co/RESEARCH.md`：作为产品边界、Cloudflare 识别难点、竞品和市场判断的参考基线

### Cloudflare 官方能力依据

- Pages Custom Domains
- Workers Custom Domains
- Pages -> Workers Migration Guide
- Workers Cron Triggers
- Browser Rendering

### 第三方市场依据

- BuiltWith: Cloudflare
- BuiltWith: Cloudflare Pages
- Wappalyzer: Cloudflare
