/**
 * SecretScope — Safe filesystem helpers.
 *
 * All file reads in SecretScope go through this module so that
 * size limits, error handling, and path normalization are
 * consistent across scanners.
 */

import { promises as fs } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

/** Default maximum size for any single file read (1 MiB). */
export const DEFAULT_MAX_FILE_SIZE = 1024 * 1024;

export interface ReadOptions {
  /** Maximum number of bytes to read. Defaults to DEFAULT_MAX_FILE_SIZE. */
  maxBytes?: number;
  /** Text encoding. Defaults to 'utf8'. */
  encoding?: BufferEncoding;
}

export interface ReadResult {
  content: string;
  bytes: number;
}

/**
 * Thrown when a file exceeds the configured size limit.
 * The caller can catch this to skip the file with a warning.
 */
export class FileTooLargeError extends Error {
  readonly filePath: string;
  readonly size: number;
  readonly limit: number;

  constructor(filePath: string, size: number, limit: number) {
    super(`File exceeds size limit (${size} > ${limit} bytes): ${filePath}`);
    this.name = 'FileTooLargeError';
    this.filePath = filePath;
    this.size = size;
    this.limit = limit;
  }
}

/**
 * Reads a file as UTF-8 text, refusing files larger than `maxBytes`.
 * Uses stat() first to avoid loading huge files into memory.
 */
export async function readTextFile(
  filePath: string,
  options: ReadOptions = {},
): Promise<ReadResult> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_FILE_SIZE;
  const encoding = options.encoding ?? 'utf8';

  const stat = await fs.stat(filePath);
  if (!stat.isFile()) {
    throw new Error(`Not a regular file: ${filePath}`);
  }
  if (stat.size > maxBytes) {
    throw new FileTooLargeError(filePath, stat.size, maxBytes);
  }

  const buffer = await fs.readFile(filePath);
  return { content: buffer.toString(encoding), bytes: buffer.byteLength };
}

/** Returns true if the path exists and is a regular file. */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

/** Returns true if the path exists and is a directory. */
export async function dirExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Returns `target` as a path relative to `root` when possible,
 * using forward slashes regardless of platform. If `target` is
 * outside `root`, the absolute path is returned instead.
 */
export function toRelativePath(root: string, target: string): string {
  const absoluteRoot = resolve(root);
  const absoluteTarget = isAbsolute(target) ? resolve(target) : resolve(absoluteRoot, target);

  const rel = relative(absoluteRoot, absoluteTarget);
  if (rel === '') return '.';
  if (rel.startsWith('..') || isAbsolute(rel)) return absoluteTarget;

  return rel.split('\\').join('/');
}