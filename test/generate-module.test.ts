import { expect, onTestFinished, test } from 'vitest';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';
import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { createRegistry } from '../src/core/registry';
import { metricsRoute } from '../src/routes/metrics';
import { generateModule } from '../scripts/generate-module';

const root = fileURLToPath(new URL('../', import.meta.url));
const createFixture = () => mkdtemp(join(root, 'test/.module-generator-'));

test.each(['order', 'file-upload'])('generates a complete module named %s', async (name) => {
  const fixture = await createFixture();
  onTestFinished(() => rm(fixture, { recursive: true, force: true }));
  const result = await generateModule(name, fixture);
  expect((await readdir(result.moduleDir)).sort()).toEqual(['handlers.ts', 'metrics.ts', 'plugin.ts', 'schema.ts']);
  for (const filename of await readdir(result.moduleDir)) {
    const content = await readFile(join(result.moduleDir, filename), 'utf8');
    expect(content).not.toContain('{{');
    expect(content).not.toContain('download');
  }
  expect(result.importStatement).toContain(`./modules/${name}/plugin`);
  expect(result.registration).toContain(`/api/metrics/${name}`);
  expect(await readFile(join(result.moduleDir, 'metrics.ts'), 'utf8')).toContain(`${name.replaceAll('-', '_')}_events_total`);
});

test.each(['../outside', 'Order', 'foo_bar'])('rejects invalid module name %s before writing files', async (name) => {
  const fixture = await createFixture();
  onTestFinished(() => rm(fixture, { recursive: true, force: true }));
  await expect(generateModule(name, fixture)).rejects.toThrow('模块名');
  expect(await readdir(fixture)).toEqual([]);
});

test('refuses to overwrite an existing module', async ({ onTestFinished }) => {
  const fixture = await createFixture();
  onTestFinished(() => rm(fixture, { recursive: true, force: true }));
  const result = await generateModule('order', fixture);
  await writeFile(join(result.moduleDir, 'schema.ts'), '// user changes\n');
  await expect(generateModule('order', fixture)).rejects.toThrow('模块已存在，未覆盖');
  expect(await readFile(join(result.moduleDir, 'schema.ts'), 'utf8')).toBe('// user changes\n');
});

test('generated plugin typechecks and reports valid events through the shared registry', async ({ onTestFinished }) => {
  const fixture = await createFixture();
  onTestFinished(() => rm(fixture, { recursive: true, force: true }));
  const result = await generateModule('file-upload', fixture);
  const config = ts.readConfigFile(join(root, 'tsconfig.json'), ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  const files = ['schema.ts', 'metrics.ts', 'handlers.ts', 'plugin.ts'].map((name) => join(result.moduleDir, name));
  const program = ts.createProgram(files, { ...parsed.options, rootDir: fixture, noEmit: true });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  expect(diagnostics.map((item) => ts.flattenDiagnosticMessageText(item.messageText, '\n'))).toEqual([]);

  const { fileUploadPlugin } = await import(join(result.moduleDir, 'plugin.ts'));
  const registry = createRegistry();
  const app = Fastify();
  const metricsApp = Fastify();
  onTestFinished(async () => { await Promise.all([app.close(), metricsApp.close()]); });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  metricsApp.register(metricsRoute, { registry });
  app.register(fileUploadPlugin, { prefix: '/api/metrics/file-upload', registry });
  expect((await app.inject({ method: 'POST', url: '/api/metrics/file-upload', payload: { event: 'occurred' } })).statusCode).toBe(200);
  for (const payload of [{ event: 'completed' }, { event: 'occurred', userId: 'unexpected' }]) {
    expect((await app.inject({ method: 'POST', url: '/api/metrics/file-upload', payload })).statusCode).toBe(400);
  }
  expect((await metricsApp.inject('/metrics')).body).toMatch(/file_upload_events_total 1\n/);
});

test('pnpm command generates a module and prints registration without changing app.ts', async ({ onTestFinished }) => {
  const name = `generator-check-${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const moduleDir = join(root, 'src/modules', name);
  expect(existsSync(moduleDir)).toBe(false);
  onTestFinished(() => rm(moduleDir, { recursive: true, force: true }));
  const before = await readFile(join(root, 'src/app.ts'), 'utf8');
  const result = spawnSync('pnpm', ['generate:module', name], { cwd: root, encoding: 'utf8', timeout: 10_000 });
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain(`/api/metrics/${name}`);
  expect(await readdir(moduleDir)).toHaveLength(4);
  expect(await readFile(join(root, 'src/app.ts'), 'utf8')).toBe(before);
});

test('CLI reports usage for missing arguments and supports help', () => {
  const script = join(root, 'scripts/generate-module.ts');
  const missing = spawnSync(process.execPath, ['--import', 'tsx', script], { cwd: root, encoding: 'utf8' });
  expect(missing.status).toBe(1);
  expect(missing.stderr).toContain('用法：pnpm generate:module');
  const help = spawnSync(process.execPath, ['--import', 'tsx', script, '--help'], { cwd: root, encoding: 'utf8' });
  expect(help.status).toBe(0);
  expect(help.stdout).toContain('file-upload');
});
