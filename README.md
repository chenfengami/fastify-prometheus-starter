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

默认地址为 `http://127.0.0.1:3000`。编译后运行：

```sh
pnpm build
pnpm start
```

可配置监听地址：`HOST=0.0.0.0 PORT=3000 pnpm start`。部署时需要安装项目的生产依赖。

## 发送第一个事件

```sh
curl -i http://127.0.0.1:3000/api/metrics/example \
  -H 'Content-Type: application/json' \
  -d '{"event":"completed","source":"huggingface","duration":12.5,"size":104857600}'

curl http://127.0.0.1:3000/metrics
```

成功返回 `200 {"ok":true}`，随后可从 `/metrics` 查看更新后的指标。

| 接口 | 用途 |
| --- | --- |
| POST /api/metrics/example | 接收下载业务示例的事件 |
| GET /metrics | 返回所有已注册业务的 Prometheus 指标 |

示例支持 completed、failed、progress 三类事件。请求使用 JSON，校验失败返回 400，且不会更新业务指标。完整协议见 [schema.ts](src/modules/example/schema.ts)。

## 新增业务

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
```

1. 复制 `src/modules/example`，按自己的业务修改 schema、指标、处理器和插件。
2. 在 `src/app.ts` 导入并注册新插件，设置路由前缀，传入已有 Registry。

```ts
app.register(orderPlugin, {
  prefix: '/api/metrics/order',
  registry,
});
```

所有业务的指标自动汇入同一个 `/metrics`。完整步骤见 [新增业务指南](docs/adding-a-business.md)。

## 开发命令

| 命令 | 用途 |
| --- | --- |
| pnpm dev | 开发模式，监听源码变化 |
| pnpm run typecheck | 检查类型 |
| pnpm test | 执行测试 |
| pnpm run test:watch | 监听测试变化 |
| pnpm build | 检查类型并构建 |
| pnpm start | 启动构建后的服务 |

## 文档

- [新增业务指南](docs/adding-a-business.md)
- [AI 开发约定](AGENTS.md) · [Cursor 项目规则](.cursor/rules/project.mdc)

## 许可证

[MIT](LICENSE) © chenfengami
