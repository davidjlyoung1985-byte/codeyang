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
import { requiredString, optionalString, optionalBoolean } from '../validate.js';

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
      const input = requiredString(args, 'input');
      const isFile = optionalBoolean(args, 'isFile', true) ?? true;
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
      const filePath = requiredString(args, 'filePath');
      const data = requiredString(args, 'data');
      const pretty = optionalBoolean(args, 'pretty', true) ?? true;
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
      const input = requiredString(args, 'input');
      const query = requiredString(args, 'query');
      const isFile = optionalBoolean(args, 'isFile', true) ?? true;
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
      const input = requiredString(args, 'input');
      const isFile = optionalBoolean(args, 'isFile', true) ?? true;
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
      const filePath = requiredString(args, 'filePath');
      const data = requiredString(args, 'data');
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
      const input = requiredString(args, 'input');
      const fromFormat = requiredString(args, 'fromFormat');
      const toFormat = requiredString(args, 'toFormat');
      const isFile = optionalBoolean(args, 'isFile', true) ?? true;
      return executeConvert(input, fromFormat as 'json' | 'yaml', toFormat as 'json' | 'yaml', isFile);
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
      const input = requiredString(args, 'input');
      const isFile = optionalBoolean(args, 'isFile', true) ?? true;
      const hasHeader = optionalBoolean(args, 'hasHeader', true) ?? true;
      const delimiter = optionalString(args, 'delimiter', ',') ?? ',';
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
      const filePath = requiredString(args, 'filePath');
      const data = requiredString(args, 'data');
      const hasHeader = optionalBoolean(args, 'hasHeader', true) ?? true;
      const delimiter = optionalString(args, 'delimiter', ',') ?? ',';
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
      const input = requiredString(args, 'input');
      const isFile = optionalBoolean(args, 'isFile', true) ?? true;
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
      const filePath = requiredString(args, 'filePath');
      const data = requiredString(args, 'data');
      return executeXmlWrite(filePath, data);
    },
  },
];
