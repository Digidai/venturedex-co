# VentureDex 深度研究报告

> 研究日期：2026-04-12
> 研究对象：`venturedex.co`
> 研究目标：评估“收录基于 Cloudflare 部署的网站”这一产品方向的可行性、边界、数据源、竞品与实现方案
> 说明：用户原始表述中的 `Cloudfare` 下文统一更正为 `Cloudflare`

---

## 0. 执行摘要

### 结论先行

`venturedex.co` 这个方向**可以做**，但不能把产品定义成“Cloudflare 上全部部署的网站目录”。

原因很直接：

1. **如果把范围定义为“任何使用 Cloudflare 的网站”**，那是一个数千万级市场。BuiltWith 当前公开页显示，Cloudflare 相关站点是 **45,973,874 个 live sites**，历史累计 **75,713,210**。这个规模既不可能靠轻量爬虫穷尽，也没有足够差异化。  
2. **如果把范围收缩为“Cloudflare 原生部署的网站”**，也就是 `Pages`、`Workers`、`pages.dev`、`workers.dev`、以及可验证的自定义域名映射，这个方向就变得可操作。BuiltWith 当前公开页显示，Cloudflare Pages 当前约 **34,210 个 live sites**。  
3. **Cloudflare 平台本身正在把 Pages 能力并入 Workers 路线**。官方文档已经提供 “Migrate from Pages to Workers” 指南，因此产品不应只围绕 Pages 建模，而应围绕 **Cloudflare-native deployments** 建模。  

### 最重要的产品判断

VentureDex 最合理的定义不是：

> “全部部署在 Cloudflare 上的网站”

而应该是：

> “公开可发现、可验证的 Cloudflare 原生站点索引”

更进一步，如果你希望它像 `startups.gallery` 一样具备鲜明品牌和可运营性，我建议把公开大盘和精选产品分开：

- **数据层**：尽可能收录公开可发现的 Cloudflare-native sites
- **产品层**：精选其中值得看的 startup / SaaS / AI / devtool / indie 项目

也就是说，**底层做 technographic index，上层做 curated gallery**。这条路最稳。

---

## 1. 当前域名与产品状态

### 1.1 `venturedex.co` 当前并未处于正常上线状态

我在本地做了三组直接验证：

1. `dig +trace venturedex.co A`
2. `curl -I https://venturedex.co`
3. `curl -I http://venturedex.co`

### 1.2 结果

- `dig +trace` 在 `.co` 权威链路上没有返回有效 A 记录，表现为 **NXDOMAIN / 不存在的域名**。
- `https://venturedex.co` 当前 **TLS 握手失败**。
- `http://venturedex.co` 当前返回 **Empty reply from server**。
- 本地默认解析器给出 `198.18.21.93 / 198.18.21.94` 这样的地址，但这更像是 **NXDOMAIN 替代 / 中间网络注入结果**，因为 `198.18.0.0/15` 本身不是正常公网建站地址段。

### 1.3 结论

截至 **2026-04-12**，`venturedex.co` 更像是：

- 域名尚未正式注册完成，或
- 注册刚完成但未在权威 DNS 生效，或
- 站点发布链路/证书链路尚未配置完整

**所以当前研究应视为“产品从 0 到 1 定义阶段”，而不是“对一个已上线网站的逆向分析”。**

---

## 2. 题目边界：什么叫“部署在 Cloudflare 上”

这是整个产品最关键的定义问题。

### 2.1 三种完全不同的“Cloudflare 网站”

| 层级 | 定义 | 典型信号 | 是否适合 VentureDex |
|------|------|----------|---------------------|
| A | 仅使用 Cloudflare CDN / DNS / WAF 的网站 | `server: cloudflare`、`cf-ray`、Cloudflare NS | 不适合做主定义，规模太大 |
| B | 使用 Cloudflare Pages 的网站 | `*.pages.dev`、CNAME 指向 `*.pages.dev`、Pages 自定义域名 | 适合 |
| C | 使用 Cloudflare Workers 作为站点/应用 origin 的网站 | `workers.dev`、Workers Custom Domain、Workers 静态资源 | 适合 |

### 2.2 官方文档给出的关键信号

Cloudflare Pages 官方文档明确说明：

- 子域名可通过 CNAME 指向 `<YOUR_SITE>.pages.dev`
- Apex 域名需要把 nameserver 交给 Cloudflare
- 项目默认仍可通过 `*.pages.dev` 访问，除非显式禁用或重定向

Cloudflare Workers 官方文档明确说明：

