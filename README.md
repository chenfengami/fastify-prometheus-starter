# fastify-prometheus-starter

基于 TypeScript、Fastify、Zod 和 Prometheus 的业务指标上报服务模板，帮助你快速搭建指标接收服务，并按业务模块扩展。

客户端通过 HTTP POST 上报业务事件，服务端校验并更新指标，Prometheus 从统一的 `/metrics` 接口抓取。

- 使用 Zod 严格校验请求，并自动推导 TypeScript 类型。
- 按业务组织 schema、metrics、handlers 和路由插件，便于复制扩展。
- 多个业务模块共用应用级 Registry，统一暴露指标。
- 集成 tsdown、Vitest 和 CI，提供开发、测试及构建流程。

内置 `example` 模块演示下载事件上报和 Counter、Gauge、Histogram、Summary 四种指标类型，可作为接入自己业务的起点。

## 快速启动

需要 Node **^22.18.0 / ^24.11.0 / ≥26.0.0**、pnpm **8.15.9**。推荐最新 Node 22，具体要求见 package.json。

在项目目录执行：

```sh
pnpm install
pnpm dev
```

默认业务上报地址为 `http://127.0.0.1:3000`，指标抓取地址为 `http://127.0.0.1:9091/metrics`。两个服务在同一个进程中运行，共享 Registry。

拆分端口是为了分别控制业务上报和指标抓取的访问范围：业务端口可供客户端访问，指标端口可仅供内网 Prometheus 访问，避免开放业务端口时同时暴露 `/metrics`。端口拆分本身不限制访问，具体监听地址、网络权限和采集配置由部署方设置。

编译后运行：

```sh
pnpm build
pnpm start
```

可分别配置监听地址和端口：

```sh
HOST=0.0.0.0 PORT=3000 METRICS_HOST=127.0.0.1 METRICS_PORT=9091 pnpm start
```

`HOST` 和 `PORT` 控制业务服务，`METRICS_HOST` 和 `METRICS_PORT` 控制指标服务；两个端口必须不同，取值为 1–65535。默认地址均为 `127.0.0.1`。部署时按采集网络配置指标监听地址和访问权限，并安装项目的生产依赖。

## 发送第一个事件

```sh
curl -i http://127.0.0.1:3000/api/metrics/example \
  -H 'Content-Type: application/json' \
  -d '{"event":"completed","source":"huggingface","duration":12.5,"size":104857600}'

curl http://127.0.0.1:9091/metrics
```

成功返回 `200 {"ok":true}`，随后可从 `/metrics` 查看更新后的指标。

| 接口 | 默认端口 | 用途 |
| --- | --- | --- |
| POST /api/metrics/example | 3000 | 接收下载业务示例的事件 |
| GET /metrics | 9091 | 返回所有已注册业务的 Prometheus 指标 |

示例支持 completed、failed、progress 三类事件。请求使用 JSON，校验失败返回 400，且不会更新业务指标。完整协议见 [schema.ts](src/modules/example/schema.ts)。

## 新增业务

```text
src/
  app.ts                 创建业务与指标服务、共享 Registry、组合业务插件
  server.ts              监听端口与关闭服务
  core/registry.ts       每个应用创建一个 Registry
  routes/metrics.ts      统一 GET /metrics
  modules/example/
    schema.ts            示例允许的事件、字段及推导类型
    metrics.ts           示例固定指标，接收共享 Registry
    handlers.ts          事件到指标的穷尽映射
    plugin.ts            示例 POST 路由，由 app 提供 prefix
```

先生成业务模块：

```sh
pnpm generate:module order
```

命令生成 `src/modules/order` 下的 schema、metrics、handlers、plugin 四个文件，提供一个 occurred 事件和 Counter。支持 `file-upload` 这样的名称，已有目录不会被覆盖。

按业务需求修改事件和指标，然后将命令输出的导入及注册代码加入 `src/app.ts`：

```ts
import { orderPlugin } from './modules/order/plugin';

app.register(orderPlugin, {
  prefix: '/api/metrics/order',
  registry,
});
```

生成器不会自动修改 app.ts。注册后所有业务指标汇入同一个 `/metrics`。完整步骤见 [新增业务指南](docs/adding-a-business.md)。

## 开发命令

| 命令 | 用途 |
| --- | --- |
| pnpm dev | 开发模式，监听源码变化 |
| pnpm run typecheck | 检查类型 |
| pnpm test | 执行测试 |
| pnpm run test:watch | 监听测试变化 |
| pnpm generate:module order | 生成业务模块 |
| pnpm build | 检查类型并构建 |
| pnpm start | 启动构建后的服务 |

## 文档

- [新增业务指南](docs/adding-a-business.md)
- [AI 开发约定](AGENTS.md) · [Cursor 项目规则](.cursor/rules/project.mdc)

## 许可证

[MIT](LICENSE) © chenfengami
