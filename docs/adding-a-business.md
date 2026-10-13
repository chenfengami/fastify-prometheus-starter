# 接入一个新业务

本项目的复用单位是 `src/modules/<业务>/`。可用命令生成精简模块，再定义自己的业务；也可参考 modules/example 中的四种指标类型。无需修改统一抓取接口。

## 1. 生成业务模块

例如增加插件业务：

```sh
pnpm generate:module plugin
```

命令生成 schema、metrics、handlers、plugin 四份文件，自动使用对应的类型、函数和指标名称。初始协议为 `{"event":"occurred"}`，指标为 plugin_events_total，接收一次合法请求增加 1；没有标签和去重逻辑。

模块名以小写字母开头，只包含小写字母、数字和单个连字符，最长 64 个字符；支持 file-upload，自动生成 FileUpload 类型、fileUploadPlugin 和 file_upload_events_total。目标目录存在时命令报错，不覆盖已有代码。

脚本位于 scripts/generate-module.ts，独立模板位于 scripts/templates/module。它仅创建模块并输出注册代码，不修改 app.ts；`pnpm generate:module --help` 查看用法。下面以修改生成的 plugin 模块为例。

## 2. 定义请求协议

在 schema.ts 列出业务事件与字段。使用 `z.strictObject()` 拒绝额外字段；多个事件用 `z.discriminatedUnion('event', ...)` 组合，类型由 `z.infer` 推导。

例如插件启动事件：

```ts
import { z } from 'zod';

export const pluginEventSchema = z.strictObject({
  event: z.literal('started'),
  plugin: z.enum(['builtin', 'extension', 'other']),
});
export type PluginEvent = z.infer<typeof pluginEventSchema>;
export const acceptedSchema = z.strictObject({ ok: z.literal(true) });
```

增加事件时，同时更新 schema、固定指标和处理器；不要接受客户端传入任意 metricName 或 labels。

## 3. 定义指标并映射事件

metrics.ts 接收应用的 Registry，不在模块中创建 Registry：

```ts
import { Counter } from '@prometheus-io/client';
import type { Registry } from '@prometheus-io/client';

export function createPluginMetrics(registry: Registry) {
  const started = new Counter({
    name: 'plugin_started_total',
    help: 'Number of accepted plugin start events.',
    labelNames: ['plugin'] as const,
    registers: [registry],
  });
  return { started };
}
export type PluginMetrics = ReturnType<typeof createPluginMetrics>;
```

handlers.ts：

```ts
import type { PluginEvent } from './schema';
import type { PluginMetrics } from './metrics';

export function createPluginHandler(metrics: PluginMetrics) {
  return (event: PluginEvent): void => {
    metrics.started.inc({ plugin: event.plugin });
  };
}
```

指标名需要自己的业务前缀，避免同一 Registry 中重复注册。labelNames 必须与处理器传入的 labels 一致，允许的值由服务端维护。

## 4. 定义 Fastify 插件

plugin.ts 接收 Registry，使用相对路由和局部 type provider：

```ts
import type { FastifyPluginAsync } from 'fastify';
import type { Registry } from '@prometheus-io/client';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { acceptedSchema, pluginEventSchema } from './schema';
import { createPluginMetrics } from './metrics';
import { createPluginHandler } from './handlers';

export const pluginPlugin: FastifyPluginAsync<{ registry: Registry }> = async (app, { registry }) => {
  const handle = createPluginHandler(createPluginMetrics(registry));
  app.withTypeProvider<ZodTypeProvider>().post('/', {
    prefixTrailingSlash: 'no-slash',
    schema: { body: pluginEventSchema, response: { 200: acceptedSchema } },
  }, async (request) => {
    handle(request.body);
    return { ok: true as const };
  });
};
```

app.ts 已配置 Zod 校验器与序列化器，插件继承它们。type provider 的类型在插件中通过 `withTypeProvider` 指定。使用普通 Fastify 插件，不加 `fastify-plugin` 包装，保留普通 register 的路由 prefix 行为。参见 [Fastify 插件文档](https://fastify.dev/docs/latest/Reference/Plugins/)。

## 5. 在应用中注册

在 app.ts 中导入新插件：

```ts
import { pluginPlugin } from './modules/plugin/plugin';
```

在创建 Registry 后添加：

```ts
app.register(pluginPlugin, {
  prefix: '/api/metrics/plugin',
  registry,
});
```

业务端口（默认 3000）的 POST `/api/metrics/plugin` 接收 started 事件；指标端口（默认 9091）的 GET `/metrics` 同时包含下载示例和插件指标，无需手动合并 Registry。每个业务插件默认注册一次；创建第二个应用会获得独立 Registry。

## 6. 验证后接入客户端

新增 Vitest 测试，覆盖合法事件、非法事件不能更新指标，以及统一抓取包含新业务序列。参考 test/app.test.ts 中的多模块集成测试。

```sh
pnpm run typecheck
pnpm test
pnpm build
```

启动服务后验证：

```sh
curl -i http://127.0.0.1:3000/api/metrics/plugin \
  -H 'Content-Type: application/json' \
  -d '{"event":"started","plugin":"builtin"}'
curl http://127.0.0.1:9091/metrics
```

指标类型、名称、单位、标签、上报频率、重试与去重策略由接入者按实际业务确定。示例用于展示接入结构和各类指标的基本用法。