- Workers Custom Domain 必须位于 **active Cloudflare zone**
- Cloudflare 会代为创建 DNS 和证书
- Custom Domain 会把整个域或子域的所有路径指向 Worker

### 2.3 这意味着什么

如果 VentureDex 把范围定义为 `Pages + Workers`，就能基于公开信号建立一个“**高概率正确，但不承诺 100% 穷尽**”的索引系统。

如果 VentureDex 把范围定义为“所有使用 Cloudflare 的网站”，那你最终做出来的只会是另一个缩水版 BuiltWith/Wappalyzer，而且几乎没有防守能力。

---

## 3. 市场规模：大盘很大，但真正可做的子集更小

### 3.1 Cloudflare 总盘

BuiltWith 当前公开页显示：

- 使用 Cloudflare 的 live sites：**45,973,874**
- 历史累计 live + expired：**75,713,210**

这说明“Cloudflare 站点目录”这个词如果不加限定，会立刻落到一个超大而泛化的 technographics 市场。

### 3.2 Cloudflare Pages 子盘

BuiltWith 当前公开页显示：

- 使用 Cloudflare Pages 的网站：**37,372**
- 其中 live sites：**34,210**
- 历史用过 Pages 的站点：**41,581**

这个数量级就进入可运营区间了：

- 足够大，能做索引、筛选、榜单、专题
- 又没有大到必须先做商业级全网扫描基础设施

### 3.3 Wappalyzer 的侧面信号

Wappalyzer 的 Cloudflare 技术页说明：

- 它把 Cloudflare 视为 CDN / DNS / security / edge computing 平台
- 页面直接展示了使用 Cloudflare 的高流量站点
- 提供按国家、语言、流量、技术投入等维度筛选的 technographic 视角

这说明市场已经验证了两件事：

1. **有人愿意为“谁在用某项基础设施”付费**
2. **用户真正想买的不是“全部网址列表”，而是“带标签、可筛选、可销售线索化的数据”**

### 3.4 对 VentureDex 的真实启发

VentureDex 的价值不应该是：

- “我比 BuiltWith 更全”

而应该是：

- “我比 BuiltWith 更懂 Cloudflare-native 部署”
- “我能区分 Pages / Workers / merely proxied by Cloudflare”
- “我给出更高质量的公开案例、标签、截图、行业聚类、迁移趋势”

---

## 4. 可发现性与可验证性：哪些站点能被抓到

### 4.1 最容易抓的：`pages.dev`

这是 VentureDex 的最佳起点。

可发现方式：

- 直接收集 `*.pages.dev`
- 利用第三方 technographics 数据源导入
- 结合证书透明度日志、搜索引擎索引、公开链接关系补全
- 校验响应头、canonical、跳转链、页面标题

优点：

- 结构稳定
- 误报低
- 站点确实是 Cloudflare Pages 项目

缺点：

- 很多生产项目会把 `pages.dev` 重定向到自定义域名
- 一部分项目会禁用或遮蔽默认子域名访问

### 4.2 次容易抓的：CNAME 指向 `*.pages.dev` 的自定义子域

官方文档明确写了这种映射方式，因此这是高度可靠的检测信号。

适用对象：

- `www.example.com`
- `app.example.com`
- `docs.example.com`

风险：

- 不是所有 DNS 查询都能轻松暴露最终目标
- 部分供应商前置或 flattening 可能降低可见性

### 4.3 最难抓的：Workers Custom Domain

这是 VentureDex 最大的技术难点。

Workers Custom Domain 的问题在于：

- 它要求域名处于 Cloudflare zone 内
- Cloudflare 自动处理 DNS 与证书
- 对外看起来，它和“普通走 Cloudflare 代理的网站”非常像

因此：

- **只有 `workers.dev` 子域名是强信号**
- **Custom Domain 上的 Worker 应用很多时候只能做到概率判断，难做到绝对确定**

### 4.4 Cloudflare 已经在推动 Pages -> Workers 迁移

官方文档已有独立的 “Migrate from Pages to Workers” 页面，且明确对比：

- Pages 的 `pages_build_output_dir`
- Workers 的 `assets.directory`
- Pages 的 `pages.dev`
- Workers 的 `workers.dev`
- Pages 的 preview environment
- Workers 的 preview URLs

这意味着你的产品模型不能写死成：

- `deployment_type = pages`

而应该至少支持：

- `pages`
- `workers-static-assets`
- `workers-app`
- `cloudflare-proxied-only`

### 4.5 真实世界里应使用“置信度分层”

推荐直接在数据模型里引入 `confidence_tier`：

