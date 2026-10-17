# 来源证据、赛期复核与报名通道（schema v3）

v3 记录报名通道从必填 url 扩展为“网址或人工报名指引”的契约：url 可选，新增可选 entranceType、entranceHint，url 与非空 entranceHint 至少填写一个。entranceType 若填写，必须是下列枚举中的字符串，数组、对象等类型不能通过字符串转换入库。无通道的旧赛事和已有网址通道仍兼容，无需批量迁移 races.json；sourceUrl、verifiedAt 的人工核验要求保持不变。嵌套通道校验由 src/lib/evidence.ts 的 validChannels 执行，并由 scripts/lib/schema.ts 调用。

## 来源的含义

当前端点使用 OpenAI-compatible Chat Completions。[供应商文档](https://www.alibabacloud.com/help/en/model-studio/web-search) 明确说明该协议不返回检索来源。保留现有端点/密钥组合；提示词返回的 sourceUrls 只存成模型线索，不能凭 HTTP 可达、token 数或模型自述认定已经核验。

Race.sources 的每项包含 url、observedAt、scope（general/raceDate/registration/category）；verifiedAt 只能在人工阅读对应公告后填写。页面对未核验线索和已核验的具体字段分开标注。旧记录没有证据时显示待补充，不为历史数据补造来源或时间。

## 赛期变更

每日更新遇到不同赛期，只向 data/pending-reviews.json 添加候选；重复候选按赛事/原日期/目标日期去重，不立即改赛期，也不采用依赖新赛期的报名日期与状态。候选不要求模型提供来源，缺证据时仍可供人工调查。非法日期与跨届候选不入队。

```sh
# 列出候选，不联网、不写文件
npx tsx scripts/review-date.ts
# 先自行阅读官方公告；将下方候选 ID 和 URL 替换为真实值，先预览
npx tsx scripts/review-date.ts --id='赛事ID:原日期:目标日期' --source='https://官方公告地址'
# 确认后才写本地文件（不会提交或推送）
npx tsx scripts/review-date.ts --id='赛事ID:原日期:目标日期' --source='https://官方公告地址' --apply
```

审批检查当前记录仍等于候选原值，检查日期与报名窗口契约，记录人工核验来源、时间和历史。若记录已变化，拒绝覆盖。每个文件用临时文件加 rename 写入；多个文件不是数据库事务，中途失败应核对 Git diff 和历史，不应绕过旧值检查重试覆盖。

审批后运行 npm test、npm run typecheck 和既有发布前检测，再一起提交 races.json、pending-reviews.json、review-history.json。运行中的采集会更新文件，人工审批应在每日任务结束后进行，不与采集同时编辑同一工作副本。

任务 dry-run 不写数据；API 全失败仍失败退出。发布脚本提交待复核队列；尚未启用任何原有停用任务或邮件流程。

## 人工维护报名通道

registrationChannels 为可选数组。每个通道必须包含 name、kind（general 普通 / charity 慈善 / tour 旅行）、sourceUrl（核验公告）、verifiedAt（人工核验时间）、status。regStart、regEnd、requirements 可选，未知日期省略。最多一个普通通道，同一入口不可重复，截止不能晚于或等于比赛日。

报名入口支持两种形态，二者至少其一（中国大量赛事只在微信公众号/小程序/第三方平台报名，没有独立官网网址）：
- url：直接报名入口的 http(s) 网址；填写时不得用官网首页冒充报名页。
- entranceType + entranceHint：无网址时用报名指引代替。entranceType 取 website / wechat_official / wechat_miniprogram / app / platform；entranceHint 是一句可操作的指引，如“微信搜索‘肇庆马拉松’公众号→菜单栏报名”。既无 url 又无 entranceHint 的通道不通过校验。无 url 通道按 name+entranceHint 去重。

这些字段不由模型自动写入。人工读过赛事当届公告、确认名额类型和资格要求后，才可将通道写入赛事并通过 schema 校验。慈善筹款、旅行套餐等要求应写入 requirements，页面单独展示；官网首页仍只叫“赛事官网”。不要仅凭首页可访问就填成直接报名入口。

已有普通通道时，汇总状态、排序、复查计划和主卡片按普通通道计算，其他通道独立展示。若只维护慈善/旅行通道，普通报名显示待核验；不会因慈善名额开放把普通报名标为开放。没有新字段的旧数据继续按原逻辑运行。

首次上线不虚构任何真实通道。实际填充需维护者逐场核实；组件与管道测试使用 example.org 和标注为测试的数据。

## 认证分类

新发现赛事默认 unknown，显示“认证待核验”。现有 B 类值不批量改写，缺少 category 范围的人工证据时显示“B类（待核验）”；有证据再按公告维护类别及对应 sources。其他存量分类本轮保持原值。

## 验证边界

单测及脚本隔离测试使用替代 fetch，不消耗真实 API、不推送或发信。测试涵盖来源标记、嵌套契约、普通/慈善状态分离、截止日边界、候选去重、dry-run、审批预览与写入、过时候选拒绝。真实 Token Plan 接口和外站报名链接需在维护者运行环境核验。
