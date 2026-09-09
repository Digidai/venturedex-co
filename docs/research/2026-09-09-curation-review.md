# VentureDex 来源、筛选与投资机构信息审计

研究日期：2026-09-09。对象：Daily 融资策展，不是 WhatShips launch 同步，也不是投资回报预测。

## 后续授权与实现更新（20:19 CST）

20:32 CST 补充：对本次修正融资引用的 Kodesage/SkyPilot 实际执行关联机构 planner，识别并补齐 Lux Capital 与 VentureFriends。完整档案增至 9 家，245 家保留渐进维护；再次规划两家均为 fresh-skipped，常规复查日 2026-12-08。以下七家数量是初始实现快照。最终跨显示层补强又通过 55 项定向测试，关联机构测试 16 项通过；新資料的官网出处逐字段存于 sidecar。

用户随后明确要求“进行全面修复和优化，然后最终生效”。下文的审计基线、初始 local-only 状态与“治理建议”保留为历史快照，不代表当前授权边界。维护分支已实现：取消拒绝配额与数量奖励；互补来源及行业化评估；支持原币种、早期/扩展轮次和融资工具的全链路合同；57 条可溯源复审记录，其中 46 条处于待处理状态；七家投资机构的结构化资料与 90 天维护；两条不可用历史融资来源的核验替换。未将待复审公司自动上架，未改写旧拒绝账本。

完整本地门禁已通过 304/304 内容记录、1,814 个外链检查、601 项测试、零类型诊断和生产构建；随后定向回归 50 项通过。页面又检查了 1280px/390px、来源锚点、图片和深色主题，并修正新增来源链接的深色对比度。134 条既有内容/来源警告保留，没有通过新增豁免掩盖错误。

发布按 [修复设计与验证边界](../plans/2026-09-09-curation-repair-design.md) 经 PR、同 SHA CI、main Deploy 与线上检查。此提交中的状态是发布前验证记录；最终发布和实际任务配置回读凭据保存在本次任务交付及 automation memory，不以本段文字冒充线上成功。

审计基线：`64c5dab426a7f3e65df2386f0f2b46c5da57d27a`。另只读检查了 9 月 9 日保留的 Daily worktree，区分已提交账本与未提交决定。完整逐项数据见 [审计快照](2026-09-09-curation-audit.json)；该文件保留原理由，不替代正式拒绝账本。

## 结论

**确有误筛风险，而且已经找到错误使用规则的实例；但不能据此说所有被拒公司都是好项目。** 问题首先在决策过程：把未披露领投方、非美元融资、访问失败和产品质量放进同一个“拒绝”口径，再用至少 3:1 的拒绝比例衡量严格程度。结果是高拒绝率既不能说明判断精准，也无法定位具体漏收原因。

最有把握的结论是：

1. **四条近期拒绝的唯一理由，与现有未知领投方规则不一致。** TrustedRouter、Easy Aerial、Conveo、Emberos 都因为没有明确 lead 被归为 F3；但任务书、校验器和七条既有发布记录都支持 `lead_investor: "undisclosed"`。前两类结论要分开：“这条拒绝理由无效”已能确认；“公司最终应收录”仍需产品、品味和发布复核。
2. **近期 F3 占拒绝的 64.8%，其中大量是表示方式或证据缺口，不是质量结论。** 非美元、pre-seed、pre-Series A、Series A+、未具名轮次等情况会被现有 schema 拦下。不能把“无法写进当前 JSON”等同“项目不值得看”。
3. **F1 执行中存在过早结束查证。** BrainChild Bio 官网链接到公开临床论文；Outline 页面有角色、流程和具名客户叙述；Celero 的安全验证页只是访问障碍。三者都需要不同的后续处理，而不是统一永久淘汰。
4. **3:1 配额会产生真实的运行冲突。** 固定 10–20 个候选，同时要求所有合格公司都收、最多 5 家、拒绝至少三倍；当好候选较多时，这组要求无法同时满足。历史 learning log 已记录一次固定 11 家、7 家合格、最终因比例矛盾停止的运行。
5. **投资机构页面缺少“了解这家机构”的事实层。** 基线 254 家机构全部只有名称、网站、短描述等基础字段，没有结构化来源或复查日期。当前公司列表又主要通过 lead 字符串关联，不能称为完整 portfolio。

