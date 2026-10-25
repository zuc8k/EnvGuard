#!/usr/bin/env node
/**
 * SecretScope — CLI entry point.
 *
 * Exit codes:
 *   0  Scan completed successfully, no error-severity findings,
 *      and (if --strict) no findings at all.
 *   1  Scan completed successfully, but findings require attention
 *      (any error-severity finding, or --strict with any finding).
 *   2  Fatal error: invalid options, inaccessible root, or an
 *      unexpected exception.
 *
 * Output routing:
 *   - Default: report goes to stdout. Progress and warnings go to stderr.
 *   - With --output: report goes to the given file. Progress and
 *     warnings still go to stderr.
 *   - --quiet suppresses info-level log messages but never suppresses
 *     the report or error messages.
 */

import { promises as fs } from 'node:fs';

import { Command } from 'commander';

import { Scanner, TOOL_NAME, VERSION } from '../core/scanner.js';
import { formatConsoleReport } from '../reporters/console-reporter.js';
import { formatJsonReport } from '../reporters/json-reporter.js';
import { formatSarifReport } from '../reporters/sarif-reporter.js';
import { Logger } from '../utils/logger.js';
import { parseCliOptions, type CliOptions } from './options.js';
import type { ScanReport } from '../core/types.js';

const program = new Command();

program
  .name(TOOL_NAME)
  .description(
    'Privacy-first CLI that audits .env files against TypeScript/JavaScript code.',
  )
  .version(VERSION, '-V, --version', 'Print version and exit')
  .option('-r, --root <path>', 'Project root (default: current directory)')
  .option(
    '-e, --exclude <pattern...>',
    'Glob patterns to exclude (on top of default ignores)',
  )
  .option(
    '--max-file-size <bytes>',
    'Maximum bytes per file (default: 1048576)',
  )
  .option(
    '-f, --format <format>',
    'Output format: console | json | sarif',
    'console',
  )
  .option(
    '-o, --output <path>',
    'Write the report to a file instead of stdout',
  )
  .option('--strict', 'Exit with code 1 if any finding is reported', false)
  .option('-q, --quiet', 'Suppress info-level log messages', false)
  .option('--verbose', 'Enable verbose log messages', false)
  .option('--no-color', 'Disable ANSI colors in console output')
  .argument('[path]', 'Alias for --root')
  .action(async (pathArg: string | undefined) => {
    const opts = program.opts();

    const root = pathArg ?? opts.root ?? process.cwd();

    let options: CliOptions;
    try {
      options = parseCliOptions({
        root,
        exclude: opts.exclude ?? [],
        maxFileSize: opts.maxFileSize,
        format: opts.format,
        output: opts.output,
        strict: opts.strict,
        quiet: opts.quiet,
        verbose: opts.verbose,
        color: opts.color,
      });
    } catch (err) {
      process.stderr.write(`Error: ${errorMessage(err)}\n`);
      process.exit(2);
    }

    const logger = new Logger({
      quiet: options.quiet,
      verbose: options.verbose,
    });

    logger.debug(`Root: ${options.root}`);
    logger.debug(`Format: ${options.format}`);

    let report: ScanReport;
    try {
      const scanner = new Scanner();
      report = await scanner.scan({
        root: options.root,
        ...(options.exclude.length > 0 ? { exclude: options.exclude } : {}),
        ...(options.maxFileSize !== undefined
          ? { maxFileSize: options.maxFileSize }
          : {}),
      });
    } catch (err) {
      logger.error(`Fatal error: ${errorMessage(err)}`);
      process.exit(2);
    }

    const output = formatReport(report, options);

    try {
      if (options.output !== undefined) {
        await fs.writeFile(options.output, `${output}\n`, 'utf8');
        logger.info(`Report written to ${options.output}`);
      } else {
        process.stdout.write(`${output}\n`);
      }
    } catch (err) {
      logger.error(`Failed to write output: ${errorMessage(err)}`);
      process.exit(2);
    }

    const hasError = report.findings.some((f) => f.severity === 'error');
    const hasAny = report.findings.length > 0;
    if (hasError || (options.strict && hasAny)) {
      process.exitCode = 1;
    }
  });

function formatReport(report: ScanReport, options: CliOptions): string {
  switch (options.format) {
    case 'json':
      return formatJsonReport(report);
    case 'sarif':
      return formatSarifReport(report);
    case 'console':
      return formatConsoleReport(report, {
        color: options.color,
        quiet: options.quiet,
      });
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

program.parseAsync(process.argv).catch((err: unknown) => {
  process.stderr.write(`Fatal error: ${errorMessage(err)}\n`);
  process.exit(2);
});