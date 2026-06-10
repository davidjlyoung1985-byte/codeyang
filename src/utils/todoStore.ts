import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

const DIR = join(homedir(), '.codeyang');
const FILE = join(DIR, 'todos.json');

export interface TodoItem {
  content: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'high' | 'medium' | 'low';
  createdAt: string;
  updatedAt: string;
}

export async function saveTodos(todos: TodoItem[]): Promise<void> {
  await mkdir(DIR, { recursive: true });
  await writeFile(FILE, JSON.stringify(todos, null, 2));
}

export async function loadTodos(): Promise<TodoItem[]> {
  try {
    return JSON.parse(await readFile(FILE, 'utf-8'));
  } catch {
    return [];
  }
}

export async function clearTodos(): Promise<void> {
  await saveTodos([]);
}