建议优先取消“拒绝率目标”，保留收录上限和独立质量标准；引入“证据待补／访问受阻／数据不适配／质量拒绝”的分流；按行业评价真实产品证据；建立小规模、有触发条件的复审。下文明确区分本次已实现与仍属治理建议的部分。

## 1. 范围、方法与证据强度

本次阅读并交叉核对：

- `content/STANDARD.md`、`content/CODEX_TASK.md`、Daily runbook、feedback loop、近期 learning log。
- `content/rejected.jsonl`、startup JSON、`content/timestamps.json`、investor directory、类型、转换、索引资格、页面和校验器。
- 四个近期固定候选池。9 月 6 日运行与 9 月 7 日恢复合并计算，不把恢复算成又一次筛选。
- 9 月 9 日 exact worktree 与中央 checkpoint：4 家 editorial provisional、13 条 draft rejection、3 家 legacy/governance deferred。未修改这些记录或其截图。
- 对最可能改变结论的案例打开原始公告、公司产品页、投资机构公告与原始论文；不是只看搜索摘要。
- 用 Codex 内置浏览器读取线上 a16z 投资机构页作为页面基线；网页材料与本地代码互相印证。

证据分层：

| 等级 | 本报告含义 | 不能据此推出 |
|---|---|---|
| 已核验代码/账本事实 | 规则、字段、数量、原拒绝理由可从快照复核 | 原决定一定正确 |
| 已打开的一手材料 | 公司/机构公开声明或论文正文确实存在 | 公司自述的性能、客户数或成功率已独立证实 |
| 反证/待复审 | 新证据足以推翻“完全没有证据”等理由，或暴露原规则用错 | 自动通过 F1–F4、品味、截图和发布 gate |
| 建议 | 基于当前工作流推导的改进方案 | 已获批准生效、已部署或已验证提升 recall |

这是有目的的风险抽查，不是对全部 1,164 条拒绝的重新评审，也没有一个独立标注的完整市场样本。因此**不能计算真实的“优质项目漏收率”**，不能把下列比例外推成总体召回率。

## 2. 最近拒绝率到底有多高

| 固定运行 | 候选数 | 拒绝 | 已发布 | 合格但待发布 | 治理待处理 |
|---|---:|---:|---:|---:|---:|
| 9 月 5 日 | 19 | 15 | 4 | 0 | 0 |
| 9 月 6 日，7 日恢复 | 20 | 15 | 5 | 0 | 0 |
| 9 月 8 日，含同日恢复 | 11 | 11 | 0 | 0 | 0 |
| 9 月 9 日，尚未发布 | 20 | 13 | 0 | 4 | 3 |
| **合计** | **70** | **54** | **9** | **4** | **3** |

- 所有候选作分母：54 / 70 = **77.1%** 拒绝。
- 排除 3 家未形成终局判断的 legacy 复审：54 / 67 = **80.6%** 拒绝。
- 9 / 70 = 12.9% 是此快照中的发布比例，不是纯粹的编辑接受率；4 家卡在独立截图复核，不应被算成产品不合格。
- 54 条由 41 条已提交记录加 13 条 9 月 9 日未提交记录构成。不能把 13 条草稿当作已发布或已合并结论。

| 拒绝分类 | 数量 | 占 54 条 |
|---|---:|---:|
| F3：阶段／融资条件 | 35 | 64.8% |
| F1：可评估性 | 10 | 18.5% |
| taste：品味判断 | 5 | 9.3% |
| F4：排除品类 | 4 | 7.4% |

