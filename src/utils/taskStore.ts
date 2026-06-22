/**
 * Task V2 — persistent task store with CRUD operations.
 * Tasks stored as individual JSON files in ~/.codeyang/tasks/.
 */
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import crypto from 'node:crypto';

const TASKS_DIR = join(homedir(), '.codeyang', 'tasks');
const INDEX_FILE = join(TASKS_DIR, 'index.json');

export interface Task {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'critical';
  progress: number;
  tags: string[];
  dependencies: string[];
  output: string;
  createdAt: string;
  updatedAt: string;
}

type TaskMeta = Pick<Task, 'id' | 'title' | 'status' | 'priority' | 'updatedAt'>;

async function ensureDir() {
  await mkdir(TASKS_DIR, { recursive: true });
}

async function readIndex(): Promise<Record<string, TaskMeta>> {
  try {
    return JSON.parse(await readFile(INDEX_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

async function writeIndex(index: Record<string, TaskMeta>): Promise<void> {
  await mkdir(TASKS_DIR, { recursive: true });
  await writeFile(INDEX_FILE, JSON.stringify(index), 'utf-8');
}

export async function createTask(params: {
  title: string;
  description?: string;
  priority?: Task['priority'];
  tags?: string[];
  dependencies?: string[];
}): Promise<Task> {
  await ensureDir();
  const now = new Date().toISOString();
  const task: Task = {
    id: `tsk_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 6)}`,
    title: params.title,
    description: params.description || '',
    status: 'pending',
    priority: params.priority || 'medium',
    progress: 0,
    tags: params.tags || [],
    dependencies: params.dependencies || [],
    output: '',
    createdAt: now,
    updatedAt: now,
  };

  await writeFile(join(TASKS_DIR, `${task.id}.json`), JSON.stringify(task, null, 2));

  const index = await readIndex();
  index[task.id] = { id: task.id, title: task.title, status: task.status, priority: task.priority, updatedAt: now };
  await writeIndex(index);

  return task;
}

export async function getTask(id: string): Promise<Task | null> {
  try {
    return JSON.parse(await readFile(join(TASKS_DIR, `${id}.json`), 'utf-8'));
  } catch {
    return null;
  }
}

export async function updateTask(
  id: string,
  updates: Partial<
    Pick<Task, 'title' | 'description' | 'status' | 'priority' | 'progress' | 'tags' | 'dependencies' | 'output'>
  >,
): Promise<Task | null> {
  const task = await getTask(id);
  if (!task) return null;

  const now = new Date().toISOString();
  Object.assign(task, updates, { updatedAt: now });

  await writeFile(join(TASKS_DIR, `${id}.json`), JSON.stringify(task, null, 2));

  const index = await readIndex();
  index[id] = { id: task.id, title: task.title, status: task.status, priority: task.priority, updatedAt: now };
  await writeIndex(index);

  return task;
}

export async function listTasks(filter?: {
  status?: Task['status'];
  priority?: Task['priority'];
  tags?: string[];
  search?: string;
}): Promise<TaskMeta[]> {
  await ensureDir();
  const index = await readIndex();
  let entries = Object.values(index);

  if (filter?.status) entries = entries.filter((t) => t.status === filter.status);
  if (filter?.priority) entries = entries.filter((t) => t.priority === filter.priority);

  if (filter?.search) {
    const kw = filter.search.toLowerCase();
    // Filter by title first (cheap), then load full tasks for content match
    const titleMatches = entries.filter((t) => t.title.toLowerCase().includes(kw));
    const contentMatches: TaskMeta[] = [];
    for (const meta of entries) {
      if (titleMatches.find((t) => t.id === meta.id)) continue;
      try {
        const full = await getTask(meta.id);
        if (full && full.description.toLowerCase().includes(kw)) {
          contentMatches.push(meta);
        }
      } catch {
        /* skip */
      }
    }
    entries = [...titleMatches, ...contentMatches];
  }

  if (filter?.tags && filter.tags.length > 0) {
    const filtered: TaskMeta[] = [];
    for (const meta of entries) {
      try {
        const full = await getTask(meta.id);
        if (full && filter.tags!.some((t) => full.tags.includes(t))) {
          filtered.push(meta);
        }
      } catch {
        /* skip */
      }
    }
    entries = filtered;
  }

  return entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function deleteTask(id: string): Promise<boolean> {
  try {
    await unlink(join(TASKS_DIR, `${id}.json`));
    const index = await readIndex();
    delete index[id];
    await writeIndex(index);
    return true;
  } catch {
    return false;
  }
}
