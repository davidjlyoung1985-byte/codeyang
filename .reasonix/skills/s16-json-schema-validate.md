---
name: s16-json-schema-validate
description: JSON Schema 参数校验 — 对所有工具参数做运行时类型检查
runAs: subagent
allowed-tools: read_file, write_file, edit_file, multi_edit, glob, search_content, run_command
---
# JSON Schema Parameter Validation

Add runtime JSON Schema validation for all tool parameters.

## Tasks

### 1. Create `src/tools/schema-validate.ts`

```typescript
// Lightweight JSON Schema validation for tool parameters
export function validateParams(args: Record<string, unknown>, schema: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const props = (schema as any).properties as Record<string, any> || {};
  const required = (schema as any).required as string[] || [];
  
  // Check required fields
  for (const key of required) {
    if (args[key] === undefined || args[key] === null || args[key] === '') {
      errors.push(`Missing required parameter: "${key}"`);
    }
  }
  
  // Type check provided fields
  for (const [key, value] of Object.entries(args)) {
    const propSchema = props[key];
    if (!propSchema || value === undefined || value === null) continue;
    
    const type = propSchema.type;
    if (type === 'string' && typeof value !== 'string') {
      errors.push(`"${key}" must be a string, got ${typeof value}`);
    } else if (type === 'number' && typeof value !== 'number') {
      errors.push(`"${key}" must be a number, got ${typeof value}`);
    } else if (type === 'boolean' && typeof value !== 'boolean') {
      errors.push(`"${key}" must be a boolean, got ${typeof value}`);
    } else if (type === 'array' && !Array.isArray(value)) {
      errors.push(`"${key}" must be an array, got ${typeof value}`);
    }
    
    // Enum check
    if (propSchema.enum && !propSchema.enum.includes(value)) {
      errors.push(`"${key}" must be one of: ${propSchema.enum.join(', ')}, got "${value}"`);
    }
  }
  
  return errors;
}
```

### 2. Integrate into `getTool` or tool execute wrappers

In `src/tools/registry.ts`, create a validated execute wrapper:

```typescript
function validatedExecute(tool: ToolDefinition): (args: Record<string, unknown>) => Promise<string> {
  return async (args) => {
    const schemaErrors = validateParams(args, tool.parameters);
    if (schemaErrors.length > 0) {
      return `[Validation Error] ${schemaErrors.join('; ')}`;
    }
    return tool.execute(args);
  };
}
```

### 3. Verify
```bash
npm run check && npm test
```