这说明最近的筛选瓶颈更偏向**融资表示和证据准入**，而非实际做了深入比较后认为大多数产品缺乏特色。不过 F3 内部还混有合理的阶段限制、真实证据不足和误用规则，不能直接把 35 条全部判错。

基线有 872 条冻结 legacy v1 和 292 条 v2。旧账本只支持粗粒度拒绝，不能倒推出每次搜索覆盖、漏掉的国家/行业，也不能用存量拒绝数除以当前全部 startup 数当成近期决策质量。

## 3. 确认存在的错误与应复审案例

### 3.1 未披露 lead 被错误当作缺少必需融资事实

TrustedRouter 公告披露 Seed 融资并有可检查的产品路径；Conveo 的官方 Series A 公告列出多家参投方。两者原账本已承认产品可评估，却因没有指定 lead 而拒绝。缺少 lead designation 不意味着没有融资，也不需要从投资方排序中猜出一个领投。[^1][^2]

四条相同模式的处理建议：

| 公司 | 原决定问题 | 本次结论 | 下一步 |
|---|---|---|---|
| TrustedRouter | 无 lead → F3 | 理由无效；官方公告可打开 | 按 `undisclosed` 重新做产品/品味判断 |
| Conveo | 无 lead → F3 | 理由无效；原账本已写产品可评估 | 优先复审，核对研究工作流而非客户数营销 |
| Easy Aerial | 两家投资方未指明谁领投 → F3 | 规则用错可从原理由确认；本次未重新核验完整产品与报道 | 先补齐实际来源复核，不自动改为 accepted |
| Emberos | 私人投资者未指明 lead → F3 | 该理由无效；但品类仍需判断 | 检查核心业务是否落在现行 SEO/GEO 排除范围 |

Emberos 官方公告使“缺 lead”理由不成立，但其产品方向可能仍触发现行排除品类。这正说明纠错不等于无条件放宽。[^3]

本次只统一字段语义：未知值使用既有 `undisclosed`，不省略必填键；删除“第一个提及的投资方即可当 lead”的歧义。**没有把这四家公司直接新增到网站。**

### 3.2 货币和阶段限制制造区域偏差

当前金额正则只支持美元字符串；stage 只支持 Seed 和具名 Series A–Z，D+ 还要求 breakout exception。pre-seed、pre-Series A、A+ 不是被产品评审认定差，而是当前表示合同不接受。

Jaipur Robotics 的投资方 HTGF 明确公布欧元 Seed 融资及联合领投，产品涉及垃圾处理设施的视觉识别与运营流程。这是应进入产品判断的证据，不是汇率换算问题。[^4]

Octave 的官方公告涉及欧元 Series A、股权与债务。适当处理是分清工具及日期，而不是把整笔融资当作美元纯股权 round。该官方页面未提供足够清晰的精确发布日期时，日期依旧是待补事实，不能为了纳入而猜一天。[^5]

Backbone 的官方融资页属于 pre-seed。它能支持“早期公司确实有公开产品方向”，但不能在现有 schema 下把 pre-seed 改写成 Seed。[^6]

建议：

1. 金额模型新增来源原币金额、ISO currency、融资工具（equity/debt/mixed/undisclosed），展示层直接支持原币。USD 对比是可选派生字段，必须带 FX 来源和日期，不能替换来源金额。
2. 增加 `stage_raw`，保留原文；规范化类别与展示文字分开。明确决定 pre-seed 是否进入主 feed，A+ 是否映射 A 的 extension，而不是让正则替编辑做业务决定。
3. 混合融资只在来源明确时拆分。不明确就注明组合融资或等待澄清，不凭报道总额推断投资机构实际出资。
4. 在 schema 完成兼容、D1/parity/search/newsletter 测试之前，保留为 `schema_deferred` 研究队列，不篡改金额/轮次以过校验。

这组改动影响多个消费者，**本次没有仓促实施融资 schema 迁移**。

### 3.3 F1 不是“必须能注册试用”

当前正式标准已经允许 docs、API、SDK、demo、UI、benchmark、客户工作流。执行时却仍可能把 Book a demo 当作否定信号，或者只读首页。

