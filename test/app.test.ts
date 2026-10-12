import { expect, test, vi } from 'vitest';
import Fastify from 'fastify';
import { Counter } from '@prometheus-io/client';
import { validatorCompiler, serializerCompiler } from 'fastify-type-provider-zod';
import { createRegistry } from '../src/core/registry';
import { examplePlugin } from '../src/modules/example/plugin';
import { metricsRoute } from '../src/routes/metrics';
import { buildApp } from '../src/app';
import { createDownloadMetrics } from '../src/modules/example/metrics';
import { createDownloadHandler } from '../src/modules/example/handlers';

test('valid events update only their mapped metrics; snapshots replace rather than accumulate', async ({ onTestFinished }) => {
  const app = buildApp();
  onTestFinished(() => app.close());
  const events = [
    { event: 'progress', source: 'github', speed: 100 },
    { event: 'progress', source: 'github', speed: 250 },
    { event: 'progress', source: 'huggingface', speed: 50 },
    { event: 'completed', source: 'github', duration: 12.5, size: 1024 },
    { event: 'failed', source: 'github', reason: 'timeout' },
  ];
  for (const payload of events) {
    const response = await app.inject({ method: 'POST', url: '/api/metrics/example', payload });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  }
  const scrape = await app.inject({ method: 'GET', url: '/metrics' });
  expect(scrape.statusCode).toBe(200);
  expect(String(scrape.headers['content-type'])).toMatch(/^text\/plain; version=0\.0\.4/);
  expect(scrape.body).toMatch(/download_completed_total\{source="github"\} 1\n/);
  expect(scrape.body).toMatch(/download_failed_total\{source="github",reason="timeout"\} 1\n/);
  expect(scrape.body).toMatch(/download_duration_seconds_sum\{source="github"\} 12\.5\n/);
  expect(scrape.body).toMatch(/download_duration_seconds_count\{source="github"\} 1\n/);
  expect(scrape.body).toMatch(/download_completed_bytes_total\{source="github"\} 1024\n/);
  expect(scrape.body).toMatch(/download_speed_bytes_per_second\{source="github"\} 250\n/);
  expect(scrape.body).toMatch(/download_speed_bytes_per_second\{source="huggingface"\} 50\n/);
  expect(scrape.body).toMatch(/download_progress_updated_timestamp_seconds\{source="github"\} [\d.]+\n/);
  // A zero snapshot is required once all downloads have stopped.
  await app.inject({ method: 'POST', url: '/api/metrics/example', payload: {
    event: 'progress', source: 'github', speed: 0,
  } });
  expect((await app.inject('/metrics')).body).toMatch(/download_speed_bytes_per_second\{source="github"\} 0\n/);
});

test('invalid events return 400 and leave every metric unchanged', async ({ onTestFinished }) => {
  const app = buildApp();
  onTestFinished(() => app.close());
  const before = (await app.inject('/metrics')).body;
  const completed = { event: 'completed', source: 'github', duration: 1, size: 10 };
  const invalid = [
    { event: 'plugin_started', source: 'github' },
    { ...completed, source: 'unbounded-user-input' },
    { ...completed, duration: '1' },
    { ...completed, duration: -1 },
    { ...completed, size: 1.5 },
    { ...completed, size: Number.MAX_SAFE_INTEGER + 1 },
    { event: 'completed', source: 'github', size: 10 },
    { ...completed, reason: 'timeout' },
    { ...completed, labels: { userId: '123' } },
    { event: 'failed', source: 'github', reason: 'raw error message' },
    { event: 'failed', source: 'github', reason: 'timeout', speed: 1 },
    { event: 'progress', source: 'github', speed: -1 },
    { event: 'progress', source: 'github', speed: null },
    { event: 'progress', source: 'github', speed: '42' },
    { event: 'progress', source: 'github', speed: 42, taskId: 'abc' },
    [], null,
  ];
  for (const payload of invalid) {
    const response = await app.inject({ method: 'POST', url: '/api/metrics/example',
      headers: { 'content-type': 'application/json' }, payload: JSON.stringify(payload) });
    expect(response.statusCode, response.body).toBe(400);
  }
  for (const payload of ['{"event":', '{"event":"progress","source":"github","speed":1e400}']) {
    const response = await app.inject({ method: 'POST', url: '/api/metrics/example',
      headers: { 'content-type': 'application/json' }, payload });
    expect(response.statusCode).toBe(400);
  }
  expect((await app.inject('/metrics')).body).toBe(before);
  expect((await app.inject({ method: 'POST', url: '/api/metrics/plugin', payload: {} })).statusCode).toBe(404);
});

test('timestamp uses server receipt time and registries remain isolated', async () => {
  const firstRegistry = createRegistry();
  const first = createDownloadMetrics(firstRegistry);
  const secondRegistry = createRegistry();
  createDownloadMetrics(secondRegistry);
  createDownloadHandler(first, () => 1234567)({ event: 'progress', source: 'github', speed: 1 });
  expect(await firstRegistry.metrics()).toMatch(/download_progress_updated_timestamp_seconds\{source="github"\} 1234\.567\n/);
  expect(await secondRegistry.metrics()).not.toMatch(/source="github"/);
});

