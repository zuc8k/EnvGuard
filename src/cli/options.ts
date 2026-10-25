/**
 * SecretScope — CLI option schema.
 *
 * All CLI options pass through this Zod schema before reaching the
 * scanner. This guarantees that the scanner receives well-typed,
 * validated values and that malformed input produces a clear error
 * message rather than undefined behavior.
 *
 * No secret values are ever part of CLI options.
 */

import { z } from 'zod';

/** Supported output formats. */
export const OutputFormatSchema = z.enum(['console', 'json', 'sarif']);
export type OutputFormat = z.infer<typeof OutputFormatSchema>;

/**
 * The full validated option set.
 *
 * Notes on specific fields:
 *   - `root` is required to be a non-empty string. The CLI fills it
 *     with process.cwd() before validation, so users see a sensible
 *     default without any additional logic.
 *   - `maxFileSize` accepts strings (as passed by commander) and
 *     coerces them to a positive integer, or `undefined` if absent.
 *   - `output` is optional. When absent, the report goes to stdout.
 *   - `color` defaults to true. `--no-color` sets it to false.
 */
export const CliOptionsSchema = z.object({
  root: z.string().min(1),
  exclude: z.array(z.string().min(1)).default([]),
  maxFileSize: z.preprocess(
    (value) => {
      if (value === undefined || value === null || value === '') {
        return undefined;
      }
      if (typeof value === 'number') return value;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : value;
    },
    z.number().int().positive().optional(),
  ),
  format: OutputFormatSchema.default('console'),
  output: z.string().min(1).optional(),
  strict: z.boolean().default(false),
  quiet: z.boolean().default(false),
  verbose: z.boolean().default(false),
  color: z.boolean().default(true),
});

export type CliOptions = z.infer<typeof CliOptionsSchema>;

/**
 * Parses and validates CLI options.
 * Throws ZodError with a readable message on invalid input.
 */
export function parseCliOptions(input: unknown): CliOptions {
  return CliOptionsSchema.parse(input);
}