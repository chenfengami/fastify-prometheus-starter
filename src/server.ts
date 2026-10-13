import { buildApp } from './app';

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}
const metricsPort = Number(process.env.METRICS_PORT ?? 9091);
if (!Number.isInteger(metricsPort) || metricsPort < 1 || metricsPort > 65535) {
  throw new Error('METRICS_PORT must be an integer between 1 and 65535');
}
if (port === metricsPort) {
  throw new Error('PORT and METRICS_PORT must be different');
}
const { app, metricsApp, close } = buildApp({ logger: true });
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void close().catch((error: unknown) => {
      app.log.error(error);
      process.exitCode = 1;
    });
  });
}
try {
  await app.listen({ port, host: process.env.HOST ?? '127.0.0.1' });
  await metricsApp.listen({ port: metricsPort, host: process.env.METRICS_HOST ?? '127.0.0.1' });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
  await close().catch((closeError: unknown) => { app.log.error(closeError); });
}
