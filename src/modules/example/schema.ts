import { z } from 'zod';

// This copyable module demonstrates download events with concrete semantics.

export const downloadSources = ['huggingface', 'github', 'other'] as const;
export const failureReasons = ['network', 'timeout', 'cancelled', 'other'] as const;
const source = z.enum(downloadSources);
const nonnegativeNumber = z.number().finite().nonnegative();

// strictObject rejects extra fields instead of silently dropping them.
export const downloadEventSchema = z.discriminatedUnion('event', [
  z.strictObject({
    event: z.literal('completed'),
    source,
    duration: nonnegativeNumber,
    size: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  }),
  z.strictObject({
    event: z.literal('failed'),
    source,
    reason: z.enum(failureReasons),
  }),
  z.strictObject({
    event: z.literal('progress'),
    source,
    // Authoritative total for this source, not an individual task's speed.
    speed: nonnegativeNumber,
  }),
]);

export const acceptedSchema = z.strictObject({ ok: z.literal(true) });
export type DownloadEvent = z.infer<typeof downloadEventSchema>;
