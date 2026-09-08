# Growth wave 2：Group A 存量档案证据复核

复核日期：2026-09-08。范围为 Shapes、Scaled Cognition、Antora Energy、Verse、Throne Science 五个现有档案；这是存量研究提升，不是 Daily discovery 或新增收录。

## 方法与验证边界

- 按 `content/STANDARD.md`、`content/CODEX_TASK.md` 及 SEO skill 的搜索意图、来源可信度和真实更新原则执行。主要改动是把泛化定位换成可追到原始来源的工作流，并拆开产品说明、合作公告、厂商指标和编辑判断。
- 下列查询意图是本轮内容设计假设，不是新采集的关键词搜索量、排名或转化数据。未更改 9 月 7 日 GSC 基线，也不把新增证据视作已经获得搜索或 AI 引用流量。
- Codex IAB 在当前任务环境不可用，采用公开官网、产品文档、支持页面及公告的只读网页检索。未注册、登录、购买、发起聊天、提交表单、运行 API、安装硬件或访问生产系统。公开界面和文档描述不等于亲自完成工作流。
- 五个 `research.verified_at` 均保留原值。此次复核覆盖核心产品、主要使用者、公开商业边界和现有融资来源，但不声称完整重审公司身份、团队、法务、每个链接或所有历史事实。此次部分复核日期仅记录于本报告，不刷新全档验证时间。
- 不改融资金额、轮次或日期，不改 timestamps、截图、品牌资产、投资人库或自动化。来源 ID 尽量保留，新增来源仅限实际读取的页面；融资没有伪装成产品证据。

| 档案 | 保留的 verified_at | 本轮最重要的更正 |
| --- | --- | --- |
| Shapes | 2026-05-26 | 群聊/角色创建/credits 变成具体证据；移除无依据年份；投资人收敛 |
| Scaled Cognition | 2026-08-02 | 说明 transcript → policy review → simulation；不背书零幻觉 |
| Antora Energy | 2026-08-03 | 首次交付能源不等于 5 GWh 全部投产；当前交付与未来 TPV 分开 |
| Verse | 2026-06-19 | 分开规划、调度、账单检查和硬件伙伴；不承诺更快并网 |
| Throne Science | 2026-08-12 | wellness/消费者、安装要求和订阅；不暗示临床采用或疗效 |

## Shapes

旧问题：产品证据主要复述 summary；editor note 引用动态消息计数，不能说明真实留存；公开网页容易被理解为所有模型都免费。旧成立年份和投资人名单缺少当前来源支撑。

查询意图：`Shapes AI group chat`、`how to add friends and AI to Shapes`、`create a Shape character`、`is Shapes free / Shape Credits`。目标是让读者知道它是怎样的社交产品、怎样开始、何处可能收费，而不是把消费者产品写成企业 Agent 平台。

实际读取来源与证据：

