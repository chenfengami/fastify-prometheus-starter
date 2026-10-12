import type { FastifyPluginAsync } from 'fastify';
import type { Registry } from '@prometheus-io/client';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { acceptedSchema, {{camelName}}EventSchema } from './schema';
import { create{{pascalName}}Metrics } from './metrics';
import { create{{pascalName}}Handler } from './handlers';

export const {{camelName}}Plugin: FastifyPluginAsync<{ registry: Registry }> = async (app, { registry }) => {
  const handle = create{{pascalName}}Handler(create{{pascalName}}Metrics(registry));
  app.withTypeProvider<ZodTypeProvider>().post('/', {
    prefixTrailingSlash: 'no-slash',
    schema: { body: {{camelName}}EventSchema, response: { 200: acceptedSchema } },
  }, async (request) => {
    handle(request.body);
    return { ok: true as const };
  });
};
