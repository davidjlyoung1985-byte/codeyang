import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { existsSync } from 'node:fs';
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
} from './DataTool.js';

const TEST_DIR = path.join(process.cwd(), '.test-data-tools');

describe('DataTool', () => {
  beforeEach(async () => {
    if (existsSync(TEST_DIR)) {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    }
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    if (existsSync(TEST_DIR)) {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe('JSON operations', () => {
    it('should parse JSON from file', async () => {
      const file = path.join(TEST_DIR, 'test.json');
      const data = { name: 'test', value: 123 };
      await fs.writeFile(file, JSON.stringify(data));

      const result = await executeJsonParse(file, true);

      expect(result).toContain('"name"');
      expect(result).toContain('"test"');
      expect(result).toContain('123');
    });

    it('should parse JSON from string', async () => {
      const jsonString = '{"key":"value"}';

      const result = await executeJsonParse(jsonString, false);

      expect(result).toContain('"key"');
      expect(result).toContain('"value"');
    });

    it('should write JSON to file', async () => {
      const file = path.join(TEST_DIR, 'output.json');
      const data = JSON.stringify({ foo: 'bar', num: 42 });

      const result = await executeJsonWrite(file, data, true);

      expect(result).toContain('JSON written');
      expect(existsSync(file)).toBe(true);

      const content = await fs.readFile(file, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.foo).toBe('bar');
      expect(parsed.num).toBe(42);
    });

    it('should query JSON with dot notation', async () => {
      const file = path.join(TEST_DIR, 'data.json');
      const data = {
        users: [
          { name: 'Alice', age: 30 },
          { name: 'Bob', age: 25 },
        ],
        config: { host: 'localhost', port: 8080 },
      };
      await fs.writeFile(file, JSON.stringify(data));

      const result1 = await executeJsonQuery(file, 'users[0].name', true);
      expect(result1).toBe('Alice');

      const result2 = await executeJsonQuery(file, 'config.port', true);
      expect(result2).toBe('8080');

      const result3 = await executeJsonQuery(file, 'users[1]', true);
      expect(result3).toContain('"name"');
      expect(result3).toContain('"Bob"');
    });

    it('should handle invalid JSON', async () => {
      const result = await executeJsonParse('{invalid json}', false);

      expect(result).toContain('Error');
    });
  });

  describe('YAML operations', () => {
    it('should parse YAML from file', async () => {
      const file = path.join(TEST_DIR, 'test.yaml');
      const yamlContent = 'name: test\nvalue: 123\nitems:\n  - one\n  - two\n';
      await fs.writeFile(file, yamlContent);

      const result = await executeYamlParse(file, true);

      expect(result).toContain('"name"');
      expect(result).toContain('"test"');
      expect(result).toContain('"items"');
    });

    it('should parse YAML from string', async () => {
      const yamlString = 'key: value\ncount: 5';

      const result = await executeYamlParse(yamlString, false);

      expect(result).toContain('"key"');
      expect(result).toContain('"value"');
      expect(result).toContain('5');
    });

    it('should write YAML to file', async () => {
      const file = path.join(TEST_DIR, 'output.yaml');
      const data = JSON.stringify({ name: 'test', items: ['a', 'b', 'c'] });

      const result = await executeYamlWrite(file, data);

      expect(result).toContain('YAML written');
      expect(existsSync(file)).toBe(true);

      const content = await fs.readFile(file, 'utf-8');
      expect(content).toContain('name: test');
      expect(content).toContain('items:');
    });
  });

  describe('Format conversion', () => {
    it('should convert JSON to YAML', async () => {
      const file = path.join(TEST_DIR, 'data.json');
      const data = { name: 'test', value: 123 };
      await fs.writeFile(file, JSON.stringify(data));

      const result = await executeConvert(file, 'json', 'yaml', true);

      expect(result).toContain('name: test');
      expect(result).toContain('value: 123');
    });

    it('should convert YAML to JSON', async () => {
      const file = path.join(TEST_DIR, 'data.yaml');
      const yamlContent = 'name: test\nvalue: 123\n';
      await fs.writeFile(file, yamlContent);

      const result = await executeConvert(file, 'yaml', 'json', true);

      expect(result).toContain('"name"');
      expect(result).toContain('"test"');
      expect(result).toContain('123');
    });

    it('should convert from string input', async () => {
      const jsonString = '{"key":"value"}';

      const result = await executeConvert(jsonString, 'json', 'yaml', false);

      expect(result).toContain('key: value');
    });

    it('should fail when formats are the same', async () => {
      const result = await executeConvert('{}', 'json', 'json', false);

      expect(result).toContain('Error');
      expect(result).toContain('same');
    });
  });

  describe('CSV operations', () => {
    it('should parse CSV with header', async () => {
      const file = path.join(TEST_DIR, 'data.csv');
      const csvContent = 'name,age,city\nAlice,30,NYC\nBob,25,LA\n';
      await fs.writeFile(file, csvContent);

      const result = await executeCsvParse(file, true, true, ',');

      expect(result).toContain('"name"');
      expect(result).toContain('"Alice"');
      expect(result).toContain('"age"');
      expect(result).toContain('"30"');
    });

    it('should parse CSV without header', async () => {
      const file = path.join(TEST_DIR, 'data.csv');
      const csvContent = 'Alice,30,NYC\nBob,25,LA\n';
      await fs.writeFile(file, csvContent);

      const result = await executeCsvParse(file, true, false, ',');

      expect(result).toContain('Alice');
      expect(result).toContain('30');
      expect(result).toContain('Bob');
    });

    it('should parse CSV with custom delimiter', async () => {
      const file = path.join(TEST_DIR, 'data.csv');
      const csvContent = 'name;age;city\nAlice;30;NYC\n';
      await fs.writeFile(file, csvContent);

      const result = await executeCsvParse(file, true, true, ';');

      expect(result).toContain('"name"');
      expect(result).toContain('"Alice"');
    });

    it('should write CSV from JSON array', async () => {
      const file = path.join(TEST_DIR, 'output.csv');
      const data = JSON.stringify([
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
      ]);

      const result = await executeCsvWrite(file, data, true, ',');

      expect(result).toContain('CSV written');
      expect(result).toContain('2 rows');
      expect(existsSync(file)).toBe(true);

      const content = await fs.readFile(file, 'utf-8');
      expect(content).toContain('name,age');
      expect(content).toContain('Alice,30');
      expect(content).toContain('Bob,25');
    });

    it('should write CSV without header', async () => {
      const file = path.join(TEST_DIR, 'output.csv');
      const data = JSON.stringify([
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
      ]);

      await executeCsvWrite(file, data, false, ',');

      const content = await fs.readFile(file, 'utf-8');
      expect(content).not.toContain('name,age');
      expect(content).toContain('Alice,30');
    });

    it('should fail on non-array input', async () => {
      const file = path.join(TEST_DIR, 'output.csv');
      const data = JSON.stringify({ not: 'array' });

      const result = await executeCsvWrite(file, data, true, ',');

      expect(result).toContain('Error');
      expect(result).toContain('array');
    });
  });

  describe('XML operations', () => {
    it('should parse XML from file', async () => {
      const file = path.join(TEST_DIR, 'data.xml');
      const xmlContent = '<root><name>test</name><value>123</value></root>';
      await fs.writeFile(file, xmlContent);

      const result = await executeXmlParse(file, true);

      expect(result).toContain('"root"');
      expect(result).toContain('"name"');
      expect(result).toContain('"test"');
    });

    it('should parse XML from string', async () => {
      const xmlString = '<data><key>value</key></data>';

      const result = await executeXmlParse(xmlString, false);

      expect(result).toContain('"data"');
      expect(result).toContain('"key"');
      expect(result).toContain('"value"');
    });

    it('should parse XML with attributes', async () => {
      const xmlString = '<root id="123"><item type="test">value</item></root>';

      const result = await executeXmlParse(xmlString, false);

      expect(result).toContain('"@_id"');
      expect(result).toContain('"123"');
      expect(result).toContain('"@_type"');
      expect(result).toContain('"test"');
    });

    it('should write XML to file', async () => {
      const file = path.join(TEST_DIR, 'output.xml');
      const data = JSON.stringify({
        root: {
          name: 'test',
          value: 123,
        },
      });

      const result = await executeXmlWrite(file, data);

      expect(result).toContain('XML written');
      expect(existsSync(file)).toBe(true);

      const content = await fs.readFile(file, 'utf-8');
      expect(content).toContain('<root>');
      expect(content).toContain('<name>test</name>');
      expect(content).toContain('<value>123</value>');
    });

    it('should write XML with attributes', async () => {
      const file = path.join(TEST_DIR, 'output.xml');
      const data = JSON.stringify({
        root: {
          '@_id': '123',
          name: 'test',
        },
      });

      await executeXmlWrite(file, data);

      const content = await fs.readFile(file, 'utf-8');
      expect(content).toContain('id="123"');
    });
  });
});
