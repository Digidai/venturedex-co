# Wave 2 存量档案证据复核 — Group B

复核日期：2026-09-08。范围：Venus Aerospace、Enzo Health、CVRD Health、Niteshift、Architect Labs 的公开产品、工作流与既有融资来源。

## 方法与边界

已完整阅读当前 `content/STANDARD.md`、`content/CODEX_TASK.md` 和 SEO 技能。此轮是明确授权的存量研究提升，不启动 Daily discovery，不新增公司，不改治理、发布时间、投资人库、截图或品牌素材。

研究使用官方网页、官方文档、公司发布的客户案例、公司新闻稿及公司署名论文摘要。没有注册、连接客户仓库、上传患者资料、申请销售演示或试用产品；也没有浏览器视觉复核、独立性能复现或合同检查。厂商结果明确归因，编辑推断放在 market context / risks，而不是伪装成实测事实。未发现价格不等于产品没有价格；只是本次公开材料未给出可确认的报价。

查询意图是针对现有页面用途的内容规划，不是当前排名、关键词搜索量或竞品排名实测。2026-09-07 的 Web / AI 曝光如被主报告引用，仍属于历史基线；本次没有新 GSC 数据。

五个档案均为**部分复核**：更新了 summary / editor_note / why_featured、产品证据、主要用户、差异和风险；融资逐字段复核后保留。旧评分、featured、社交及招聘链接未全面重审，不重新声明全档案验证完成。因此全部保留原 `research.verified_at`：

| 公司 | 保留日期 | 复核后来源数 / 产品证据数 |
|---|---|---|
| Venus Aerospace | 2026-08-09 | 6 / 4 |
| Enzo Health | 2026-05-26 | 6 / 5 |
| CVRD Health | 2026-05-26 | 6 / 4 |
| Niteshift | 2026-06-12 | 7 / 6 |
| Architect Labs | 2026-06-19 | 5 / 4 |

## Venus Aerospace

旧问题：summary 偏重 reusable hypersonic flight，容易遮蔽近期防务/航天发动机的交付阶段；产品证据误称 Series B 用于 VDR，原新闻稿实际强调 RDRE 系统成熟与生产；15% 效率厂商主张容易被读成独立验证。

查询意图：`Venus Aerospace RDRE vs VDR`、`Venus Aerospace engine flight test`、`Venus Aerospace Lockheed Martin`，回答产品是什么、谁在评估、距运营部署还有什么步骤。

实际来源与摘要：

