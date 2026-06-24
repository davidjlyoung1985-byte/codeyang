/**
 * ToolSearchTool — search available tools by name or description.
 * Helps the LLM discover which tools are available for a given task.
 *
 * Uses semantic TF-IDF indexing for more accurate results than simple substring matching.
 */
import { toolSchemas, getAllTools } from './registry.js';
import { semanticToolSearch } from './semantic-index.js';
import { TOOL_ALIASES } from './aliases.js';

export function executeToolSearch(query: string): string {
  if (!query.trim()) return 'Error: search query cannot be empty';

  const allTools = getAllTools();
  const toolNames = allTools.map((t) => t.name);

  // Use semantic search
  const results = semanticToolSearch(query, toolNames, TOOL_ALIASES);

  if (results.length === 0) {
    // Fallback to keyword matching
    const kw = query.toLowerCase();
    const matches = toolSchemas().filter(
      (t) => t.name.toLowerCase().includes(kw) || t.description.toLowerCase().includes(kw),
    );
    if (matches.length === 0) return `No tools found matching: ${query}`;

    const lines: string[] = [`Tools matching "${query}" (keyword fallback, ${matches.length}):`, ''];
    for (const t of matches) {
      lines.push(`  ${t.name}`);
      lines.push(`    ${t.description.split('.')[0]}.`);
    }
    return lines.join('\n');
  }

  const lines: string[] = [`Tools matching "${query}" (semantic, ${results.length}):`, ''];
  for (const r of results.slice(0, 15)) {
    const toolDef = allTools.find((t) => t.name === r.name);
    const desc = toolDef ? `. ${toolDef.description.split('.')[0]}.` : '';
    lines.push(`  ${r.name} [${r.matchType}, score: ${r.score}]${desc}`);
  }
  if (results.length > 15) {
    lines.push(`  ... and ${results.length - 15} more`);
  }

  return lines.join('\n');
}