| 级别 | 含义 | 例子 |
|------|------|------|
| A | 强验证 | `*.pages.dev`、`*.workers.dev` |
| B | 高概率 | CNAME 指向 `*.pages.dev`，或明确 Workers custom domain 规则可验证 |
| C | 中概率 | Cloudflare NS + 明显 Worker 行为信号 + 响应特征 |
| D | 弱概率 | 仅第三方 technographic 工具判定 |

如果没有这层设计，后期数据质量一定会失控。

---

## 5. VentureDex 最值得做的不是“全部”，而是“公开可发现 + 精选”

### 5.1 为什么“全部”不成立

“全部”这个词有三个问题：

1. **技术上不可证**  
   你不可能从公网无损识别所有 Worker custom domains。

2. **商业上无意义**  
   用户真正需要的是筛选、聚类、榜单、线索，不是无边界网址池。

3. **品牌上不可持续**  
   一旦用户发现大量漏收或误判，“全部”这个承诺会反过来伤害可信度。

### 5.2 推荐的产品定义

我建议 VentureDex 对外这样表述：

> The public index of Cloudflare-native websites.

或者中文：

> 公开可发现的 Cloudflare 原生网站索引。

如果你希望更贴近 `startups.gallery` 的策展气质，可以再加一层：

> A curated gallery of the most interesting products built on Cloudflare.

### 5.3 推荐的双层结构

#### 底层：Index

尽可能广地收录：

- Pages 项目
- Workers 项目
- 可验证的自定义域名
- 公开可见的示例站点

#### 上层：Curated

人工或半自动精选：

- AI 产品
- SaaS
- DevTools
- 独立开发者项目
- 设计/内容工具
- 出海产品

这会让 VentureDex 同时具备：

- 可规模化的数据积累
- 可传播的品牌首页
- 可运营的 newsletter / sponsor 入口

---

## 6. 竞品与相邻产品

### 6.1 直接竞品不是内容站，而是 technographic 数据商

| 产品 | 核心能力 | 对 VentureDex 的威胁 | 机会点 |
|------|----------|----------------------|--------|
| BuiltWith | 大规模技术识别、站点统计、lead list | 数据覆盖广 | 对 Cloudflare-native 的语义不够深 |
| Wappalyzer | 技术识别、公司画像、线索生成 | 用户习惯成熟 | 对 Pages/Workers 细分不够强 |
| PublicWWW | 源代码/标记搜索 | 适合做信号挖掘 | 不是结构化目录产品 |
| Netcraft / urlscan 一类 | 网络侦察、被动观察 | 可做辅助验证 | 不直接服务“发现优质产品”场景 |

### 6.2 Cloudflare 自身并没有做“公开全量目录”

Cloudflare 官方更多是：

- 文档
- showcase / button
- 平台能力介绍

并没有一个面向终端用户的“全量公开 Cloudflare 网站目录产品”。  
这正是 VentureDex 可以成立的窗口。

### 6.3 真正的差异化方向

VentureDex 的差异化应该是这三件事的组合：

1. **Cloudflare-specific detection**
2. **可读、可逛、可分享的 gallery UI**
3. **产品/行业/阶段/地区/技术类型的结构化标签**

换句话说：

- BuiltWith 像数据库
- `startups.gallery` 像策展目录
- VentureDex 最优形态是 **两者的结合**

---

## 7. 产品命名与品牌判断

### 7.1 `VentureDex` 这个名字的优点

- `Dex` 很适合做索引、目录、数据库、图鉴
- 容易理解为 “catalog / index / directory”
- 适合 SEO 与品牌延展（榜单、API、newsletter 都能接）

### 7.2 `Venture` 这个词的潜在偏差

问题在于：`Venture` 更像：

- 创业公司
- venture-backed startup
- 投资/融资语义

而不是：

- Cloudflare 部署基础设施
- Edge runtime
- static/full-stack hosting

### 7.3 这不一定是缺点

如果你真正想做的是：

> “用 Cloudflare 构建的创业产品目录”

那 `VentureDex` 反而是贴切的。

但如果你想做的是：

> “全网 Cloudflare-built site index”

那品牌和产品语义会有一点错位。

### 7.4 建议

我建议不要改域名，先通过副标题修正语义：

- `VentureDex`
- `The public index of products built on Cloudflare`

这样既保留品牌，又把范围落到“产品/项目”，而不是“互联网全部网站”。

---

## 8. 信息架构：建议照着 `startups.gallery` 的运营逻辑做，但换成 Cloudflare 语义

### 8.1 首页

推荐结构：

