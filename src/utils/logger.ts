/**
 * SecretScope — Minimal logger.
 *
 * All log output goes to stderr so that stdout stays reserved for
 * the actual report (JSON / SARIF / console summary).
 *
 * This logger does not read from process.env and does not mask
 * anything by itself. Callers MUST pass already-redacted messages.
 */

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface LoggerOptions {
  /** Suppress info and warn messages. Errors are always printed. */
  quiet?: boolean;
  /** Enable debug-level messages. */
  verbose?: boolean;
  /** Emit each line as a JSON object instead of a prefixed string. */
  json?: boolean;
}

export class Logger {
  private readonly quiet: boolean;
  private readonly verbose: boolean;
  private readonly json: boolean;

  constructor(options: LoggerOptions = {}) {
    this.quiet = options.quiet === true;
    this.verbose = options.verbose === true;
    this.json = options.json === true;
  }

  info(message: string): void {
    if (this.quiet) return;
    this.write('info', message);
  }

  warn(message: string): void {
    if (this.quiet) return;
    this.write('warn', message);
  }

  error(message: string): void {
    this.write('error', message);
  }

  debug(message: string): void {
    if (!this.verbose) return;
    this.write('debug', message);
  }

  private write(level: LogLevel, message: string): void {
    if (this.json) {
      process.stderr.write(`${JSON.stringify({ level, message })}\n`);
      return;
    }
    const prefix = level === 'debug' ? '[debug]' : `[${level}]`;
    process.stderr.write(`${prefix} ${message}\n`);
  }
}