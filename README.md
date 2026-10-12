# fastify-prometheus-starter

作者：chenfengami

基于 Fastify、Zod 和 Prometheus 的业务指标上报服务模板，支持按业务模块扩展。客户端 POST 业务事件，服务端严格校验后更新固定指标，Prometheus 从统一的 `/metrics` 抓取。

默认只启用一个 `example` 模块：**它具体演示下载业务**，包含 completed、failed、progress 三类事件。目录叫 example，事件和 `download_*` 指标仍保留明确的下载语义；复制模块后按真实业务命名。

## 快速启动

需要 Node **^22.18.0 / ^24.11.0 / ≥26.0.0**、pnpm **8.15.9**。推荐最新 Node 22，版本要求来自 [tsdown](https://tsdown.dev/guide/getting-started)；Vitest 5 也兼容此范围。

在项目目录执行：

```sh
pnpm install --frozen-lockfile
pnpm dev
```

默认地址为 `http://127.0.0.1:3000`。编译后运行：

```sh
pnpm run typecheck
pnpm test
pnpm build
pnpm start
```

可配置监听地址：`HOST=0.0.0.0 PORT=3000 pnpm start`。`pnpm run test:watch` 监听测试变化。项目统一维护 `pnpm-lock.yaml`，直接依赖均使用精确版本，CI 执行锁定安装、类型检查、测试与构建。

## 发送第一个事件

```sh
curl -i http://127.0.0.1:3000/api/metrics/example \
  -H 'Content-Type: application/json' \
  -d '{"event":"completed","source":"huggingface","duration":12.5,"size":104857600}'

curl http://127.0.0.1:3000/metrics
```

成功返回 `200 {"ok":true}`；抓取结果包含完成次数、耗时 Histogram 和完成字节数 Counter。

| 接口 | 用途 |
| --- | --- |
| POST /api/metrics/example | 接收下载业务示例的事件 |
| GET /metrics | 返回所有已注册业务的 Prometheus 指标 |

原 `/api/metrics/download` 已替换为 `/api/metrics/example`，没有旧路径别名。

| event | 必填字段（除 event 外） | 说明 |
| --- | --- | --- |
| completed | source、duration、size | 单次下载完成，耗时单位秒，大小单位字节 |
| failed | source、reason | 单次下载失败，reason 为有限分类 |
| progress | source、speed | 来源级汇总速率快照，单位字节/秒 |

source 仅允许 `huggingface / github / other`；reason 仅允许 `network / timeout / cancelled / other`。数字必须有限、非负，size 必须为安全整数。Zod 严格对象拒绝额外字段，不会静默删除它们，也不会将数字字符串转换为数字。未知事件、缺字段、字段类型错误、未知枚举值返回 400，不更新业务指标。请求使用 JSON，最大 16 KiB。

## 目录与扩展

```text
src/
  app.ts                 创建应用、配置 Zod、组合业务插件
  server.ts              监听端口与关闭服务
  core/registry.ts       每个应用创建一个 Registry
  routes/metrics.ts      统一 GET /metrics
  modules/example/
    schema.ts            示例允许的事件、字段及推导类型
    metrics.ts           示例固定指标，接收共享 Registry
    handlers.ts          事件到指标的穷尽映射
    plugin.ts            示例 POST 路由，由 app 提供 prefix
docs/
  adding-a-business.md   复制示例并接入新业务
  metric-design.md       指标设计、标签基数、Gauge 与聚合约定
test/app.test.ts          Vitest 接口与多模块隔离测试
tsdown.config.ts         构建设置
vitest.config.ts         Node 测试环境与测试文件范围
.github/workflows/ci.yml 自动检查
```

**新增业务先读 [接入指南](docs/adding-a-business.md)**。业务文件集中放在一个文件夹，复制后可独立修改 schema、指标和处理逻辑。所有模块接收应用创建的同一个 Registry，统一 `/metrics` 不需要逐业务修改。

客户端提交业务事件，不能指定任意指标名或 labels。上报者鉴权、限流等可通过 Fastify 插件钩子接入；模板默认监听本机。

## 失败与进度示例

```sh
curl -i http://127.0.0.1:3000/api/metrics/example \
  -H 'Content-Type: application/json' \
  -d '{"event":"failed","source":"github","reason":"timeout"}'

curl -i http://127.0.0.1:3000/api/metrics/example \
  -H 'Content-Type: application/json' \
  -d '{"event":"progress","source":"huggingface","speed":5242880}'
```

进度示例表示同来源两个任务各为 2 MiB/s 和 3 MiB/s，上报者先求和再提交快照。Gauge 用 `set()` 覆盖最近快照，要求每个 `(服务实例, source)` 只有一个有序汇总上报者；完成/失败事件不会清零速度。全部下载结束时提交 speed=0；停报的旧快照用时间戳识别。

完整 curl 反例、PromQL、多实例语义、去重及标签基数见 [指标设计](docs/metric-design.md)。

## 工具与构建

Fastify 5.12.5、fastify-type-provider-zod 6.0.0、Zod 4.1.12、@prometheus-io/client 0.16.1；开发使用 tsx 4.20.6，测试使用 Vitest 5.0.3，类型检查使用 TypeScript 5.9.3，打包使用 tsdown 0.23.1。

TypeScript 配置 `moduleResolution: Bundler`，源码相对 import 不写后缀；`noEmit: true` 让 tsc 只检查类型。tsdown 输出 ESM `dist/server.js`，第三方运行依赖保持外置。构建设置 `clean: true`；当前配置保留 `sourcemap: false`，需要时在 tsdown.config.ts 开启。

Vitest 使用 Node 环境、显式导入 test/expect，通过 Fastify inject 测试请求，不监听端口；测试结束等待应用关闭。6 项测试覆盖合法事件、非法请求不更新指标、快照覆盖与零值、时间戳、统一 Registry 跨模块抓取、可配置路由前缀及应用间隔离。

此仓库作为独立服务模板，保留 `private: true`，不包含 npm 库导出或声明文件发布设置（`dts: false`）。采用 [MIT 许可证](LICENSE)。
