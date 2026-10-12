# 指标设计与上报约定

目录名 example 表示可复制示例，默认协议实际描述下载业务；指标保留 `download_*`，避免失去单位和业务含义。新增业务定义自己的事件、指标前缀、标签与聚合语义。

## 选择指标类型

| 类型 | 适合场景 | 下载示例 |
| --- | --- | --- |
| Counter | 只增不减的事件次数、累计量 | 完成次数、失败次数、完成字节数 |
| Histogram | 可聚合的耗时分布 | 完成下载耗时，单位秒 |
| Gauge | 当前值或最近一次快照 | 来源级汇总速度、快照接收时间 |

每个模块接收应用的共享 Registry，使用 `registers: [registry]`。不使用全局默认 Registry，也不在模块中创建独立 Registry。统一 `/metrics` 使用该 Registry 的 contentType 与 `await registry.metrics()`。

## 指标与标签基数

| 指标 | 类型 | 标签 |
| --- | --- | --- |
| download_completed_total | Counter | source |
| download_failed_total | Counter | source, reason |
| download_duration_seconds | Histogram | source |
| download_completed_bytes_total | Counter | source |
| download_speed_bytes_per_second | Gauge | source |
| download_progress_updated_timestamp_seconds | Gauge | source |

source 只有 huggingface、github、other；reason 只有 network、timeout、cancelled、other。不要把 URL、文件名、用户 ID、taskId 或异常全文作为标签；详细上下文留在日志中，标签使用有限分类。

耗时 Histogram 只观察 completed，边界为 0.1、0.5、1、5、10、30、60、300 秒，另有 +Inf。单个应用默认示例最多 57 个序列：3 个来源的完成次数、字节数、速度、时间戳共 12 个；失败组合 12 个；Histogram 每来源 9 个 bucket 加 sum/count，共 33 个。Prometheus 的 job/instance 等身份标签及副本数会增加整体基数。

未上报过的带标签序列尚未出现，不等于已观察到零。需要启动时显式零值，可初始化有限标签组合，不应根据任意请求动态扩展标签空间。

## Gauge 是来源级汇总快照

speed 表示同一来源所有活跃下载任务的总速率，单位字节/秒。客户端先求和，服务端用 `set()` 保存快照：任务各为 2 和 3 时，上报 speed=5；分别上报 2、3，最终值会是 3，也不能不断 inc() 累加速度。

每个 `(服务实例, source)` 只允许一个有序汇总上报者，负责该序列覆盖的完整下载集合。独立客户端不能直接共用这个序列，否则相互覆盖。多上报者需要外部合并、有限稳定分片维度，或者带状态管理与过期清理的逐任务聚合实现。

completed/failed 不清零速度，因为可能还有其他任务。全部结束时提交明确的 speed=0；建议每 10 秒提交快照。服务不会根据完成次数推断当前速度。

时间戳 Gauge 为服务器收到快照的 Unix 秒数，不接受客户端随意指定。停报时旧值保留；失联不能直接解释为零速率。只保留最近 60 秒的快照：

```promql
download_speed_bytes_per_second
  and on(job, instance, source)
  (time() - download_progress_updated_timestamp_seconds < 60)
```

多个实例负责互不重叠的下载分片时，可汇总新鲜快照：

```promql
sum by (source) (
  download_speed_bytes_per_second
    and on(job, instance, source)
    (time() - download_progress_updated_timestamp_seconds < 60)
)
```

重复接收同一全局快照的副本不能求和。随机负载均衡会使多个实例保留过去的快照；示例先采用单实例，扩展时明确分片归属和稳定路由。如果存在 cluster 等附加身份标签，也要加入匹配键。

## 严格拒绝其他业务请求

schema 使用严格对象与可辨识联合，固定处理器映射事件到指标。额外字段、其他业务事件、缺字段、负数、无限值、数字字符串和未知标签分类都拒绝，不执行处理器。

以下请求返回 400：

```sh
curl -i http://127.0.0.1:3000/api/metrics/example \
  -H 'Content-Type: application/json' \
  -d '{"event":"plugin_started","source":"github"}'

curl -i http://127.0.0.1:3000/api/metrics/example \
  -H 'Content-Type: application/json' \
  -d '{"event":"progress","source":"github","speed":100,"taskId":"abc"}'
```

无下载时的零快照：

```sh
curl -i http://127.0.0.1:3000/api/metrics/example \
  -H 'Content-Type: application/json' \
  -d '{"event":"progress","source":"huggingface","speed":0}'
```

合法事件返回 `200 {"ok":true}`，非法 JSON 返回 400，不支持的 Content-Type 返回 415，超过 16 KiB 返回 413。

## 重试、生命周期与进程

每次接受 completed/failed 都计数一次，目前没有去重；重试可能重复计数。需要精确统计时，在业务层用事件 ID 去重后更新指标，事件 ID 不作为标签。

Registry 在内存中，重启后 Counter/Histogram 重置、Gauge 丢失。Counter 常用 rate()/increase() 查询来处理重置；Gauge 根据快照约定解释。每个实例独立抓取，服务不自动合并多进程 Registry。

参考：[Prometheus Node 客户端 API](https://github.com/prometheus/client_js)、[Zod 严格对象与可辨识联合](https://zod.dev/api)。
