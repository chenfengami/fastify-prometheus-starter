import { Counter } from '@prometheus-io/client';
import type { Registry } from '@prometheus-io/client';

export function create{{pascalName}}Metrics(registry: Registry) {
  // Counts accepted requests, without deduplication; resets on process restart.
  const events = new Counter({
    name: '{{metricPrefix}}_events_total',
    help: 'Number of accepted {{moduleName}} occurred events.',
    registers: [registry],
  });
  return { events };
}
export type {{pascalName}}Metrics = ReturnType<typeof create{{pascalName}}Metrics>;
