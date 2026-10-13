import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { createRegistry } from './core/registry';
import { examplePlugin } from './modules/example/plugin';
import { metricsRoute } from './routes/metrics';

interface AppOptions {
  logger?: boolean;
}

export function buildApp({ logger = false }: AppOptions = {}) {
  const app = Fastify({ logger, bodyLimit: 16 * 1024 });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  const registry = createRegistry();
  const metricsApp = Fastify({ logger });
  // Scraping first must still initialize all business metrics.
  metricsApp.addHook('onReady', async () => { await app.ready(); });
  metricsApp.register(metricsRoute, { registry });
  app.register(examplePlugin, { prefix: '/api/metrics/example', registry });
  // Register additional business plugins here, using the same registry.
  async function close() {
    const results = await Promise.allSettled([app.close(), metricsApp.close()]);
    const errors = results.flatMap((result) => result.status === 'rejected' ? [result.reason as unknown] : []);
    if (errors.length > 0) throw new AggregateError(errors, 'Failed to close servers');
  }
  return { app, metricsApp, close };
}
