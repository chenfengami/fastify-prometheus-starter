import type { FastifyPluginAsync } from 'fastify';
import type { Registry } from '@prometheus-io/client';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { acceptedSchema, downloadEventSchema } from './schema';
import { createDownloadMetrics } from './metrics';
import { createDownloadHandler } from './handlers';

interface ExamplePluginOptions {
  registry: Registry;
}

// Leave this as a normal plugin so Fastify's prefix and encapsulation apply.
export const examplePlugin: FastifyPluginAsync<ExamplePluginOptions> = async (app, { registry }) => {
  const handle = createDownloadHandler(createDownloadMetrics(registry));
  app.withTypeProvider<ZodTypeProvider>().post('/', {
    prefixTrailingSlash: 'no-slash',
    schema: {
      body: downloadEventSchema,
      response: { 200: acceptedSchema },
    },
  }, async (request) => {
    handle(request.body);
    return { ok: true as const };
  });
};