test('different business plugins expose their metrics through one registry', async ({ onTestFinished }) => {
  const registry = createRegistry();
  const app = Fastify();
  onTestFinished(() => app.close());
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.register(metricsRoute, { registry });
  app.register(examplePlugin, { registry, prefix: '/api/metrics/example' });
  app.register(async (module) => {
    const started = new Counter({
      name: 'plugin_started_total',
      help: 'Number of plugin starts accepted by this test business module.',
      registers: [registry],
    });
    module.post('/started', async () => {
      started.inc();
      return { ok: true };
    });
  }, { prefix: '/api/metrics/plugin' });
  expect((await app.inject({ method: 'POST', url: '/api/metrics/example', payload: {
    event: 'completed', source: 'github', duration: 1, size: 10,
  } })).statusCode).toBe(200);
  expect((await app.inject({ method: 'POST', url: '/api/metrics/plugin/started' })).statusCode).toBe(200);
  const scrape = await app.inject('/metrics');
  expect(scrape.statusCode).toBe(200);
  expect(scrape.body).toMatch(/download_completed_total\{source="github"\} 1\n/);
  expect(scrape.body).toMatch(/plugin_started_total 1\n/);
});

test('example prefix can change and validation follows the plugin scope', async ({ onTestFinished }) => {
  const app = Fastify();
  onTestFinished(() => app.close());
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.register(examplePlugin, { registry: createRegistry(), prefix: '/custom/download' });
  const payload = { event: 'failed', source: 'github', reason: 'timeout' };
  expect((await app.inject({ method: 'POST', url: '/custom/download', payload })).statusCode).toBe(200);
  expect((await app.inject({ method: 'POST', url: '/custom/download', payload: {
    ...payload, taskId: 'unexpected',
  } })).statusCode).toBe(400);
  expect((await app.inject({ method: 'POST', url: '/api/metrics/example', payload })).statusCode).toBe(404);
});

test('separate apps do not share counters or registries', async ({ onTestFinished }) => {
  const first = buildApp();
  const second = buildApp();
  onTestFinished(async () => {
    await Promise.all([first.close(), second.close()]);
  });
  await first.inject({ method: 'POST', url: '/api/metrics/example', payload: {
    event: 'completed', source: 'github', duration: 1, size: 10,
  } });
  expect((await first.inject('/metrics')).body).toMatch(/download_completed_total\{source="github"\} 1\n/);
  expect((await second.inject('/metrics')).body).not.toMatch(/source="github"/);
  expect((await first.inject({ method: 'POST', url: '/api/metrics/download', payload: {} })).statusCode).toBe(404);
});

test('one completed event feeds Histogram and Summary in the example module', async ({ onTestFinished }) => {
  const app = buildApp();
  onTestFinished(() => app.close());
  for (const duration of [1, 2, 3]) {
    const response = await app.inject({ method: 'POST', url: '/api/metrics/example', payload: {
      event: 'completed', source: 'github', duration, size: 10,
    } });
    expect(response.statusCode, response.body).toBe(200);
  }
  await app.inject({ method: 'POST', url: '/api/metrics/example', payload: {
    event: 'completed', source: 'huggingface', duration: 10, size: 10,
  } });
  const scrape = await app.inject('/metrics');
  expect(scrape.body).toContain('# TYPE download_duration_summary_seconds summary');
  expect(scrape.body).toContain('# TYPE download_duration_seconds histogram');
  for (const name of ['download_duration_summary_seconds', 'download_duration_seconds']) {
    expect(scrape.body).toMatch(new RegExp(`${name}_sum\\{source="github"\\} 6\\n`));
    expect(scrape.body).toMatch(new RegExp(`${name}_count\\{source="github"\\} 3\\n`));
  }
  expect(scrape.body).toMatch(/download_duration_summary_seconds\{quantile="0.5",source="github"\} 2\n/);
  for (const quantile of ['0.5', '0.95', '0.99']) {
    expect(scrape.body).toContain(`quantile="${quantile}",source="github"`);
  }
  expect(scrape.body).toMatch(/download_duration_summary_seconds_sum\{source="huggingface"\} 10\n/);
});

test('failed and progress events do not observe durations', async ({ onTestFinished }) => {
  const app = buildApp();
  onTestFinished(() => app.close());
  await app.inject({ method: 'POST', url: '/api/metrics/example', payload: {
    event: 'failed', source: 'github', reason: 'timeout',
  } });
  await app.inject({ method: 'POST', url: '/api/metrics/example', payload: {
    event: 'progress', source: 'github', speed: 10,
  } });
  const scrape = await app.inject('/metrics');
  expect(scrape.body).not.toContain('download_duration_summary_seconds_count{');
  expect(scrape.body).not.toContain('download_duration_seconds_count{');
});

test('rolling quantiles expire while cumulative sum/count retain observations', async ({ onTestFinished }) => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(0);
  onTestFinished(() => { vi.useRealTimers(); });
  const registry = createRegistry();
  const handle = createDownloadHandler(createDownloadMetrics(registry));
  handle({ event: 'completed', source: 'github', duration: 4, size: 10 });
  expect(await registry.metrics()).toMatch(/download_duration_summary_seconds\{quantile="0.95",source="github"\} 4\n/);
  vi.setSystemTime(601_000);
  const expired = await registry.metrics();
  expect(expired).toMatch(/download_duration_summary_seconds\{quantile="0.95",source="github"\} 0\n/);
  expect(expired).toMatch(/download_duration_summary_seconds_sum\{source="github"\} 4\n/);
  expect(expired).toMatch(/download_duration_summary_seconds_count\{source="github"\} 1\n/);
  handle({ event: 'completed', source: 'github', duration: 8, size: 10 });
  const fresh = await registry.metrics();
  expect(fresh).toMatch(/download_duration_summary_seconds\{quantile="0.95",source="github"\} 8\n/);
  expect(fresh).toMatch(/download_duration_summary_seconds_sum\{source="github"\} 12\n/);
  expect(fresh).toMatch(/download_duration_summary_seconds_count\{source="github"\} 2\n/);
});
