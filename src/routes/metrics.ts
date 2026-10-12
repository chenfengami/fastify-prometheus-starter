import type { FastifyPluginAsync } from 'fastify';
import type { Registry } from '@prometheus-io/client';

export const metricsRoute: FastifyPluginAsync<{ registry: Registry }> = async (app, { registry }) => {
  app.get('/metrics', async (_request, reply) => {
    return reply.type(registry.contentType).send(await registry.metrics());
  });
};