- **BrainChild Bio**：原理由说没有当前临床结果或可评估产品证据；官网 publications 链接到一项公开的 Phase 1 论文。应评估临床/技术证据和限制，而不是把 investigational 等同于不可评估。论文存在不等于治疗已获批，也不自动证明商业可行性。[^7][^8]
- **Outline**：官网可以读到财务分析、差异调查、预算负责人反馈、情景建模和具名客户描述。这些首先是公司展示的工作流与客户自述，仍需实际 UI/演示核验；但原记录“没有客户 workflow evidence”的结论过于绝对。[^9]
- **Celero、Dawraty**：原日志记录的是安全验证或未读到页面。正确结论是“此次访问未取得证据”，不是“公司没有产品”。应保存 exact URL、时间、访问状态、已尝试的官方替代页面及下一次复查条件。
- **Moonwalk、Split Pay**：原草稿中的报道 URL 与本次找到的实际报道路径不一致。本次没有把 fetch failure 直接称为“伪造”，但两条都应先修正来源身份再作融资/产品判断。[^10][^11]

建议将“60 秒初筛”定位为**路由预算**：确认明显排除项、身份、证据入口；复杂 ToB、硬科技和生物技术进入证据队列。不能在 60 秒内没找到便下不可逆结论。

## 4. 来源设计：发现与验证需要分工

现有任务书的示例查询高度集中在英文科技媒体、`raises`、美元和 Seed/A/B。实际运行还使用地区媒体、聚合页和公司公告，但没有稳定的覆盖账本。54 条记录里的 `decision_source_type` 是 45 条 funding、9 条 official；这是“来源角色”，**不是可信度或独立性的统计**。一篇公司公告也可能被标记 funding。

建议采用互补的来源组合，而不是无限加搜索量：

| 来源层 | 用途 | 校验重点 |
|---|---|---|
| 公司/投资机构官方公告 | 轮次、时间、参投身份、产品入口 | 区分官方声明、营销指标、实际产品证据 |
| 原创融资媒体/行业媒体 | 发现、背景、争议和采访 | 回到原始报道，不把转载数量当多方确认 |
| 区域科技媒体 | 覆盖欧洲、印度、中东、亚洲等 | 保留原币和原始轮次；确认品牌/语言别名 |
| 官方 docs、GitHub、论文、监管/试验登记 | 验证产品机制和成熟度 | 文档可访问不等于稳定商业化；论文不等于批准 |
| 聚合器/数据库/搜索摘要 | 发现线索 | 不能单独作为阶段/金额/产品质量的最终事实来源 |

每个固定池应保存简单的发现表：来源 URL、原始公告日期、获取时间、公司官网、来源类别、地区、行业、raw stage/currency、重复/已收录/待复审状态。来源 URL 必须来自实际打开的结果或页面链接，不根据文章标题拼接路径。

建议先做两周有界试验：每次从至少三类互补来源发现，但不为完成来源配额硬塞公司；记录新候选的独特贡献、可核验率和后续合格率。来源优先级应由这些结果调整，不以“找到更多可拒绝公司”获得奖励。

还可以利用本次投资机构档案维护形成发现入口：官网 portfolio/news 页面是高价值线索，但**一次机构复查不是再次启动 Daily discovery 的授权**。超出当前固定池的新线索进入下次队列。

## 5. 审阅和选择：将质量判断从操作状态中分离

### 5.1 取消拒绝配额，保留质量门槛

设 A 为 accepted，R 为 rejected，候选池 P 固定且不扩池。现行约束为 R ≥ 3A，因此在仅有 accepted/rejected 两种决定时，A / (A + R) ≤ 25%。这人为限定了接受比例，并不验证判断正确性。

例如 P = 11，7 家独立合格：

- 收 5 家，则最多剩 6 家可拒绝，无法满足需要 15 条拒绝。
- 只收 2 家能满足算术，但违背“合格就收、最多 5 家”，还让其余合格者没有合法去向。
- 再扩池违反单次固定池规则。

