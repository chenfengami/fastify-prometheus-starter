# fastify-prometheus-starter 开发约定

## 项目定位

- 本项目是可复制扩展的业务指标上报服务模板。客户端上报业务事件，服务端验证后更新指标，Prometheus 从统一的 `/metrics` 抓取。
- 保留独立服务形态和 `private: true`。当前不发布 npm 库，不增加库导出、声明文件发布或自动发布配置；用户明确要求改变定位时再调整。
- `src/modules/example` 是下载业务示例。目录名通用，事件与 `download_*` 指标保留具体业务含义；不要仅为了通用性将字段改成任意 data/value/labels。

## 工具与代码

- 使用 pnpm；版本以 package.json 的 packageManager 为准，依赖由 pnpm-lock.yaml 固定。修改依赖时同步锁文件，不引入其他包管理器的锁文件。
- Node 版本遵循 package.json 的 engines。新增依赖前核实与当前 Node、Fastify、Zod、TypeScript 的兼容性。
- 使用 TypeScript 严格类型检查、ESM 和不带扩展名的相对 import；类型导入使用 `import type`。
- tsc 只做类型检查（moduleResolution: Bundler、noEmit: true），tsdown 负责输出 dist/server.js；不通过 skipLibCheck 或扩大 any 范围掩盖类型错误。
- 开发使用 tsx，测试使用 Vitest。不要手工修改 dist 或 node_modules 中的生成文件。

## 业务模块与 Registry

- 新业务集中放在 `src/modules/<业务>/`，分成 schema.ts、metrics.ts、handlers.ts、plugin.ts，在 src/app.ts 显式注册。
- 可运行 `pnpm generate:module <名称>` 生成精简模块；生成器拒绝覆盖已有目录，只输出 app.ts 的注册代码。模板位于 scripts/templates/module，修改生成器时验证生成代码的类型和实际路由行为。
- schema 定义输入协议并推导类型；metrics 定义固定指标；handlers 映射事件；plugin 注册业务路由。业务处理器不负责启动服务器。
- 每个应用实例创建一个 Registry。模块接收该共享实例，并通过 `registers: [registry]` 注册指标；不使用全局默认 Registry，不在模块内部创建独立 Registry。
- 一个 Registry 中的指标名称应唯一，并使用业务前缀。普通业务插件默认注册一次，避免重复注册指标。
- 业务插件使用相对路由，由 app.register 的 prefix 决定业务入口。保留普通 Fastify 插件的封装与 prefix 行为；在插件内显式使用 ZodTypeProvider。
- 统一 GET /metrics 只读取应用级 Registry，无需逐业务拼接抓取结果。新增业务也应验证其指标出现在这个接口中。

## 输入校验与标签

- 使用 z.strictObject 拒绝额外字段；多个事件使用以 event 为判别字段的 z.discriminatedUnion。类型从 schema 推导，避免重复手写请求类型。
- 输入验证通过后才执行指标处理器。拒绝其他业务事件、未知事件、缺字段、错误类型及未知标签分类；不要静默剥离非法字段或随意强制转换数字。
- 数字明确单位、范围和整数要求。所有数值必须有限；计数、耗时、大小、速度等非负量不得接受负值。
- 客户端不能指定任意指标名或任意 labels。标签使用服务端维护的有限分类；URL、用户 ID、taskId、文件名、异常全文等详细上下文放在日志中。

## 所有指标的统计与聚合语义

指标设计由接入者按实际业务确定，示例不作为所有业务的统一协议。新增或修改指标时，使用清晰的 help 和必要的注释或业务文档，说明单位、标签、更新规则及跨实例聚合条件。

- Counter：说明何时累加、每次增加多少、统计接受的请求还是去重后的业务事件。跨实例求和前确认统计集合不重叠；示例目前按接受请求计数，重试会重复统计。
- Histogram：说明观察对象、单位、包含或排除的事件及 bucket 边界。跨实例合并要求单位、标签含义和 bucket 边界一致；合并 bucket/count/sum 后计算分位数，不平均各实例分位数。
- Gauge：说明值属于哪个集合或分片、是快照覆盖还是增减维护、由谁更新、更新频率及过期处理。只有互不重叠且新鲜的分片快照才可按对应语义求和；相同全局快照的副本不能重复求和。
- Summary：说明观察对象、单位、分位数和时间窗口；区分窗口分位数与累计 sum/count 的生命周期。各实例预计算的分位数不能直接求和或平均。需要跨实例分位数聚合时优先考虑 Histogram。
- 当前下载 Gauge 是来源级总速率快照：上报者先汇总，服务端 set 覆盖；completed/failed 不清零。全部任务停止时上报零，停报通过接收时间戳过滤旧快照。

## 验证与文档

- 修改业务逻辑、接口、依赖或构建配置后，运行 `pnpm run typecheck`、`pnpm test`、`pnpm build`。根据变更补充有意义的测试，不为了覆盖实现细节添加重复测试。
- 接口测试使用 Fastify inject，每个测试创建独立应用，通过 Vitest 清理钩子等待 app.close。验证非法请求不会修改指标，以及不同业务共享 Registry、不同应用相互隔离。
- 仅修改文档或元信息时，检查链接、命令、路径和描述一致性即可，无需机械重跑全套测试。
- 如检查因环境限制未运行或失败，明确说明实际结果，不将旧版本验证结果当作当前验证结果。
- 路由、请求字段、指标语义或接入方式改变时，同步 README 和相关 docs，更新 curl 示例。修改共同开发约定时同步 Cursor 规则中的关键摘要。
- 新增业务时参考 [接入指南](docs/adding-a-business.md)，具体指标按业务需求设计。无需在无关小改动前阅读全部文档。
