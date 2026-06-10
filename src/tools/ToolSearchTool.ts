/**
 * ToolSearchTool — search available tools by name or description.
 * Helps the LLM discover which tools are available for a given task.
 */
import { toolSchemas } from './registry.js';

export async function executeToolSearch(query: string): Promise<string> {
  if (!query.trim()) return 'Error: search query cannot be empty';

  const schemas = toolSchemas();
  const kw = query.toLowerCase();

  const matches = schemas.filter(
    (t) => t.name.toLowerCase().includes(kw) || t.description.toLowerCase().includes(kw),
  );

  if (matches.length === 0) return `No tools found matching: ${query}`;

  const lines: string[] = [
    `Tools matching "${query}" (${matches.length}):`,
    '',
  ];
  for (const t of matches) {
    lines.push(`  ${t.name}`);
    lines.push(`    ${t.description.split('.')[0]}.`);
    const props = (t.input_schema as any)?.properties;
    if (props) {
      const paramList = Object.keys(props).join(', ');
      lines.push(`    Parameters: ${paramList}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