这不是假设中的边角：learning log 的 August 20 恢复记录出现了同样矛盾。本次保留 3:1 原规则，**把取消比例列为显式治理建议**，不让定时任务自行改标准。

建议把 KPI 改为：证据完整性、抽查后的误拒率、复审改判率、来源覆盖、从发现到发布耗时、事实更正率和卡住的合格项目数。不要奖励 rejected-only 运行本身；只有拒绝理由经抽查成立、过程覆盖合格，才算完成。

### 5.2 结果状态建议

| 状态 | 定义 | 是否计入质量拒绝 |
|---|---|---|
| accepted_ready | 产品/编辑/事实检查通过 | 否 |
| rejected_quality | 有足够证据仍未达到质量标准 | 是 |
| excluded_policy | 明确违反已批准的品类或主体限制 | 单列 |
| evidence_pending | 融资日期/轮次/产品事实待补 | 否 |
| access_blocked | 访问/语言/渲染等障碍 | 否 |
| schema_deferred | 来源事实明确但当前数据模型无法表达 | 否 |
| publication_blocked | 编辑合格，截图/CI/部署等未过 | 否 |
| governance_revisit | 冻结历史或需业务决策 | 否 |

不建议现在一次性重写 872 条冻结历史。先增加只读审计/复审层，保留旧行；以后对明确触发的项目逐个形成可审查的 supersession 迁移。不能让状态细分变成规避质量标准的借口。

### 5.3 保留品味，但按产品形态解释“工艺感”

“有赌注、解决具体问题”仍然有价值。需要纠正的是只用字体、颜色、首页精致度衡量工艺，尤其当 Q1/Q2/Q3 二选三决定录取时。

| 产品形态 | 更合适的工艺证据 |
|---|---|
| 消费应用 | 核心任务完成、交互、响应、可理解性、留存机制 |
| B2B/Agent | 权限边界、集成、异常处理、审计、可撤销操作、真实工作流 |
| API/开发者工具 | 文档、错误模型、SDK、一致性、示例可复现、运维与迁移 |
| 工业/机器人 | 实际部署、设备/工作流演示、工况、操作安全、维护方式 |
| 生物/医疗 | 研究阶段、机制、方法、试验/论文、终点和限制；不能要求商业 SaaS 式 demo |

对 taste 的“否”必须同时写出反证搜索：尝试寻找了什么、在哪个页面、为什么仍不成立。与已收录同类比较使用同一标准，不把熟悉品牌或融资声量当评分加分。

### 5.4 复审优先顺序

P0：TrustedRouter、Conveo 的错误字段拒绝；BrainChild 的遗漏论文；Celero/Dawraty 的访问型拒绝。

P1：Easy Aerial、Outline；Jaipur/Octave 等表示方式受限案例；原来源路径不一致的 Moonwalk/Split。

P2：pre-seed、A+、late-stage 的统一产品线决策；Emberos/Lightsage 等排除品类边界；legacy Antioch/Mistral/Bluecore 的治理复审。

这是一张复审队列，不是本次收录名单。Antioch 已有可打开的官方新融资公告，但是否改写旧拒绝仍需要独立产品评估和历史治理迁移。[^12]

建议每周对 5–10 条不同原因的拒绝做盲复核：先隐藏原结论、重新找证据，再比较。不要求新的自动 recurring job；先作为未来 Daily/人工质量抽样方案评估。

## 6. 投资机构页面与更新机制

### 6.1 原有页面为什么空

数据与页面都缺少明确的机构事实层。原页只渲染名称/Logo/官网/一段简介及融资列表；没有成立年份、类型、阶段、行业、地域、投资方法、创始人支持、来源或复查日期。

同时存在三类语义风险：

- 列表依赖 `funding.lead_investor` 的 canonical slug，不覆盖所有参投关系。
- round 数不是 distinct company 数，不能混用。
- 历史复合别名会把 “A and B” 映射到第一家；Lightspeed India 的别名也不能证明与 LSVP 是一个投资实体。其官网明确披露独立运营关系。[^13]