```
Nav
├── Hero
│   ├── H1: Discover products built on Cloudflare
│   └── Subheading
├── Featured / Trending strip
├── Tabs: Explore | Collections | Research
├── Filters
│   ├── Deployment: Pages / Workers / Unknown
│   ├── Type: SaaS / AI / DevTools / Ecommerce / Docs / Portfolio
│   ├── Region
│   ├── Framework
│   └── Confidence
├── Site cards grid
└── Footer
```

### 8.2 详情页

每个站点至少展示：

- 产品名
- 域名
- 一句话描述
- 首页截图
- Cloudflare deployment type
- 证据信号列表
- 站点分类
- 检测时间
- 历史变更
- 外链（官网 / GitHub / X / 文档）

### 8.3 Collections 页面

推荐的专题页：

- `/collections/pages`
- `/collections/workers`
- `/collections/ai`
- `/collections/devtools`
- `/collections/oss`
- `/collections/china`
- `/collections/recently-added`
- `/collections/high-confidence`

### 8.4 Research 页面

这个模块会非常重要，因为它决定了 VentureDex 不只是目录。

可以做：

- Cloudflare 生态观察
- Pages -> Workers 迁移趋势
- 哪些框架最常部署到 Cloudflare
- 高质量 Cloudflare 站点案例拆解

---

## 9. 数据模型

### 9.1 核心表：sites

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| domain | String | 主域名 |
| hostname | String | 完整主机名 |
| product_name | String | 产品名 |
| title | String | 当前页面标题 |
| summary | Text | 简短描述 |
| screenshot_url | URL | 首页截图 |
| screenshot_hash | String | 用于变更检测 |
| deployment_type | Enum | `pages` / `workers-static` / `workers-app` / `cloudflare-proxied-only` / `unknown` |
| confidence_tier | Enum | A / B / C / D |
| status | Enum | live / redirect / parked / dead |
| first_seen_at | DateTime | 首次发现 |
| last_checked_at | DateTime | 最近检查 |
| source_vendor | String[] | BuiltWith / Wappalyzer / crawl / manual |
| tags | String[] | 行业、类型、地区、框架等 |

### 9.2 证据表：signals

| 字段 | 类型 | 示例 |
|------|------|------|
| site_id | FK | - |
| signal_type | Enum | `pages_dev` / `workers_dev` / `cname_pages_dev` / `cloudflare_ns` / `cf_headers` |
| raw_value | Text | `shop.example.com CNAME abc.pages.dev` |
| detected_at | DateTime | - |
| weight | Int | 1-100 |

### 9.3 变更表：snapshots

记录每次抓取的：

- title
- meta description
- screenshot
- headers
- dns summary
- redirect chain

这样你未来可以做：

- “最近从 Pages 迁移到 Workers 的站点”
- “标题/定位发生明显变化的产品”

---

## 10. 数据采集策略

### 10.1 第一阶段：最快起盘方案

优先用外部已验证 technographic 数据 + 自建校验器。

#### Seed sources

1. BuiltWith 的 Cloudflare Pages 数据页
2. BuiltWith 的 Cloudflare 数据页
3. Wappalyzer 的 Cloudflare 技术页
4. 自己抓取的 `pages.dev` / `workers.dev` 公开集合
5. 手工补充的代表性高质量案例

#### 自建校验器做的事

- DNS 查询
- CNAME 判断
- NS 判断
- HTTP/HTTPS 可达性
- 跳转链
- 响应头抽样
- HTML title/description 抓取
- 截图生成

### 10.2 第二阶段：扩大发现面

增加：

- 证书透明度日志扫描
- GitHub README / docs 中的 “Built with Cloudflare” 自报信号
- 搜索引擎对 `site:*.pages.dev` 和公开链接关系的增量发现
- 公开 sitemap / robots / favicon / asset pattern 分析

### 10.3 第三阶段：做“趋势产品”而不是“静态名单”

当你有连续快照后，就能做：

- 新发现站点
- 新迁移到 Cloudflare 的站点
- Pages -> Workers 迁移站点
- 最近变化最快的项目

这个阶段才会真正有内容产品属性。

---

## 11. 技术路线建议

### 11.1 不建议

不建议把 VentureDex 部署在 Vercel 然后研究 Cloudflare。  
这会让产品叙事本身不一致。

### 11.2 建议：直接做 Cloudflare-native

推荐方案：

