#!/usr/bin/env node
/**
 * SecretScope — CLI entry point.
 *
 * Exit codes:
 *   0  Scan completed, no error-severity findings, and (if --strict)
 *      no findings at all.
 *   1  Scan completed but findings require attention, or --strict
 *      with any finding.
 *   2  Fatal error: invalid options, inaccessible root, or an
 *      unexpected exception.
 *
 * Output routing:
 *   - Report goes to stdout by default, or to --output path.
 *   - Logs and warnings go to stderr.
 *   - --fix without --yes prints a proposal to stderr and never
 *     writes to disk.
 */

import { promises as fs } from 'node:fs';
import { basename, resolve } from 'node:path';

import { Command } from 'commander';

import { Scanner, TOOL_NAME, VERSION } from '../core/scanner.js';
import { formatConsoleReport } from '../reporters/console-reporter.js';
import { formatJsonReport } from '../reporters/json-reporter.js';
import { formatSarifReport } from '../reporters/sarif-reporter.js';
import { Logger } from '../utils/logger.js';
import { fileExists } from '../utils/fs-safe.js';
import { proposeFix, type FixProposal } from '../fixers/env-example-fixer.js';
import { parseCliOptions, type CliOptions } from './options.js';
import type { Finding, ScanReport } from '../core/types.js';

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
  .option(
    '--fix',
    'Propose additions to .env.example. Without --yes, this is a dry-run.',
    false,
  )
  .option(
    '--yes',
    'Confirm the fix proposal. Required to write to disk.',
    false,
  )
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
        fix: opts.fix,
        yes: opts.yes,
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
    if (options.fix) {
      logger.debug(`Fix mode: ${options.yes ? 'apply' : 'dry-run'}`);
    }

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

    if (options.fix) {
      await runFixer(report, options, logger);
    }

    const hasError = report.findings.some((f) => f.severity === 'error');
    const hasAny = report.findings.length > 0;
    if (hasError || (options.strict && hasAny)) {
      process.exitCode = 1;
    }
  });

async function runFixer(
  report: ScanReport,
  options: CliOptions,
  logger: Logger,
): Promise<void> {
  const undocumented = report.findings.filter(
    (f) => f.category === 'undocumented-env-var',
  );
  if (undocumented.length === 0) {
    logger.info('No undocumented variables to fix.');
    return;
  }

  const missingVars = extractVarNames(undocumented);
  const examplePath = resolve(options.root, '.env.example');

  if (!(await fileExists(examplePath))) {
    printCreateProposal(examplePath, missingVars, logger);
    return;
  }

  let existingContent: string;
  try {
    existingContent = await fs.readFile(examplePath, 'utf8');
  } catch (err) {
    logger.error(`Failed to read .env.example: ${errorMessage(err)}`);
    return;
  }

  const apply = options.yes === true;
  const proposal = proposeFix({
    examplePath,
    existingContent,
    missingVars,
    apply,
  });

  printFixProposal(proposal, examplePath, logger);

  if (proposal.applied && proposal.added.length > 0) {
    try {
      await fs.writeFile(examplePath, proposal.updatedContent, 'utf8');
      logger.info(
        `Wrote ${proposal.added.length} addition(s) to ${examplePath}`,
      );
    } catch (err) {
      logger.error(`Failed to write .env.example: ${errorMessage(err)}`);
    }
  } else if (!proposal.applied && proposal.added.length > 0) {
    logger.info(
      'Dry run. Re-run with --fix --yes to write these changes.',
    );
  }
}

function extractVarNames(findings: readonly Finding[]): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const f of findings) {
    const match = /Environment variable (\S+) is defined/.exec(f.message);
    if (!match || !match[1]) continue;
    if (seen.has(match[1])) continue;
    seen.add(match[1]);
    names.push(match[1]);
  }
  return names;
}

function printCreateProposal(
  examplePath: string,
  missingVars: readonly string[],
  logger: Logger,
): void {
  logger.warn(
    `${examplePath} does not exist. Not creating it automatically. ` +
      `Create it manually with the following variables:`,
  );
  for (const name of missingVars) {
    process.stderr.write(`  ${name}=\n`);
  }
}

function printFixProposal(
  proposal: FixProposal,
  examplePath: string,
  logger: Logger,
): void {
  if (proposal.added.length === 0) {
    logger.info(`${basename(examplePath)} is already up to date.`);
    return;
  }
  for (const warning of proposal.warnings) {
    logger.warn(warning);
  }
  logger.info(
    `Proposed additions to ${examplePath}: ${proposal.added.length}`,
  );
  for (const name of proposal.added) {
    process.stderr.write(`  + ${name}\n`);
  }
}

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