因此页面改进必须同时提高信息量和说明数据边界，不能只多加漂亮字段。

### 6.2 本次实现

采用兼容的 sidecar，而非直接修改 D1：

- `content/investor-profiles.json`：来源绑定的 summary、结构化 facts、sources、`reviewed_at`、失败尝试与短期 retry。
- `src/lib/investor-profiles.ts`：纯验证和 freshness 决策，不联网、不写数据。
- `scripts/investor-research.ts`：明确关联范围的只读 planner；读取 startup 的全部参投方与每个 lead，去重，明确输出无法匹配的投资方。
- 页面：Firm profile、字段级来源链接、复查日期、官方资源、独立的已跟踪公司数/融资数/最近日期，以及数据覆盖说明。
- 投资机构索引页：显示有档案的标记及复查日期。空 portfolio 的 noindex、hub/sitemap 共享资格门槛保持不变。
- full gate 与 build 都加入 investor-profile validation，检查新机构必须有最小可用档案、日期、来源 ID、官方 HTTPS 来源域、重复/非法字段和补齐后的 legacy 状态。

初始 7 家：a16z、Battery、Bessemer、Index、Khosla、Lightspeed、YC。均有本次实际打开的一手材料；未把没有证据的 AUM、基金余额、票面金额或负责人名单硬填进去。[^14][^15][^16][^17][^18][^19]

YC 旧简介“一年两期”与当前官网不符；本次改为不易过时的 program 描述。不是仅把“两”换成“四”后继续依赖无日期的句子。[^19]

基线 254 家中 7 家有新档案，247 家明确处于待补齐状态。**没有宣称 254 家全部研究完成**；以后随相关 startup 工作逐步维护，避免每次任务全量扫目录。

### 6.3 更新规则

| 情况 | 动作 | 日期规则 |
|---|---|---|
| 90 天以内完整核验，无实质变化 | 跳过，复用 | 不改 reviewed_at |
| 距完整核验满 90 天 | 复查来源和保留字段 | 全部完成后写新日期 |
| 新机构 | 核对身份、补最小来源档案 | 不能假造资料或塞进 legacy 豁免 |
| 既有机构但没有档案 | 随本次关联项目补齐 | 仍缺证据则保留 pending |
| 实质变化/发现错误 | 提前复查 | 记录 trigger，不是一见新融资就全改 |
| 官网不可达或身份有疑点 | 保留旧档案，记录 1–7 天重试 | failed attempt 不刷新研究日期 |

90 天是本次选择的维护默认值，不是已经实验证明的最优频率。它兼顾机构基本信息变化速度与重复访问成本；人员/新基金/主体变更靠事件提前复查。后续可根据实际过期错误频率调整，但不能由定时任务自行放宽来源标准。

机构新档案的最低要求是实质摘要、机构类型和至少一项其他有用、可溯源事实；没有披露的阶段/地域可以省略。这样不把大机构的信息披露能力变成小机构永远无法进入目录的隐形门槛。

## 7. 安全边界与验证

本次在独立分支 `codex/curation-investor-review-20260909` 实施；原主 checkout 及 9 月 9 日 dirty Daily worktree 未被覆盖，原候选/截图/lease 状态未改。

设计刻意不动：

- startup 金额/stage schema、D1 表、newsletter 和当前拒绝摘要；
- 872 条 legacy 冻结区与 13 条当日未提交拒绝；
- screenshot 独立复核规则、GSC 防重复点击、单轮候选池与五家上限；
- 空投资机构页面的 indexability 条件；
- 线上部署与任何手动 newsletter 发送。

全量验证不仅检查新功能，还会访问历史来源。因此一次构建或单元测试成功不代表可以发布；任何历史来源、品牌或发布 gate 阻塞都应单独列出，不隐藏成“新功能全部上线”。

具体执行结果由报告末尾的交付状态更新；建议和代码完成状态不能替代 exact-SHA CI、部署和线上验收。

