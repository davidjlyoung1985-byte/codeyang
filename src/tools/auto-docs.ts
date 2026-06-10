import { toolSchemas } from './registry.js';

interface DocEntry {
  name: string;
  description: string;
  parameters: string;
  category: string;
}

const CATEGORY_MAP: Record<string, string> = {
  // Core tools
  Bash: 'Core',
  Read: 'Core',
  Write: 'Core',
  Edit: 'Core',
  Glob: 'Core',
  Grep: 'Core',
  TodoWrite: 'Core',
  WebFetch: 'Core',
  Task: 'Core',
  Question: 'Core',
  // File System tools
  Copy: 'File System',
  Move: 'File System',
  Delete: 'File System',
  Mkdir: 'File System',
  List: 'File System',
  Exists: 'File System',
  // Data tools
  JsonParse: 'Data',
  JsonWrite: 'Data',
  JsonQuery: 'Data',
  YamlParse: 'Data',
  YamlWrite: 'Data',
  Convert: 'Data',
  CsvParse: 'Data',
  CsvWrite: 'Data',
  XmlParse: 'Data',
  XmlWrite: 'Data',
  // Git tools
  GitStatus: 'Git',
  GitDiff: 'Git',
  GitCommit: 'Git',
  GitBranch: 'Git',
  GitCheckout: 'Git',
  GitLog: 'Git',
  GitPush: 'Git',
  GitPull: 'Git',
  GitClone: 'Git',
  GitAdd: 'Git',
  GitReset: 'Git',
  GitStash: 'Git',
  GitMerge: 'Git',
  GitRemote: 'Git',
  GitCurrentBranch: 'Git',
  GitBlame: 'Git',
  // Code Analysis tools
  ParseAst: 'Code Analysis',
  AnalyzeCode: 'Code Analysis',
  Complexity: 'Code Analysis',
  Lint: 'Code Analysis',
  FindDeps: 'Code Analysis',
  CountLines: 'Code Analysis',
  // Network tools
  HttpRequest: 'Network',
  DownloadFile: 'Network',
  UploadFile: 'Network',
  ApiCall: 'Network',
  CheckUrl: 'Network',
  ParseUrl: 'Network',
  // Memory tools
  Remember: 'Memory',
  Recall: 'Memory',
  Forget: 'Memory',
  ListMemories: 'Memory',
  // Image tools
  ImageInfo: 'Image',
  ImageToBase64: 'Image',
  ListImages: 'Image',
  // Math tools (dynamic)
  MathSolve: 'Math',
  MathPlot: 'Math',
  MathExplain: 'Math',
  // Search tool
  Search: 'Search',
};

/** Try to infer category from the tool name, falling back to "Other". */
function inferCategory(name: string): string {
  return CATEGORY_MAP[name] || 'Other';
}

/** Format a tool's parameter schema as a Markdown bullet list */
function formatParameters(schema: {
  type?: string;
  properties?: Record<string, unknown>;
  required?: string[];
}): string {
  if (!schema.properties || Object.keys(schema.properties).length === 0) {
    return 'None';
  }
  const props = Object.entries(schema.properties).map(([key, val]) => {
    const v = val as {
      type?: string;
      description?: string;
      enum?: string[];
      items?: Record<string, unknown>;
    };
    const type = v.type || 'any';
    let desc = v.description || '';
    if (v.enum) {
      const enumVals = v.enum.join('|');
      desc = desc ? `${desc} (${enumVals})` : `(${enumVals})`;
    }
    if (v.items && v.items.type) {
      const itemType = (v.items as { type?: string }).type || 'any';
      desc = desc ? `${desc} [${itemType}]` : `[${itemType}]`;
    }
    const required = schema.required?.includes(key) ? '**required**' : 'optional';
    return `  - \`${key}\`: \`${type}\` — ${desc} _(${required})_`;
  });
  return props.join('\n');
}

/**
 * Generate complete Markdown documentation for all registered tools.
 * Tools are grouped by category, with a table per category listing each
 * tool's name, description, and parameter schema.
 */
export function generateDocs(): string {
  const schemas = toolSchemas();
  const entries: DocEntry[] = schemas.map((s) => ({
    name: s.name,
    description: s.description.split('.')[0], // First sentence only
    parameters: formatParameters(
      s.input_schema as {
        type?: string;
        properties?: Record<string, unknown>;
        required?: string[];
      },
    ),
    category: inferCategory(s.name),
  }));

  // Group by category, preserving insertion order
  const grouped: Record<string, DocEntry[]> = {};
  const categoryOrder: string[] = [];
  for (const e of entries) {
    if (!grouped[e.category]) {
      grouped[e.category] = [];
      categoryOrder.push(e.category);
    }
    grouped[e.category].push(e);
  }

  let md = '# Tool Reference\n\n';
  md += `_Auto-generated from tool schemas. ${schemas.length} tools total._\n\n`;
  md += '## Table of Contents\n\n';
  for (const cat of categoryOrder) {
    const anchor = cat.toLowerCase().replace(/\s+/g, '-');
    md += `- [${cat}](#${anchor})\n`;
  }
  md += '\n---\n\n';

  for (const cat of categoryOrder) {
    const tools = grouped[cat];
    md += `## ${cat}\n\n`;
    md += '| Tool | Description | Parameters |\n';
    md += '|------|-------------|------------|\n';
    for (const t of tools) {
      const paramHtml = t.parameters.replace(/\n/g, '<br>');
      md += `| **${t.name}** | ${t.description} | ${paramHtml} |\n`;
    }
    md += '\n';
  }

  return md;
}

// CLI entry: when run directly (node dist/tools/auto-docs.js > TOOLS.md)
// or via tsx (npx tsx src/tools/auto-docs.ts)
const scriptPath = process.argv[1] || '';
if (scriptPath.includes('auto-docs')) {
  console.log(generateDocs());
}
