import { z } from 'zod';

// Define business-specific events and fields here.
export const {{camelName}}EventSchema = z.strictObject({
  event: z.literal('occurred'),
});
export const acceptedSchema = z.strictObject({ ok: z.literal(true) });
export type {{pascalName}}Event = z.infer<typeof {{camelName}}EventSchema>;
