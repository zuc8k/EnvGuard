/**
 * SecretScope — Secret detection rules.
 *
 * Design principles:
 *   1. HIGH PRECISION over high recall.
 *      Each pattern matches a specific, documented token format.
 *      A false positive in a security tool is worse than a miss,
 *      because it erodes trust and causes alert fatigue.
 *   2. No generic "long random string" heuristics.
 *      Entropy-based detection is deliberately left for a later
 *      version, opt-in via a flag.
 *   3. All patterns use the `g` flag so they can be applied to a
 *      full file content in one pass.
 *   4. Patterns do not overlap with each other.
 *      SECRET_OPENAI uses a negative lookahead to exclude the
 *      Anthropic prefix, so `sk-ant-...` is reported only once.
 *
 * Each rule's `pattern` matches the FULL secret value. There are no
 * capture groups; `valueGroup` is not set. The matched text is passed
 * through maskValue() before being placed in any Finding.
 */

import type { SecretRule } from '../core/types.js';

export const SECRET_RULES: readonly SecretRule[] = [
  {
    id: 'SECRET_ANTHROPIC_API_KEY',
    description: 'Anthropic API key',
    severity: 'error',
    pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    id: 'SECRET_OPENAI_API_KEY',
    description: 'OpenAI API key',
    severity: 'error',
    // Excludes the Anthropic prefix to avoid double-reporting.
    pattern: /\bsk-(?!ant-)[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    id: 'SECRET_STRIPE_LIVE_SECRET_KEY',
    description: 'Stripe live secret key',
    severity: 'error',
    pattern: /\bsk_live_[A-Za-z0-9]{24,}\b/g,
  },
  {
    id: 'SECRET_AWS_ACCESS_KEY_ID',
    description: 'AWS access key ID',
    severity: 'error',
    pattern: /\bAKIA[0-9A-Z]{16}\b/g,
  },
  {
    id: 'SECRET_GITHUB_PAT',
    description: 'GitHub personal access token',
    severity: 'error',
    pattern: /\bghp_[A-Za-z0-9]{36}\b/g,
  },
  {
    id: 'SECRET_GITHUB_OAUTH',
    description: 'GitHub OAuth token',
    severity: 'error',
    pattern: /\bgho_[A-Za-z0-9]{36}\b/g,
  },
  {
    id: 'SECRET_GITHUB_APP_TOKEN',
    description: 'GitHub App token',
    severity: 'error',
    // Matches both ghu_ (user-to-server) and ghs_ (server-to-server).
    pattern: /\bgh[us]_[A-Za-z0-9]{36}\b/g,
  },
  {
    id: 'SECRET_GITHUB_REFRESH_TOKEN',
    description: 'GitHub refresh token',
    severity: 'error',
    pattern: /\bghr_[A-Za-z0-9]{76}\b/g,
  },
  {
    id: 'SECRET_SLACK_BOT_TOKEN',
    description: 'Slack bot or app token',
    severity: 'error',
    pattern: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/g,
  },
  {
    id: 'SECRET_GOOGLE_API_KEY',
    description: 'Google API key',
    severity: 'error',
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g,
  },
  {
    id: 'SECRET_NPM_TOKEN',
    description: 'npm access token',
    severity: 'error',
    pattern: /\bnpm_[A-Za-z0-9]{36}\b/g,
  },
  {
    id: 'SECRET_PRIVATE_KEY_HEADER',
    description: 'Private key header',
    severity: 'error',
    // Matches the header only, not the key body. Presence of a
    // private key in any scanned file is sufficient signal.
    pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----/g,
  },
];

/**
 * Returns the rules whose `filePatterns` (if any) match the given
 * display path. For MVP, `filePatterns` is unused, but this helper
 * keeps future rule-scoped filtering centralized.
 */
export function rulesApplicableToPath(
  rules: readonly SecretRule[],
  _displayPath: string,
): readonly SecretRule[] {
  // No rule uses filePatterns in this version.
  // Placeholder for future extension.
  return rules;
}