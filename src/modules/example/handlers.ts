import type { DownloadEvent } from './schema';
import type { DownloadMetrics } from './metrics';

export function createDownloadHandler(metrics: DownloadMetrics, now = Date.now) {
  return (event: DownloadEvent): void => {
    const labels = { source: event.source };
    switch (event.event) {
      case 'completed':
        metrics.completed.inc(labels);
        metrics.duration.observe(labels, event.duration);
        metrics.durationSummary.observe(labels, event.duration);
        metrics.bytes.inc(labels, event.size);
        return;
      case 'failed':
        metrics.failed.inc({ ...labels, reason: event.reason });
        return;
      case 'progress':
        metrics.speed.set(labels, event.speed);
        metrics.progressUpdatedAt.set(labels, now() / 1000);
        return;
      default: {
        const exhaustive: never = event;
        throw new Error(`Unhandled download event: ${String(exhaustive)}`);
      }
    }
  };
}