## 8. 优先级与落地顺序

| 优先级 | 动作 | 本次状态 |
|---|---|---|
| P0 | 修正未知 lead 字段解释，禁止按参投顺序猜领投 | 本地规则修正；未新增公司 |
| P0 | 投资机构结构化页面、来源、日期、按需复查 | 本地实现；7 家初始资料 |
| P0 | 将关联机构维护写入 Daily 任务 | repo 文档已写；app prompt 以兼容方式同步 |
| P1 | 移除 3:1 配额、替换奖励指标 | 治理建议，未擅自改变 |
| P1 | 区分 access/evidence/schema 与质量拒绝 | 审计快照已分层；正式账本迁移尚未做 |
| P1 | 对重点误筛案例复审、完成独立截图审核 | 明确队列；未直接收录 |
| P2 | 原币/原始轮次/融资工具模型 | 设计建议，需跨消费者迁移测试 |
| P2 | 行业化 rubric、来源覆盖账本、盲复审抽样 | 建议有界试验，未新建自动任务 |

成功标准不是把接受率调到某个好看的数字，而是：每个好项目获得适当证据路径；每条拒绝可以解释并复查；每个未发布项目有明确的非质量原因；每家投资机构能从有日期的一手材料中被理解。

## 一手来源

以下材料于 2026-09-09 打开。公司/机构陈述均按其自述处理；未把营销指标转述成独立事实。Easy Aerial 和 Dawraty 的判断仅审计原账本规则/访问记录，未声称完成全新产品研究。

