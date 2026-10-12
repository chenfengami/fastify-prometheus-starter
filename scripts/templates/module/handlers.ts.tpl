import type { {{pascalName}}Event } from './schema';
import type { {{pascalName}}Metrics } from './metrics';

export function create{{pascalName}}Handler(metrics: {{pascalName}}Metrics) {
  return (_event: {{pascalName}}Event): void => {
    metrics.events.inc();
  };
}
