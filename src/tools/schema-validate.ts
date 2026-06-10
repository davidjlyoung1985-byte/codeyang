/**
 * Lightweight JSON Schema parameter validation for tool definitions.
 *
 * Validates tool call arguments against the JSON Schema declared in
 * `ToolDefinition.parameters` before execution. Catches missing required
 * fields, type mismatches, and enum violations early with clear messages.
 *
 * Uses the same error-formatting conventions as errors.ts.
 */

import { toolError } from './errors.js';

/** Result of a parameter validation run. */
export interface ValidationResult {
  /** true when all checks pass. */
  valid: boolean;
  /** Human-readable error messages (empty when valid). */
  errors: string[];
}

/**
 * Validate tool-call arguments against a JSON Schema parameters block.
 *
 * Covers the subset of JSON Schema that tool definitions actually use:
 * - `required` — fields that must be present and non-null/undefined
 * - `type` — string / number / boolean / array / object checks
 * - `enum` — value must be one of the listed options
 * - `items.type` — element-type check for arrays
 *
 * Returns a list of error messages (empty = valid).
 */
export function validateParams(args: Record<string, unknown>, schema: Record<string, unknown>): string[] {
  const errors: string[] = [];

  if (!schema || typeof schema !== 'object') {
    return errors;
  }

  const props = (schema as Record<string, any>).properties ?? {};
  const required: string[] = (schema as Record<string, any>).required ?? [];

  // ── Required-field checks ──────────────────────────────────────────
  for (const key of required) {
    const val = args[key];
    if (val === undefined || val === null) {
      errors.push(toolError('Validation', `Missing required parameter: "${key}"`));
    }
  }

  // ── Type / enum checks for provided values ─────────────────────────
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined || value === null) continue;

    const propSchema: Record<string, any> | undefined = props[key];
    if (!propSchema) continue; // Unknown param – let the tool handle it

    const expectedTypes: string[] = Array.isArray(propSchema.type)
      ? propSchema.type
      : propSchema.type
        ? [propSchema.type]
        : [];

    // Resolve potential `$ref` – not used in current defs, but be safe
    // For now we only handle inline schemas.

    for (const expectedType of expectedTypes) {
      switch (expectedType) {
        case 'string': {
          if (typeof value !== 'string') {
            errors.push(toolError('Validation', `"${key}" must be a string, got ${typeName(value)}`));
          }
          break;
        }
        case 'number': {
          if (typeof value !== 'number' || Number.isNaN(value)) {
            errors.push(toolError('Validation', `"${key}" must be a number, got ${typeName(value)}`));
          }
          break;
        }
        case 'boolean': {
          if (typeof value !== 'boolean') {
            errors.push(toolError('Validation', `"${key}" must be a boolean, got ${typeName(value)}`));
          }
          break;
        }
        case 'array': {
          if (!Array.isArray(value)) {
            errors.push(toolError('Validation', `"${key}" must be an array, got ${typeName(value)}`));
          } else {
            // Element-type check for arrays with `items.type`
            const itemsSchema = propSchema.items as Record<string, any> | undefined;
            if (itemsSchema?.type && value.length > 0) {
              const itemType = itemsSchema.type;
              for (let i = 0; i < value.length; i++) {
                const item = value[i];
                const ok =
                  itemType === 'string'
                    ? typeof item === 'string'
                    : itemType === 'number'
                      ? typeof item === 'number' && !Number.isNaN(item)
                      : itemType === 'boolean'
                        ? typeof item === 'boolean'
                        : itemType === 'object'
                          ? typeof item === 'object' && item !== null && !Array.isArray(item)
                          : true;
                if (!ok) {
                  errors.push(toolError('Validation', `"${key}[${i}]" must be a ${itemType}, got ${typeName(item)}`));
                }
              }
            }
          }
          break;
        }
        case 'object': {
          if (typeof value !== 'object' || value === null || Array.isArray(value)) {
            errors.push(toolError('Validation', `"${key}" must be an object, got ${typeName(value)}`));
          }
          break;
        }
        // No default – unknown types are silently accepted
      }
    }

    // ── Enum check (applied after type check) ────────────────────────
    const enumVals: unknown[] | undefined = propSchema.enum;
    if (enumVals && Array.isArray(enumVals) && enumVals.length > 0) {
      if (!enumVals.some((e) => e === value)) {
        const allowed = enumVals.map((e) => String(e)).join(', ');
        errors.push(toolError('Validation', `"${key}" must be one of: ${allowed}, got "${String(value)}"`));
      }
    }
  }

  return errors;
}

/** Human-readable name for a runtime value's type. */
function typeName(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}
