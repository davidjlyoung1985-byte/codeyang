import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { existsSync } from 'node:fs';
import YAML from 'yaml';
import { resolveSafePath } from './shared.js';
import { parse as csvParse } from 'csv-parse/sync';
import { stringify as csvStringify } from 'csv-stringify/sync';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';

/**
 * Parse JSON from a file or string
 */
export async function executeJsonParse(input: string, isFile = true): Promise<string> {
  try {
    let jsonText: string;

    if (isFile) {
      const filePath = resolveSafePath(input);
      if (!existsSync(filePath)) {
        return `Error: File does not exist: ${input}`;
      }
      jsonText = await fs.readFile(filePath, 'utf-8');
    } else {
      jsonText = input;
    }

    const parsed = JSON.parse(jsonText);
    return JSON.stringify(parsed, null, 2);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Error parsing JSON: ${msg}`;
  }
}

/**
 * Write JSON to a file
 */
export async function executeJsonWrite(filePath: string, data: string, pretty = true): Promise<string> {
  try {
    const absPath = resolveSafePath(filePath);
    let parsed: unknown;

    // Try to parse data as JSON
    try {
      parsed = JSON.parse(data);
    } catch {
      // If it's not valid JSON string, treat it as raw data
      parsed = data;
    }

    const output = pretty ? JSON.stringify(parsed, null, 2) : JSON.stringify(parsed);

    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, output, 'utf-8');

    return `JSON written to: ${filePath} (${output.length} bytes)`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Error writing JSON to ${filePath}: ${msg}`;
  }
}

/**
 * Query JSON using JSONPath-like dot notation
 */
export async function executeJsonQuery(input: string, query: string, isFile = true): Promise<string> {
  try {
    let jsonText: string;

    if (isFile) {
      const filePath = resolveSafePath(input);
      if (!existsSync(filePath)) {
        return `Error: File does not exist: ${input}`;
      }
      jsonText = await fs.readFile(filePath, 'utf-8');
    } else {
      jsonText = input;
    }

    const parsed = JSON.parse(jsonText);

    // Simple dot notation query (e.g., "users[0].name" or "config.database.host")
    const result = queryObject(parsed, query);

    if (result === undefined) {
      return `Query '${query}' returned no results`;
    }

    return typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Error querying JSON: ${msg}`;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function queryObject(obj: any, path: string): unknown {
  const parts = path.split('.').flatMap((part) => {
    // Handle array notation like "items[0]"
    const match = part.match(/^([^[]+)\[(\d+)\]$/);
    if (match) {
      return [match[1], parseInt(match[2], 10)];
    }
    return part;
  });

  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

/**
 * Parse YAML from a file or string
 */
export async function executeYamlParse(input: string, isFile = true): Promise<string> {
  try {
    let yamlText: string;

    if (isFile) {
      const filePath = resolveSafePath(input);
      if (!existsSync(filePath)) {
        return `Error: File does not exist: ${input}`;
      }
      yamlText = await fs.readFile(filePath, 'utf-8');
    } else {
      yamlText = input;
    }

    const parsed = YAML.parse(yamlText);
    return JSON.stringify(parsed, null, 2);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Error parsing YAML: ${msg}`;
  }
}

/**
 * Write YAML to a file
 */
