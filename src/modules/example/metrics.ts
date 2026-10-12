import { Counter, Gauge, Histogram, Summary } from '@prometheus-io/client';
import type { Registry } from '@prometheus-io/client';

export function createDownloadMetrics(registry: Registry) {
  // The caller owns the registry shared by all of its business modules.
  const completed = new Counter({
    name: 'download_completed_total',
    help: 'Number of accepted completed download events.',
    labelNames: ['source'] as const,
    registers: [registry],
  });
  const failed = new Counter({
    name: 'download_failed_total',
    help: 'Number of accepted failed download events.',
    labelNames: ['source', 'reason'] as const,
    registers: [registry],
  });
  const duration = new Histogram({
    name: 'download_duration_seconds',
    help: 'Duration of completed downloads in seconds.',
    labelNames: ['source'] as const,
    buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 300],
    registers: [registry],
  });
  // The same observation demonstrates Summary alongside Histogram.
  const durationSummary = new Summary({
    name: 'download_duration_summary_seconds',
    help: 'Accepted completed download durations in seconds; instance-local rolling quantiles, cumulative sum/count.',
    labelNames: ['source'] as const,
    percentiles: [0.5, 0.95, 0.99],
    maxAgeSeconds: 600,
    ageBuckets: 5,
    pruneAgedBuckets: false,
    registers: [registry],
  });
  const bytes = new Counter({
    name: 'download_completed_bytes_total',
    help: 'Total bytes in accepted completed download events.',
    labelNames: ['source'] as const,
    registers: [registry],
  });
  const speed = new Gauge({
    name: 'download_speed_bytes_per_second',
    help: 'Latest authoritative aggregate speed snapshot for a source, in bytes per second.',
    labelNames: ['source'] as const,
    registers: [registry],
  });
  const progressUpdatedAt = new Gauge({
    name: 'download_progress_updated_timestamp_seconds',
    help: 'Server receipt time of the latest progress snapshot, as Unix seconds.',
    labelNames: ['source'] as const,
    registers: [registry],
  });
  return { completed, failed, duration, durationSummary, bytes, speed, progressUpdatedAt };
}

export type DownloadMetrics = ReturnType<typeof createDownloadMetrics>;