| 层 | 方案 |
|----|------|
| 前端 | Astro 或 Next.js 静态输出 |
| 运行时 | Cloudflare Workers |
| 静态资源 | Workers Assets |
| 数据库 | D1 |
| 对象存储 | R2 |
| 缓存 | KV / Cache API |
| 定时任务 | Cron Triggers |
| 截图/抓站 | Browser Rendering 或外部 Playwright worker |
| 分析 | Cloudflare Web Analytics |

### 11.3 为什么推荐 Workers 而不是 Pages

不是因为 Pages 不能用，而是因为：

1. 官方已经提供 **Pages -> Workers** 迁移路径
2. Workers 对“目录站 + 采集任务 + API + 后台处理”更完整
3. 你自己做的是 Cloudflare 基础设施情报产品，**底层也应该可表达 Cloudflare 的全栈能力**

### 11.4 MVP 技术目标

第一版只要做到这四件事：

1. 导入 500-2,000 个高置信站点
2. 支持基础筛选和搜索
3. 每个站点有证据卡片和截图
4. 有 3-5 个高质量专题页

这就足够上线。

---

## 12. 增长与商业化

### 12.1 最自然的早期增长路径

- SEO：`Cloudflare Pages examples`, `sites built on Cloudflare`, `Cloudflare Workers examples`
- 社媒传播：做“每周新增 / 本周最佳 Cloudflare 站点”
- 社区传播：向 Cloudflare builder、独立开发者、开源项目发起收录
- Newsletter：每周精选 10 个项目

### 12.2 商业化方向

| 方式 | 说明 |
|------|------|
| Featured placement | 首页/专题页置顶 |
| Newsletter sponsor | 和 `startups.gallery` 类似 |
| API / CSV | 面向销售、BD、投资研究 |
| Research reports | 行业报告或迁移报告 |
| Recruitment / talent | 长期可扩展，但不是早期重点 |

### 12.3 最值得卖的其实不是广告，而是“结构化 Cloudflare 线索”

潜在买家：

- Cloudflare 服务商 / 咨询公司
- DevTools 厂商
- 面向 Cloudflare builder 的周边产品
- 投资研究团队
- 招聘团队

所以 VentureDex 最终最有价值的资产会是：

> 一套持续更新的 Cloudflare-native site graph

---

## 13. 风险与决策

### 13.1 最大风险

#### 风险 1：定义过宽

如果对外仍然写“全部 Cloudflare 网站”，很快就会因为漏收、误判和规模失控而失真。

#### 风险 2：Workers custom domains 难以完全确认

这会导致一部分核心数据只能做到概率判断。

#### 风险 3：名字和主题轻微错位

`VentureDex` 更偏创业产品，不是纯基础设施数据产品。

### 13.2 应对方式

1. 公开定位改成 **public index**，不要承诺 **complete index**
2. 数据层引入 `confidence_tier`
3. 产品层以“项目/产品目录”叙事，而不是“互联网测绘”

---

## 14. 最终建议

### 建议等级：**值得做，但要改题**

我对这个方向的最终判断是：

#### 不建议做

> “一个收录全部 Cloudflare 网站的目录”

#### 建议做

> “一个收录公开可发现 Cloudflare-native 项目的索引与精选目录”

### 最推荐的第一版定义

**产品名**：VentureDex  
**域名**：`venturedex.co`  
**定位**：The public index of products built on Cloudflare.

### 最推荐的 MVP 顺序

1. 先解决域名注册 / DNS / HTTPS
2. 先收 `pages.dev` 和高置信度自定义域名
3. 首批只做 500-2,000 个高质量样本
4. 首页做精选，底层做可验证索引
5. 等数据稳定后再扩到更难识别的 Workers custom domains

---

## 15. 参考来源

1. Cloudflare Pages Custom Domains  
   https://developers.cloudflare.com/pages/configuration/custom-domains/

2. Cloudflare Workers Custom Domains  
   https://developers.cloudflare.com/workers/configuration/routing/custom-domains/

3. Cloudflare: Migrate from Pages to Workers  
   https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/

4. BuiltWith: Cloudflare Pages Usage Statistics  
   https://trends.builtwith.com/cdn/Cloudflare-Pages

5. BuiltWith: Cloudflare Usage Statistics  
   https://trends.builtwith.com/cdn/Cloudflare

6. Wappalyzer: Websites using Cloudflare  
   https://www.wappalyzer.com/technologies/cdn/cloudflare/

---

## 附：一句话版判断

VentureDex 真正该做的，不是“Cloudflare 上全部网站大全”，而是“**公开可发现的 Cloudflare 原生产品索引 + 精选目录**”。这条线可做、可增长、可商业化，而且比泛 technographics 更有产品感。
