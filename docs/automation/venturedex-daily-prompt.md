运行 VentureDex Daily Curator。先只刷新 origin 的远端 refs，从准确 origin/main（必要时 git show）读取最新版本化契约，再创建或恢复隔离 worktree；不能把落后的主 checkout 文档当作最新政策。保留用户主 checkout 及无关改动。版本化入口：docs/automation/README.md、content/STANDARD.md、content/CODEX_TASK.md、docs/automation/venturedex-daily-runbook.md、docs/automation/throughput-and-completion.md、docs/automation/curation-decisions.md、docs/automation/venturedex-feedback-loop.md。读取 automation memory、learning-log 模板及最近 10 条；只为具体问题搜索更早历史。

最新明确人工指令决定任务范围，高于定时默认值，但不免除事实、质量与外部动作安全。默认 Daily 冻结到期复审快照及有限的新发现计划；人工要求“全部处理完”时按指定积压快照连续分批，不补无关新候选。没有最低候选数、最高发布数、拒绝比例或最多三项复审限制。10–20 只是建议批大小，三类互补来源只是覆盖建议，不能用它们阻断已核验项目。所有项目仍逐项通过编辑、研究、品牌、截图和发布门禁。记录真实资源预算（已知时）并预留最终验证/部署/收尾时间；到任务范围完成、实际资源不足或真实依赖阻塞时才停止，保存精确续做点。

新建任务前交叉核对 $CODEX_HOME/automations/venturedex-daily-curator/run-state.md、lease、注册 worktree、活动进程、Git/CI 与 GSC ledger；CODEX_HOME 未设置时使用 /Users/dai/.codex/automations/venturedex-daily-curator，并向 helper 传 --automation-dir。唯一可恢复的中断任务优先续做，不因工具句柄丢失重复发现、截图或点击。通过 scripts/automation-run-state.py acquire/checkpoint/release 管理 owner/epoch/revision CAS；不同活动 owner 或不明所有权立即停止，不手写 authority 文件。一个活动租约可管理多批清单；每批唯一 run_id、固定 identity hash、task_run_id 指向根任务，receipt 记录清单与已完成 slugs，跨批去重。

先执行 scripts/bootstrap-automation.sh venturedex-daily-curator。只有发布凭据、Actions 或依赖安装不可用时，可显式执行 --research-only 预检后继续任务范围内研究，并记录发布受阻；发布前仍必须通过完整 bootstrap 和全部 release gates。无有效仓库、内容完整性或所有权时不可降级继续。普通 Daily 不改 Weekly、代码、脚本、配置或历史内容；人类明确要求政策/实现修改时依其范围处理，不机械套用定时只读范围。

按 curation-decisions.md 和 funding-terms.md 核验：fresh 融资窗口为近 30 天，复审需到期或明确新证据/人工触发。聚合器只作线索，使用原始融资证据及行业适配的公开产品材料，不猜测金额、轮次、汇率、领投方或指标。用 curation:lookup 先查已发布及有效 overlay，再查冻结历史。保留原始记录、哈希和全部实际尝试。每批所有候选有明确结果，任务总计按唯一 slug 的最新有效状态统计，不累加重复观察。缺证据、访问故障和发布依赖不能伪装成质量拒绝；仅真实预算/排期约束可记 qualified_pending。

浏览器操作只用 CUA 的任务自有 Codex iab 标签页，基于新读取的可见状态；不回退 Comet/CDP/bb-browser，不操作用户标签页或其他浏览器进程。截图按 screenshot-quality.md：原生捕获必须真实落盘，离线导入不放大/裁切/补白；检查最终 WebP、实际卡片/详情和窄屏，将六项检查绑定最终 SHA-256。优先真实独立复核；仅一名操作者时必须另做二次复核，以相同真实身份显式标 second-pass 并写具体观察，不伪造第二复核者或审批标记。图片变化使审批失效。新公司补完整 research、官方品牌、timestamps 和可核实 careers；关联投资机构按 investor-research.md 定向维护，已新鲜且无实质变化的档案不重复重写。

编辑中先跑针对性检查，最终内容/代码输入只跑所需的一轮完整 scripts/manage.sh validate、Actions 预检及 git diff --check；输入有变更须重跑依赖检查。精确 staging，不 force-push。正常远端前进时先核对重叠，可在自有 worktree 安全 rebase 后重新验证；冲突不可猜测。生产保持精确 release SHA 的成功 Validate、串行 Deploy、Worker/D1 与 live smoke 门禁。祖先 CI 被 concurrency 取消时，不重跑过时部署：用 scripts/verify-release-coverage.py 证明 base→source→已部署后继的祖先关系及任务路径未变，再独立核验该后继精确 SHA 的 CI/Deploy/live 成功。脚本只证明 Git 覆盖，不证明上线。网络 IncompleteRead 等是探测警告；无足够成功 live 证据或有真实内容断言失败仍阻塞发布验收。

发布后按 gsc-codex-browser.md 只读规划新 URL 或 retry_pending；自动选择器分页显示总数、余量和 next_offset，成功请求后从 offset 0 重规划。只有 ready 状态可 begin 持久化意图后点一次，再 finish 记录新鲜、精确 URL/tab/route 绑定确认。IndexNow HTTP 200、GSC requested、真实收录是三个不同结果。从未点击的 URL 可用 defer 留队；pending/unknown/orphan 不可重置或重点击。GSC/登录/配额故障记录为索引跟进，不抹去已验证的网站发布；若当前人工目标就是完成 GSC，则该目标仍未完成。Newsletter 保持现有延迟和 Cron 控制，不手动触发、不绕过幂等与退订。

按 throughput-and-completion.md 分开报告策展、发布、索引、邮件和运维，不计算旧 reward 加减分。每次在 automation memory 写简洁 receipt 与当前时间；版本化 learning-log 只追加重要新教训、政策变化或纠错。把已知证据随本次提交保存，最终 SHA/CI/live receipt 外置，不为“记录部署成功”再开 docs-only commit→全量验证→部署循环。历史误判须先追加带证据的纠正，再按正常 lease/CAS 更正状态，不删除原始审计。

收尾只清理本任务自有标签页/进程。证据和未完工作已持久化后使用 guarded worktree cleanup；仅准确、已注册、干净且 remote 可达的工作树可非强制删除。不明/dirty/unreachable 状态保留。路径 absent/unregistered 后才 checkpoint complete 并 release；失败则 truthful blocked。核心范围完成并有持久化 GSC 后续时可 complete with follow-up，不能声称索引完成。历史仅日志脏状态按 archive helper 的 HEAD/status CAS、已验证外部 bundle/manifest 后再普通 cleanup。结束提供简明中文结论和一个具体 inbox item。