- [官方首页](https://www.venusaero.com/)：同时展示 RDRE 与 VDR，不能据此将全部产品写成已运营的高速交通系统。
- [RDRE 产品](https://www.venusaero.com/rdre)：旋转爆震燃烧室、标准材料和无运动部件的设计描述；应用包括航天推进。效率和成本比较未在本次独立复现。
- [VDR 产品](https://www.venusaero.com/vdr)：RDRE 与吸气式 ramjet 组合；商业高速旅行在页面中属于未来应用。
- [7 月 21 日 Lockheed Martin 开发协议](https://www.venusaero.com/newsroom/lockheed-martin-and-venus-aerospace-collaborate-to-advance-propulsion-for-long-range-precision-fires)：RDRE booster 架构评估及系统级测试工作；不是量产采购或运营部署证明。
- [9 月 1 日 CycloRP 测试更新](https://www.venusaero.com/newsroom/cyclokinetics-selects-venus-aerospace-to-test-cyclorp-under-air-force-backed-program)：7 月燃料爆震测试完成，冷却性能测试仍为后续阶段，完整技术读出预计 2027 年初。
- [7 月 8 日融资公告](https://www.venusaero.com/newsroom/venus-aerospace-raises-91m-series-b)：明确 $91M Series B、Mercury Fund 领投；保留既有金额、轮次、领投与日期。公告说明从 flight demonstration 推进到 deployable propulsion，不支持已完成 VDR 商用。

修改决定：去掉泛化交通承诺和未独立验证的效率数字；用具名评估与分阶段测试取代融资式产品证据；主要用户写成推进/载具集成团队。未核实：实际交付、复用寿命、生产量、报价、独立性能数据及全量社交/招聘链接。

## Enzo Health

旧问题：primary_user 是通用 healthcare / benefits / life-sciences；differentiation 是融资标签；产品证据重复 summary 和短评；没有清楚说明人工审核责任。官网如今主推 EHR，存量摘要仅列三种模块。

查询意图：`Enzo Health home health EHR`、`Enzo OASIS scribe`、`Enzo Health intake integration`、`Enzo Health funding 20M 26M`，回答适用机构、从 referral 到 documentation 的工作流，以及 EHR 替换和模块集成的区别。

实际来源与摘要：

- [当前主页](https://www.enzo.health/)：EHR 覆盖 intake、scheduling、notes、coding、claims 等，团队 review / approve；没有把“自动化所有步骤”的营销主张变成无人监管临床事实。
- [Intake](https://www.enzo.health/intake)：eFax、portal、upload 输入，包件检查、负责人/状态/活动记录，接受后交给排程；页面仍有现有 EHR 集成表述。
- [Scribe](https://www.enzo.health/scribe)：会话生成 OASIS-ready notes、药品标签输入；临床人员编辑和签署后才提交。
- [QA](https://www.enzo.health/qa)：检查和解释文档/编码问题，人工 confirm / adjust / override；没有加入诊断准确率或疗效结论。
- [Commonwealth Home Care 案例](https://www.enzo.health/customers/commonwealth-home-care)：AI-assisted ICD coding 配合 coding reviewers；该机构自己的团队负责 OASIS。缺少支持的编码会触发临床澄清，不等于软件确诊患者。
- [Enzo 发布的 PR Newswire 融资原文](https://www.prnewswire.com/news-releases/enzo-health-raises-26m-to-deploy-ai-across-home-health-to-meet-unprecedented-nationwide-demand-for-post-acute-care-302760538.html)：2026-05-04 的正文明确 **$20M Series A，累计 $26M**；N47 领投，Gradient、Tandem Ventures、Rigby Watts 参与。现有 $20M 正确，不按标题改为 $26M。

修改决定：明确 home-health agency 管理员、intake coordinator、visiting clinician、coding/QA 用户；写出输入、审核、交接与责任；去掉五分钟和收入提升的宣传捷径。未核实：具体支持哪些 EHR、模块与整套替换的商业范围、价格、迁移工作量、独立临床/财务效果、数据保护合同和全档案视觉/链接。首页“替换 EHR”与模块“连接现有 EHR”并非必然冲突，但需按采购方案确认，不能擅自替厂商解释。

## CVRD Health

旧问题：主要用户和产品类别过于通用；用 151-enrollee 案例充当差异化；短评强调 $536,870 节省，却没有说明比较基准、厂商归因或公开表格的不一致。

查询意图：`CVRD Health fringe tracking`、`CVRD ICHRA government contractors`、`CVRD payroll integration`、`CVRD Aptive case study`，回答 payroll / finance / HR 团队实际管理什么，以及实施与合规边界。

实际来源与摘要：

- [官方主页](https://www.becvrd.com/)：明确 HR / benefits、CFO / controller 等角色及 SCA / DBA 场景，不是面向患者的诊疗软件。
- [How CVRD Works](https://www.becvrd.com/how-cvrd-works)：payroll 输入、按人和合同跟踪、benefit 分配、Wallet、记录；点名 UKG / Paylocity，未把“150+”推成所有系统已经验证兼容。
- [Compliance & Tracking](https://www.becvrd.com/compliance-tracking)：员工/合同/wage determination 层级，H&W spend 和 reserve；厂商称不持有雇主资金。本轮不对资金托管结构出法律意见。
- [ICHRA for GovCon](https://www.becvrd.com/ichra-for-govcon)：列出 notice、coverage substantiation、affordability、opt-out、class rules、ACA reporting 等实施事项。只写产品支持范围，不承诺客户自动合规。
- [Aptive 2026 案例](https://www.becvrd.com/case-study/aptive-resources)：从 group coverage 转 ICHRA；页首为 151 enrollees / $536,870 annual savings / 39% premium savings。表格 weighted-average 一行却为 52%；employee-only 数量在主表 96、重复分项 92，spouse 为 15 / 12，children 为 13 / 17。比例可能采用不同口径，但页面没有解释；不能自动选一个数字为准确预测。
- [CVRD 发布的融资原文](https://www.prnewswire.com/news-releases/cvrd-health-announces-5m-seed-round-led-by-upfront-ventures-to-modernize-benefits-compliance-for-federal-government-contractors-302779218.html)：$5M Seed，Upfront Ventures 领投，发布日期 2026-05-21，原融资字段保留。

修改决定：产品证据改为 payroll-to-benefits 流程，保留具名案例和厂商报告的 151 总人数但移除短评中的 savings headline；公开数据冲突进入风险，不修造厂商表格。未核实：底层工资和 carrier 发票、完整参保名单、收益基准与审计、报价、connector 范围、合规意见和旧链接。既有 editor_rating / featured 不因本轮部分复核自动重新背书。

## Niteshift

旧问题：首页功能串联而缺少配置合同、收费边界和具名工作流；“verify PR”容易被理解成每次自动完整验证，忽略任务指令和测试环境责任。

查询意图：`Niteshift coding agents pricing`、`Niteshift setup`、`Niteshift browser PR evidence`、`Niteshift database isolation`，支持工程和平台团队评估，而不是泛化 AI coding 排名页。

实际来源与摘要：

- [首页](https://niteshift.dev/)：Claude Code / Codex / OpenCode / Pi 及 GitHub / Slack / Linear 入口。
- [Configuration docs](https://docs.niteshift.dev/environment-configuration/overview)：`.niteshift/` 配置通过 PR 合入，setup / resume / services 各有职责；secret 分 setup 与 agent scopes，预览要求组织认证。没有实际测试权限实现。
- [Browser docs](https://docs.niteshift.dev/browser-automation)：`/browser`、`/screenshots`、`/demo` 及 PR artifact 工作流；可在环境指令要求使用，不等于所有变更已自动证明正确。
- [Database branches](https://docs.niteshift.dev/environment-configuration/database-branches)：必须连接 Neon，任务从指定 parent fork；保留期与归档删除会影响状态。不是任意外部数据库天然被隔离。
- [Pricing](https://niteshift.dev/pricing)：0.1 credits / active agent minute；Individual $50、Team $250 按月折为等额 credits，idle 不收费，模型 tokens 自带 API key 或订阅。价格是 2026-09-08 页面快照，不保证之后不变。
- [Ambrook 案例](https://niteshift.dev/customers/ambrook)：把组件迁移拆成可评审任务，加入 Storybook / visual tests，使用两种 agent；报告 58 tasks / 29 merged PRs，仅为这一项目的厂商发布案例，不是平均成功率。
- [6 月 10 日融资公告](https://niteshift.dev/blog/introducing-niteshift)：明确 $7M Seed / Greylock；既有融资字段保留。

修改决定：从功能枚举改成配置、执行、测试产物、review 的具体流程，加入费用及状态保存边界。未核实：真实 repository 运行、权限/隔离穿透测试、账单、所有 agent 与商业订阅兼容性、团队平均速度提升。文档的 `.md` 镜像在研究工具中未能打开，随后成功读取 HTML 正文；JSON 只登记成功读取的 HTML URL。

## Architect Labs

旧问题：产品证据重复宏观愿景；以创始人 80+ 历史芯片经历支撑当前 AI 系统，容易混同团队履历与本公司的交付记录；没有 8 月 Redwood 新证据与测量边界。

查询意图：`Architect Labs custom silicon`、`Architect Labs Redwood FPGA`、`Redwood AI chip tapeout`，回答设计合作范围、可复核演示、FPGA / ASIC 区别。

实际来源与摘要：

- [主页](https://architectlabs.com/) 和 [About](https://architectlabs.com/about)：面向 semiconductor / workload owners 的 custom ASIC 合作，覆盖 architecture 至 tapeout 的程序级范围；不是可自助购买的 EDA 插件。
- [Redwood 8 月 27 日披露](https://architectlabs.com/blog/redwood)：具体 FPGA 为 AMD Versal VPK180、2x2 tile、250 MHz，Qwen3-0.6B 为 12.1 tokens/s 的公司报告；Samsung 8 nm 效率是 ASIC projection，GDSII 和 TSMC tapeout 仍是后续工作。没有写成量产芯片成绩。
- [公司署名 preprint v2 摘要](https://arxiv.org/abs/2608.26418v2)：描述从两名架构师 spec 生成 RTL / verification / software artifacts 的演示。仅检查摘要和官方技术博文，未阅读全文、验证完整设计文件或声称同行评审/独立复现。
- [6 月 18 日融资公告](https://architectlabs.com/blog/seed)：直接 URL 在网页研究工具多次 timeout；同官网[带来源参数的同一文章](https://architectlabs.com/blog/seed?from_theconsensus=1)正文可读，明确 $24M Seed / Kindred Ventures。随后本地来源 HTTP 检查确认无参数 URL 返回 200；保留原 funding URL，不把抓取超时误写成源不存在。

修改决定：以具体 FPGA 演示取代团队履历作为产品证据，并将 ASIC 性能、实际 tapeout 和生产良率列为未闭合项。未核实：独立 benchmark、foundry acceptance、具名客户最终交付、合同与价格、每项目专家投入、完整视觉和链接。旧 verified_at 继续保留。

## 本地验证与交付边界

- 五个 JSON 可解析；summary ≤ 100、editor_note 150–500、why_featured ≤ 40；全部新增 evidence 30–260 字符、risk 30–240、basis 20–180；source_ids 完整。
- `git diff --check` 通过。
- 针对这五个文件调用 `scripts/validate.py` 的 `validate_startup`：5 / 5 无错误，30 个唯一来源/公司 URL 全部 HTTP 200（最多 4 个并发）。HTTP 200 仅为可达性，不代表事实真伪或搜索收录。
- 两条自动 N3 提示已人工复核：CVRD 短评有按员工/合同跟踪、Wallet 和 carrier payment 具体功能；Niteshift 有 `.niteshift` 配置、browser artifact 和组件迁移流程。校验器数字/API 等正则没有覆盖这些术语，并非缺少产品事实；不为消除提示硬塞无关数字。
- 不运行全站 build，不写 seed，不发布；完整 CI / 视觉与其他组内容不在此验证结论中。
- 未 commit / push / IndexNow / GSC；集成、完整 CI 和发布由根任务负责。
