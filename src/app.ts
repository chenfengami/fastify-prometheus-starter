import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { createRegistry } from './core/registry';
import { examplePlugin } from './modules/example/plugin';
import { metricsRoute } from './routes/metrics';

export function buildApp({ logger = false }: { logger?: boolean } = {}) {
  const app = Fastify({ logger, bodyLimit: 16 * 1024 });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  const registry = createRegistry();
  app.register(metricsRoute, { registry });
  app.register(examplePlugin, { prefix: '/api/metrics/example', registry });
  // Register additional business plugins here, using the same registry.
  return app;
}
