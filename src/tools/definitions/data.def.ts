import type { ToolDefinition } from '../../types.js';
import {
  executeJsonParse,
  executeJsonWrite,
  executeJsonQuery,
  executeYamlParse,
  executeYamlWrite,
  executeConvert,
  executeCsvParse,
  executeCsvWrite,
  executeXmlParse,
  executeXmlWrite,
} from '../DataTool.js';

export const definitions: ToolDefinition[] = [
  {
    name: 'JsonParse',
    description: 'Parse JSON from a file or string and return formatted output.',
    parameters: {
      type: 'object',
      properties: {
        input: { type: 'string', description: 'File path or JSON string to parse' },
        isFile: { type: 'boolean', description: 'Whether input is a file path (default: true)' },
      },
      required: ['input'],
    },
    execute: async (args) => {
      const input = String(args['input'] ?? '');
      const isFile = args['isFile'] !== false;
      return executeJsonParse(input, isFile);
    },
  },
  {
    name: 'JsonWrite',
    description: 'Write JSON data to a file with optional pretty formatting.',
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Output file path' },
        data: { type: 'string', description: 'JSON data to write (as string or object)' },
        pretty: { type: 'boolean', description: 'Pretty-print with indentation (default: true)' },
      },
      required: ['filePath', 'data'],
    },
    execute: async (args) => {
      const filePath = String(args['filePath'] ?? '');
      const data = String(args['data'] ?? '');
      const pretty = args['pretty'] !== false;
      return executeJsonWrite(filePath, data, pretty);
    },
  },
  {
    name: 'JsonQuery',
    description: 'Query JSON using dot notation (e.g., "users[0].name" or "config.database.host").',
    parameters: {
      type: 'object',
      properties: {
        input: { type: 'string', description: 'File path or JSON string' },
        query: { type: 'string', description: 'Dot notation query path' },
        isFile: { type: 'boolean', description: 'Whether input is a file path (default: true)' },
      },
      required: ['input', 'query'],
    },
    execute: async (args) => {
      const input = String(args['input'] ?? '');
      const query = String(args['query'] ?? '');
      const isFile = args['isFile'] !== false;
      return executeJsonQuery(input, query, isFile);
    },
  },
  {
    name: 'YamlParse',
    description: 'Parse YAML from a file or string and return as JSON.',
    parameters: {
      type: 'object',
      properties: {
        input: { type: 'string', description: 'File path or YAML string to parse' },
        isFile: { type: 'boolean', description: 'Whether input is a file path (default: true)' },
      },
      required: ['input'],
    },
    execute: async (args) => {
      const input = String(args['input'] ?? '');
      const isFile = args['isFile'] !== false;
      return executeYamlParse(input, isFile);
    },
  },
  {
    name: 'YamlWrite',
    description: 'Write data to a YAML file. Input must be valid JSON.',
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Output file path' },
        data: { type: 'string', description: 'JSON data to convert to YAML' },
      },
      required: ['filePath', 'data'],
    },
    execute: async (args) => {
      const filePath = String(args['filePath'] ?? '');
      const data = String(args['data'] ?? '');
      return executeYamlWrite(filePath, data);
    },
  },
  {
    name: 'Convert',
    description: 'Convert between JSON and YAML formats.',
    parameters: {
      type: 'object',
      properties: {
        input: { type: 'string', description: 'File path or data string' },
        fromFormat: { type: 'string', enum: ['json', 'yaml'], description: 'Source format' },
        toFormat: { type: 'string', enum: ['json', 'yaml'], description: 'Target format' },
        isFile: { type: 'boolean', description: 'Whether input is a file path (default: true)' },
      },
      required: ['input', 'fromFormat', 'toFormat'],
    },
    execute: async (args) => {
      const input = String(args['input'] ?? '');
      const fromFormat = String(args['fromFormat'] ?? '') as 'json' | 'yaml';
      const toFormat = String(args['toFormat'] ?? '') as 'json' | 'yaml';
      const isFile = args['isFile'] !== false;
      return executeConvert(input, fromFormat, toFormat, isFile);
    },
  },
  {
    name: 'CsvParse',
    description: 'Parse CSV from a file or string and return as JSON array.',
    parameters: {
      type: 'object',
      properties: {
        input: { type: 'string', description: 'File path or CSV string to parse' },
        isFile: { type: 'boolean', description: 'Whether input is a file path (default: true)' },
        hasHeader: { type: 'boolean', description: 'First row is header (default: true)' },
        delimiter: { type: 'string', description: 'Field delimiter (default: ",")' },
      },
      required: ['input'],
    },
    execute: async (args) => {
      const input = String(args['input'] ?? '');
      const isFile = args['isFile'] !== false;
      const hasHeader = args['hasHeader'] !== false;
      const delimiter = args['delimiter'] ? String(args['delimiter']) : ',';
      return executeCsvParse(input, isFile, hasHeader, delimiter);
    },
  },
  {
    name: 'CsvWrite',
    description: 'Write JSON array to a CSV file.',
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Output file path' },
        data: { type: 'string', description: 'JSON array data' },
        hasHeader: { type: 'boolean', description: 'Include header row (default: true)' },
        delimiter: { type: 'string', description: 'Field delimiter (default: ",")' },
      },
      required: ['filePath', 'data'],
    },
    execute: async (args) => {
      const filePath = String(args['filePath'] ?? '');
      const data = String(args['data'] ?? '');
      const hasHeader = args['hasHeader'] !== false;
      const delimiter = args['delimiter'] ? String(args['delimiter']) : ',';
      return executeCsvWrite(filePath, data, hasHeader, delimiter);
    },
  },
  {
    name: 'XmlParse',
    description: 'Parse XML from a file or string and return as JSON.',
    parameters: {
      type: 'object',
      properties: {
        input: { type: 'string', description: 'File path or XML string to parse' },
        isFile: { type: 'boolean', description: 'Whether input is a file path (default: true)' },
      },
      required: ['input'],
    },
    execute: async (args) => {
      const input = String(args['input'] ?? '');
      const isFile = args['isFile'] !== false;
      return executeXmlParse(input, isFile);
    },
  },
  {
    name: 'XmlWrite',
    description: 'Write JSON data to an XML file.',
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Output file path' },
        data: { type: 'string', description: 'JSON data to convert to XML' },
      },
      required: ['filePath', 'data'],
    },
    execute: async (args) => {
      const filePath = String(args['filePath'] ?? '');
      const data = String(args['data'] ?? '');
      return executeXmlWrite(filePath, data);
    },
  },
];