export async function executeYamlWrite(filePath: string, data: string): Promise<string> {
  try {
    const absPath = resolveSafePath(filePath);
    let parsed: unknown;

    // Try to parse data as JSON
    try {
      parsed = JSON.parse(data);
    } catch {
      return `Error: Input data must be valid JSON`;
    }

    const yamlOutput = YAML.stringify(parsed);

    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, yamlOutput, 'utf-8');

    return `YAML written to: ${filePath} (${yamlOutput.length} bytes)`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Error writing YAML to ${filePath}: ${msg}`;
  }
}

/**
 * Convert between JSON and YAML
 */
export async function executeConvert(
  input: string,
  fromFormat: 'json' | 'yaml',
  toFormat: 'json' | 'yaml',
  isFile = true,
): Promise<string> {
  try {
    if (fromFormat === toFormat) {
      return `Error: Source and target formats are the same: ${fromFormat}`;
    }

    let inputText: string;

    if (isFile) {
      const filePath = resolveSafePath(input);
      if (!existsSync(filePath)) {
        return `Error: File does not exist: ${input}`;
      }
      inputText = await fs.readFile(filePath, 'utf-8');
    } else {
      inputText = input;
    }

    let parsed: unknown;

    if (fromFormat === 'json') {
      parsed = JSON.parse(inputText);
    } else {
      parsed = YAML.parse(inputText);
    }

    let output: string;

    if (toFormat === 'json') {
      output = JSON.stringify(parsed, null, 2);
    } else {
      output = YAML.stringify(parsed);
    }

    return output;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Error converting ${fromFormat} to ${toFormat}: ${msg}`;
  }
}

/**
 * Parse CSV from a file or string
 */
export async function executeCsvParse(
  input: string,
  isFile = true,
  hasHeader = true,
  delimiter = ',',
): Promise<string> {
  try {
    let csvText: string;

    if (isFile) {
      const filePath = resolveSafePath(input);
      if (!existsSync(filePath)) {
        return `Error: File does not exist: ${input}`;
      }
      csvText = await fs.readFile(filePath, 'utf-8');
    } else {
      csvText = input;
    }

    const records = csvParse(csvText, {
      columns: hasHeader,
      skip_empty_lines: true,
      delimiter,
    });

    return JSON.stringify(records, null, 2);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Error parsing CSV: ${msg}`;
  }
}

/**
 * Write CSV to a file
 */
export async function executeCsvWrite(
  filePath: string,
  data: string,
  hasHeader = true,
  delimiter = ',',
): Promise<string> {
  try {
    const absPath = resolveSafePath(filePath);
    let parsed: unknown[];

    // Parse input as JSON array
    try {
      parsed = JSON.parse(data);
    } catch {
      return `Error: Input data must be valid JSON array`;
    }

    if (!Array.isArray(parsed)) {
      return `Error: Input data must be an array`;
    }

    if (parsed.length === 0) {
      return `Error: Input array is empty`;
    }

    const csvOutput = csvStringify(parsed, {
      header: hasHeader,
      delimiter,
    });

    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, csvOutput, 'utf-8');

    return `CSV written to: ${filePath} (${parsed.length} rows, ${csvOutput.length} bytes)`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Error writing CSV to ${filePath}: ${msg}`;
  }
}

/**
 * Parse XML from a file or string
 */
export async function executeXmlParse(input: string, isFile = true): Promise<string> {
  try {
    let xmlText: string;

    if (isFile) {
      const filePath = resolveSafePath(input);
      if (!existsSync(filePath)) {
        return `Error: File does not exist: ${input}`;
      }
      xmlText = await fs.readFile(filePath, 'utf-8');
    } else {
      xmlText = input;
    }

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
    });

    const parsed = parser.parse(xmlText);
    return JSON.stringify(parsed, null, 2);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Error parsing XML: ${msg}`;
  }
}

/**
 * Write XML to a file
 */
export async function executeXmlWrite(filePath: string, data: string): Promise<string> {
  try {
    const absPath = resolveSafePath(filePath);
    let parsed: unknown;

    // Parse input as JSON
    try {
      parsed = JSON.parse(data);
    } catch {
      return `Error: Input data must be valid JSON`;
    }

    const builder = new XMLBuilder({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      format: true,
    });

    const xmlOutput = builder.build(parsed);

    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, xmlOutput, 'utf-8');

    return `XML written to: ${filePath} (${xmlOutput.length} bytes)`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Error writing XML to ${filePath}: ${msg}`;
  }
}