- [产品首页](https://talk.shapes.inc)：用于核对当前社交聊天定位；未把角色计数、活跃度或首页免费宣传当作已独立验证的使用指标。
- [群聊操作指南](https://docs.shapes.inc/create-a-chat)（`official_chat_guide`）：提供建聊和邀请人/AI 的入口；据此补充可复核的开始流程。
- [角色创建指南](https://docs.shapes.inc/how-to-make-a-shape)（`official_character_guide`）：提供角色设置项和发布步骤，不推断自定义角色的实际表现。
- [文档介绍](https://docs.shapes.inc/introduction)（`official_docs`）：明确多人及多 AI 同聊，并区分免费引擎和使用 credits 的 premium 引擎。
- [Products & Services](https://docs.shapes.inc/premium)：说明 premium subscription 暂停、credits 仍存在。仅用于交叉检查，不把不同付费产品混成一个订阅。
- [官方融资公告](https://shapes.inc/blog/ai-enters-the-group-chat)（`official_funding`）：确认原有 $8M Seed、4 月 29 日发布、Lightspeed 领投；列出 AI Capital Partners / AI Grant。同时使用 2021 成立口径。
- [既有 TechCrunch 来源](https://techcrunch.com/2026/04/29/meet-shapes-the-app-bringing-humans-and-ai-into-the-same-group-chats/)（`funding_1`）：融资一致，成立年份口径不同。

修改/保留：新增四条具体产品证据；primary user 明确消费者、角色创作者及 fandom/roleplay 群体；删去旧 `founded_year: 2023`，不选择性改为另一年份。`investors` 只保留核实且已注册的 Lightspeed；本轮来源未支持旧 Betaworks、Hartbeat Ventures、The Games Fund 名单，不据此声称它们从未投资。AI Capital Partners / AI Grant 未写入投资人库。公开 research risk 说明年份冲突、名单非完整 cap table，以及实测安全/成本边界。

未核实：不同年份是否分别指前身、实体或当前产品；旧 team size；真实留存和消息计数；注册后模型定价、退款及 moderation 效果。未试用群聊或购买 credits。保留旧 verified_at。

## Scaled Cognition

旧问题：生命周期缩写不能让人理解实施工作；editor note 容易把“可靠性架构”写成已验证保证，缺少 transcript 输入、人工校验和连接真实系统前的边界。

查询意图：`Scaled Cognition APT customer service agents`、`AgentTwin historical transcripts`、`GenAPI simulation`、`APT VPC on premise`、`Scaled Cognition pricing`。回答谁实施、输入什么、怎样测试、哪些能力仍待购买方验证。

实际读取来源与证据：

- [官网](https://www.scaledcognition.com/)（`official_site`）：确认 CX 定位；未采用“唯一”“零幻觉”等排他或绝对营销结论。
- [APT 产品页](https://www.scaledcognition.com/product/meet-apt-1)（`official_apt`）：说明参数 schema 校验及执行确认；只按厂商所述记录机制。
- [平台页](https://www.scaledcognition.com/product/explore-platform)（`official_platform`）：提供 builder/SDK、模拟和日志等实施环节，不声称本轮验证了它们的表现。
- [AgentTwin](https://www.scaledcognition.com/product/agenttwin)（`official_agenttwin`）：历史支持对话作为行为草稿输入，保留人的政策审阅；没有采用“一天上线”等时长承诺。
- [Genesys 自有合作公告](https://www.genesys.com/company/newsroom/announcements/genesys-and-scaled-cognition-partner-to-advance-responsible-agentic-ai-customer-experience-orchestration)（`partner_genesys`）：确认合作及拟提供的联合能力。它不是具名终端客户的生产效果报告。
- [现有 Series A 来源](https://www.scaledcognition.com/series-a)（`funding_1`）：保留已匹配的 $100M、Series A、Khosla Ventures、2026-06-25。
- [Contact / demo](https://www.scaledcognition.com/contact)：公开入口是厂商评估，不据此推断所有合同条款、rate card 或可立即自助使用。

修改/保留：新增 AgentTwin 和 Genesys 来源；产品证据从抽象生命周期改为操作环节；primary user 区分 CX 工程和运营。删除原文将 SOC 2 写成已确认 controls 的句子，本轮未读取审计报告，也不作认证背书。公开风险列政策冲突、部分 API 失败、集成工作和商业条款；融资值与旧 verified_at 不变。

未核实：API 的真实权限检查、失败恢复、人工接管、量化可靠性、独立 benchmark、终端客户实际采用、价格及 SLA。合作/投资公告不能代表所有 Genesys 客户已经使用 APT。

## Antora Energy

旧问题：`5 GWh deployment` 容易把计划容量和全面投产混为一谈；碳块储热温度也可能被误读为交付给工厂的热温度。技术路线需区分现有蒸汽系统与未来直接电转换。

查询意图：`Antora thermal battery how it works`、`Antora industrial heat temperature`、`Project Big Stone POET status`、`Antora power steam turbine TPV`、`thermal battery heat offtake`。

实际读取来源与证据：

- [官网](https://www.antora.com/)（`official_site`）及 [技术页](https://www.antora.com/technology)（`official_technology`）：确认碳储热路径；TPV 被放在未来产品部分，未写成当前已交付的默认发电方式。
- [Solutions](https://www.antora.com/solutions)（`official_solutions`）：列出 HeatCore 与 steam-turbine power block，以及从选址、供电、融资到运营的项目服务。
- [Big Stone 项目页](https://www.antora.com/project-big-stone)（`official_project`）：核对项目阶段；该页仍区分已开始能源交付与后续完成。
- [POET 自有 commissioning 公告](https://poet.com/pr/antora-and-poet-commission-5-gigawatt-hour-thermal-battery-project)（`customer_poet`）：买方确认首批能源及长期热采购安排。其 5 月 19 日公告仍把全面运行放在当年后续，而非当时已完成。
- [现有 Series C 公告](https://www.antora.com/insights/series-c)（`official_funding`）：匹配 $550M、Series C、G2/Eclipse、2026-07-30；融资不证明项目单位经济性。

修改/保留：why_featured 改为 first energy；editor note 与公开 risk 明确 commissioning 边界。产品证据区分储热参数、热交付产品、项目商业工作流。主要用户以工业热采购方为先，其他数据中心/电网应用保留为公司营销的适用方向，不当成现有客户证据。

未核实：全项目当前完成确认、持续出力、寿命、审计后的热成本、当地 tariff 具体条款、所有产品可采购条件及重复项目交付表现。POET 的客户公告是商业方一手材料，不等于独立工程审计；未实地考察或验证电表。保留旧 verified_at。

## Verse

旧问题：headline 和产品证据偏重“最多快三年”，读者看不到软件的输入、控制范围和实体基础设施依赖。公司产品页面上的站点数、时延和示意 dashboard 也不应直接当作审计结果。

查询意图：`Verse Dispatch Intelligence`、`data center battery sizing and dispatch`、`Verse Aria Portfolio Insights`、`energy invoice validation`、`Verse Calibrant responsibilities`。

实际读取来源与证据：

- [官网](https://verse.inc/)（`official_site`）：确认当前两类产品定位，不采用示意 dashboard 数字作为客户绩效。
- [Dispatch Intelligence](https://verse.inc/platform/dispatch-intelligence)（`official_dispatch`）：提供规划、储能配置模拟、运营控制和负荷缓解等环节。
- [Portfolio Insights](https://verse.inc/platform/portfolio-insights)（`official_portfolio`）：把 meter、合同和 invoice 对账与可用性检查落成可理解任务。
- [Founders' letter](https://verse.inc/company/founders-letter)（`official_letter`）：区分 Verse 软件控制与 Calibrant 融资/建设/持有/运营硬件的责任。
- [既有 Series B 公告](https://verse.inc/newsroom/series-b)（`funding_1`）：核对 $54M、Series B、Bessemer、2026-06-18。其未来站点 onboarding 表述没有转写为已投产规模。
- [官方储能解释文章](https://verse.inc/blog/behind-the-meter-energy-storage-faster-data-center-interconnection)（`official_storage_explainer`）：用于交叉检查控制边界及指标口径，不采用文章内的政策、时延或规模数据作为独立验证结果。

修改/保留：summary 改为储能规划、调度、组合监督；四条 product evidence 解释可观察工作流；不承诺更快接电或零 GPU 影响。公开 risk 说明厂商不同页面的站点和 latency 口径需时间及站点证据对齐。具体冲突为 dispatch 页 100 ms P50、博客 217 ms P50；融资稿中的未来 100 站点与当前产品页 100+ 站点未获得按站点追踪的佐证。未将这些差异直接断言为虚假。

未核实：实际站点清单、utility 批准、独立 interconnection 基线、实现收益、时延条件、与 NVIDIA DSX 的交付阶段及终端客户合同。未访问 Aria 账户、提交 demo 或控制任何能源资产。保留旧 verified_at。

## Throne Science

旧问题：将 clinicians 与消费者并列为主要使用者，容易使读者把医生评价当成临床部署；原 evidence 对模型分析语气过于直接，缺少订阅、安装和敏感数据处理边界。

查询意图：`Throne One how it works`、`Throne toilet compatibility`、`Throne membership cost`、`Throne wellness versus diagnosis`、`Throne hydration accuracy evidence`。这是产品适配和证据边界说明，不是健康建议。

实际读取来源与证据：

- [官网](https://www.thronescience.com/)（`official_site`；跳转至无 www 主站）：核对当前硬件加 membership 产品形式。
- [How it works](https://pages.thronescience.com/how-it-works)（`official_how_it_works`）：旧主站同路径跳转到此；说明启动、采集和同步步骤及安装限制。链接改为实际目标地址。
- [Science](https://pages.thronescience.com/science)（`official_science`）：记录公司所述观测信号和 wellness disclaimer，不采用改善健康或临床准确性的绝对表述。
- [官方 membership 支持文章](https://support.thronescience.com/en/articles/12786000-is-there-a-subscription-or-ongoing-cost)（`official_membership`）：说明完整功能依赖付费会员与取消后的限制。
- [既有 Crunchbase News 融资来源](https://news.crunchbase.com/health-wellness-biotech/throne-science-microbiome-gut-health-toilet-camera-startup-john-capodilupo-whoop/)（`funding_1`）：匹配 $10M、Series A、Will Ventures、2026-07-28；不是设备疗效来源。

修改/保留：primary user 改为愿意满足硬件/网络/会员条件的消费者，类别改为 at-home wellness tracking；具体描述厂商公布的采集和安装要求。公开 risk 明确医生背书不等于临床采用、习惯相关研究不等于本设备独立验证。首页显示硬件 $399、月费 $5.99；支持文显示 $399.99、月费 $6，故正文只写需订阅并公开解释价差，不选择性硬编码总价。

未核实：设备准确率研究的完整独立方案与数据、疾病诊断适用性、健康改善、现实家庭身份误配、云端数据实践、实际结账/税运费及随访留存。没有安装或试用硬件，没有把风险说明写成医疗建议。保留旧 verified_at。

## 交接与检查

研究子任务交付上述五个 JSON 和本文档。初次轻量检查仅覆盖 JSON/schema、来源 ID 完整性、summary 长度和 `git diff --check`，**不等同于完整内容 gate**；它漏检了四条超过 500 字符的 editor note，以及三条超过 180 字符的 risk basis。完整集成检查发现后，已最小缩短这七处，不放宽验证规则、不更改事实边界。

随后直接调用 `scripts/validate.py` 的 `validate_startup`，对五档分别执行包括外部 URL 在内的现有单文件校验，使用空 URL cache，没有伪造检查结果。最终完整 errors/warnings 如下：

| slug | editor_note 字符数 | errors | warnings |
| --- | --- | --- | --- |
| shapes | 452 | `[]` | `editor_note may be missing a concrete fact or product detail (manual N3 check).` |
| scaled-cognition | 419 | `[]` | 同上 N3 warning |
| antora-energy | 419 | `[]` | `[]` |
| verse | 422 | `[]` | 同上 N3 warning |
| throne-science | 442 | `[]` | `[]` |

三个 N3 提示为关键词启发式 warning，并非内容错误。人工复核依据分别为 Shapes 的建聊/邀请/角色设置，Scaled Cognition 的 schema actions/AgentTwin/人工政策审阅，Verse 的储能规划/Calibrant 分工/账单对账；这些具体工作流均绑定本报告列出的来源。没有为了消除 warning 添入无关数字或关键词。URL gate 的允许状态不等于独立产品验证或所有页面都返回 HTTP 200。

研究阶段未执行 build、commit、push、部署、IndexNow/GSC 提交或对外消息。此后主任务另行授权 authored `updated_at` 工程修复，为确认已修改的十个档案记录同一真实 UTC 编辑时间，保留原 publish/first-seen 和 research verified_at；这与完整研究重审日期不同。集成后的站点呈现、全量质量门禁和发布仍由主任务完成；上线后再用实际索引、曝光、点击、AI referral 与引用数据判断效果。
