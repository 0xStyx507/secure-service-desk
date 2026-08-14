export interface SensitiveDataSanitizerOptions {
  maxDepth?: number;
  maxProperties?: number;
  maxStringLength?: number;
}

const DEFAULT_OPTIONS: Required<SensitiveDataSanitizerOptions> = {
  maxDepth: 5,
  maxProperties: 30,
  maxStringLength: 1_000,
};

const SENSITIVE_KEY_PATTERN = /password|token|cookie|authorization|secret|privatekey/i;
const BEARER_PATTERN = /\b(Bearer|Basic)\s+[^\s,;]+/gi;
const ASSIGNMENT_PATTERN =
  /((?:password|token|cookie|authorization|secret|private[_.-]?key)\s*[:=]\s*)[^\s,;]+/gi;

type SanitizedObject = Record<string, unknown>;

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key.replace(/[^a-z0-9]/gi, ''));
}

function sanitizeString(value: string, maxStringLength: number): string {
  const redacted = value
    .replace(BEARER_PATTERN, '$1 [REDACTED]')
    .replace(ASSIGNMENT_PATTERN, '$1[REDACTED]');

  return redacted.slice(0, maxStringLength);
}

function sanitizeValue(
  value: unknown,
  depth: number,
  options: Required<SensitiveDataSanitizerOptions>,
  ancestors: WeakSet<object>,
): unknown {
  const primitive = sanitizePrimitive(value, options.maxStringLength);
  if (primitive.handled) return primitive.value;
  return sanitizeObject(value as object, depth, options, ancestors);
}

function sanitizePrimitive(
  value: unknown,
  maxStringLength: number,
): { handled: boolean; value: unknown } {
  if (typeof value === 'string') {
    return { handled: true, value: sanitizeString(value, maxStringLength) };
  }
  if (value === null || typeof value === 'boolean' || typeof value === 'number') {
    return { handled: true, value };
  }
  if (typeof value === 'bigint') {
    return { handled: true, value: sanitizeString(value.toString(), maxStringLength) };
  }
  if (typeof value === 'undefined') {
    return { handled: true, value: undefined };
  }
  if (typeof value === 'function' || typeof value === 'symbol') {
    return { handled: true, value: `[${typeof value} omitted]` };
  }
  return { handled: false, value: undefined };
}

function sanitizeObject(
  value: object,
  depth: number,
  options: Required<SensitiveDataSanitizerOptions>,
  ancestors: WeakSet<object>,
): unknown {
  if (depth >= options.maxDepth) {
    return '[MaxDepth]';
  }
  if (ancestors.has(value)) {
    return '[Circular]';
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const jsonValue = readJsonValue(value);
  if (jsonValue.handled) {
    return sanitizeValue(jsonValue.value, depth, options, ancestors);
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return sanitizeArray(value, depth, options, ancestors);
    }
    return sanitizeRecord(value, depth, options, ancestors);
  } finally {
    ancestors.delete(value);
  }
}

function readJsonValue(value: object): { handled: boolean; value?: unknown } {
  const candidate = value as { toJSON?: () => unknown };
  if (typeof candidate.toJSON !== 'function') return { handled: false };
  try {
    const jsonValue = candidate.toJSON();
    return jsonValue === value ? { handled: false } : { handled: true, value: jsonValue };
  } catch {
    return { handled: true, value: '[Unserializable]' };
  }
}

function sanitizeArray(
  value: unknown[],
  depth: number,
  options: Required<SensitiveDataSanitizerOptions>,
  ancestors: WeakSet<object>,
): unknown[] {
  return value
    .slice(0, options.maxProperties)
    .map((item) => sanitizeValue(item, depth + 1, options, ancestors));
}

function sanitizeRecord(
  value: object,
  depth: number,
  options: Required<SensitiveDataSanitizerOptions>,
  ancestors: WeakSet<object>,
): SanitizedObject {
  const output: SanitizedObject = {};
  for (const [key, item] of Object.entries(value).slice(0, options.maxProperties)) {
    if (!isSensitiveKey(key)) {
      output[key.slice(0, 100)] = sanitizeValue(item, depth + 1, options, ancestors);
    }
  }
  return output;
}

export function sanitizeSensitiveData(
  value: unknown,
  options: SensitiveDataSanitizerOptions = {},
): unknown {
  const resolved = { ...DEFAULT_OPTIONS, ...options };
  return sanitizeValue(value, 0, resolved, new WeakSet<object>());
}

export function sanitizeSensitiveRecord(
  value: unknown,
  options: SensitiveDataSanitizerOptions = {},
): Record<string, unknown> {
  const sanitized = sanitizeSensitiveData(value, options);
  return sanitized && typeof sanitized === 'object' && !Array.isArray(sanitized)
    ? (sanitized as Record<string, unknown>)
    : {};
}