[^1]: [TrustedRouter 官方 Seed 公告](https://trustedrouter.com/blog/we-raised-1-25m-seed)。
[^2]: [Conveo 官方 Series A 媒体资料](https://conveo.ai/mediakit/series-a)。
[^3]: [Emberos 官方 Seed 公告](https://www.emberos.ai/knowledge-hub/emberos-raises-5.5-million-seed-round)。
[^4]: [HTGF：Jaipur Robotics Seed](https://www.htgf.de/en/jaipur-robotics-seed/)。
[^5]: [Octave 官方融资公告](https://octave.energy/en/octave-in-the-news/octaveenergy-raises-10-million-to-accelerate-european-expansion/)。
[^6]: [Backbone 官方融资说明](https://www.usebackbone.ai/resources/backbone-raises-%E2%82%AC4m-to-build-the-quality-brain-for-the-food-industry)。
[^7]: [BrainChild Bio：新闻与论文](https://brainchildbio.com/press/)。
[^8]: [Nature Medicine：B7-H3 CAR T Phase 1 论文](https://www.nature.com/articles/s41591-024-03451-3)。本文仅以论文存在反驳“无可检查临床证据”，不作疗效或投资建议。
[^9]: [Outline 官方产品页](https://www.outlineapp.ai/)。
[^10]: [BioPharma Dive：Moonwalk 报道的实际路径](https://www.biopharmadive.com/news/moonwalk-series-b-obesity-rna-interference/829784/)。
[^11]: [Axios：Split Pay 报道的实际路径](https://www.axios.com/2026/09/08/split-pay-khosla-125-million)。仅用于报道身份核对。
[^12]: [Antioch 官方 Series A 公告](https://antioch.com/blog/series-a)。
[^13]: [Lightspeed：机构背景与独立实体说明](https://lsvp.com/about/)。
[^14]: [a16z：About](https://a16z.com/about/)，[官方 portfolio](https://a16z.com/portfolio/)。
[^15]: [Battery：About](https://www.battery.com/about/)，[Services](https://www.battery.com/services/)。
[^16]: [Bessemer：Early stage](https://www.bvp.com/early-stage)。
[^17]: [Index：Philosophy](https://www.indexventures.com/philosophy/)，[Index Press](https://www.indexventures.com/index-press/)。
[^18]: [Khosla Ventures 官方介绍](https://www.khoslaventures.com/)，[Venture Assistance](https://www.khoslaventures.com/entrepreneurs)。
[^19]: [YC：What happens at YC](https://www.ycombinator.com/about/)，[FAQ](https://www.ycombinator.com/faq)。

## 交付状态

截至 2026-09-09 19:06 CST：

- 研究：完成四个候选池的口径重建、54 条拒绝原文快照和重点案例复核；19 组网页/论文引用均在报告中。没有将审计意见写回正式拒绝账本。
- 本地实现：7 家机构档案、247 家 legacy 待补、90 天 planner、失败重试记录、字段来源检查、新机构不能进入历史豁免的冻结边界、复合别名/LSIP 警告、页面与任务文档。
- 测试：完整单元测试套件 584/584 通过；随后对最后的历史豁免边界加固，16/16 投资机构定向测试通过。最终 Astro check 检查 161 个文件，0 errors / 0 warnings / 0 hints；最终 build 于 19:04:46 CST 成功，304 张既有截图校验通过。依赖安装与 audit 为 0 vulnerabilities。
- 浏览器：桌面 1280px、手机 390px，无页面横向溢出、无损坏图片；验证了来源锚点、Lightspeed 长主体说明、214 张目录卡片及 7 个研究标记；Pitango 空页面保持 `noindex,follow`。本地 Astro dev 的 public logo 路由返回 404，构建产物中的同一 PNG 文件完整且能正常加载，所以最终视觉检查使用 `dist/client` 的本地静态预览。这不替代 Cloudflare 线上路由验收。
- 完整发布门禁：**未通过**。两篇历史 SiliconANGLE 来源持续返回 HTTP 503，分别影响 Kodesage、SkyPilot 的融资与 research 引用，共 4 个引用错误，并导致 weekly/9 的下游有效 startup 引用检查报错。源文件并未丢失。没有修改旧公司内容、降低可达性标准或绕过 gate。
- 实现迭代：修复了最初 fixture 类型声明；恢复截图校验优先的 build 顺序，避免新增步骤绕过原 fixture 契约；保留 a16z 既有 portfolio 官网映射以匹配已核验 Logo provenance。这些本次引入的问题已修正，后续测试通过。
- 任务配置：现有 `venturedex-daily-curator` 已通过 app 工具更新并逐字段读回；原 schedule/model/status/project 保持不变。新 prompt 有旧版兼容分支，未发布新 schema 时不会要求 Daily 生成未知字段。
- 发布边界：**没有 commit、push、merge、生产部署、GSC 请求或手动 newsletter**。主 checkout 保持 clean、read-only；原 Daily run 仍为 `blocked/closeout` revision 96，四张未审批截图的哈希未变。新增功能位于独立的本地维护分支。
- 清理：关闭本次 iab 标签、恢复 viewport，停止本次本地预览服务。6 张由 build 新生成的 Weekly OG 临时文件移到独占 `/tmp/venturedex-investor-build-assets.xXtb8x/` 保存，不混入源代码改动。

可视证据：

- [桌面机构档案](/Users/dai/.codex/visualizations/2026/09/09/01a084ae-b988-7952-a1ea-a6ebda5480cc/investor-profile-desktop.jpg)
- [手机机构档案](/Users/dai/.codex/visualizations/2026/09/09/01a084ae-b988-7952-a1ea-a6ebda5480cc/investor-profile-mobile.jpg)
- [手机来源与融资统计](/Users/dai/.codex/visualizations/2026/09/09/01a084ae-b988-7952-a1ea-a6ebda5480cc/investor-profile-mobile-evidence.jpg)
- [投资机构目录](/Users/dai/.codex/visualizations/2026/09/09/01a084ae-b988-7952-a1ea-a6ebda5480cc/investor-directory-desktop.jpg)

下一步发布前应处理或重新验证这两条历史来源，再从完整 gate 开始验证并走正常评审/部署。3:1、原币/轮次模型和正式拒绝状态迁移仍是需要明确选择的治理方案，不得由未来 Daily 自行启用。
