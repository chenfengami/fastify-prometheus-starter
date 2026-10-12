import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const templateRoot = fileURLToPath(new URL('./templates/module/', import.meta.url));
const filenames = ['schema.ts', 'metrics.ts', 'handlers.ts', 'plugin.ts'] as const;
const usage = '用法：pnpm generate:module <名称>\n例如：pnpm generate:module order\n      pnpm generate:module file-upload';

export async function generateModule(name: string, root = projectRoot) {
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(name) || name.length > 64) {
    throw new Error('模块名须以小写字母开头，只能包含小写字母、数字和单个连字符，长度不超过 64。');
  }
  const pascalName = name.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');
  const camelName = pascalName.charAt(0).toLowerCase() + pascalName.slice(1);
  const values: Record<string, string> = {
    moduleName: name,
    pascalName,
    camelName,
    metricPrefix: name.replaceAll('-', '_'),
  };
  // Load all templates before creating anything; the destination is exclusive.
  const files = await Promise.all(filenames.map(async (filename) => {
    const template = await readFile(join(templateRoot, `${filename}.tpl`), 'utf8');
    const content = template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
      const value = values[key];
      if (value === undefined) throw new Error(`未知模板变量：${key}`);
      return value;
    });
    return { filename, content };
  }));
  const modulesRoot = resolve(root, 'src/modules');
  const moduleDir = join(modulesRoot, name);
  await mkdir(modulesRoot, { recursive: true });
  try {
    await mkdir(moduleDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error(`模块已存在，未覆盖：src/modules/${name}`);
    }
    throw error;
  }
  try {
    for (const { filename, content } of files) {
      await writeFile(join(moduleDir, filename), content, { flag: 'wx' });
    }
  } catch (error) {
    // Only roll back the new directory created by this invocation.
    await rm(moduleDir, { recursive: true, force: true });
    throw error;
  }
  return {
    moduleDir,
    importStatement: `import { ${camelName}Plugin } from './modules/${name}/plugin';`,
    registration: `app.register(${camelName}Plugin, {\n  prefix: '/api/metrics/${name}',\n  registry,\n});`,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    console.log(usage);
  } else {
    try {
      const name = args[0];
      if (args.length !== 1 || !name) throw new Error(usage);
      const result = await generateModule(name);
      console.log(`已生成 src/modules/${name}/：schema.ts、metrics.ts、handlers.ts、plugin.ts`);
      console.log(`\n请在 src/app.ts 添加：\n\n${result.importStatement}\n\n${result.registration}`);
      console.log('\n生成的初始事件为 {"event":"occurred"}。请按业务需求调整字段和指标，然后运行类型检查、测试和构建。');
    } catch (error) {
      console.error(`生成失败：${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    }
  }
}
