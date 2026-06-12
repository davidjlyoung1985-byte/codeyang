import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';

const TEST_DIR = '.test-task-store';

vi.mock('node:os', () => ({ homedir: () => '.test-task-store' }));

import { createTask, getTask, updateTask, listTasks, deleteTask } from './taskStore.js';

describe('taskStore', () => {
  beforeEach(() => {
    if (!existsSync(TEST_DIR)) mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('creates a task with defaults', async () => {
    const task = await createTask({ title: 'Test' });
    expect(task.id).toBeTruthy();
    expect(task.title).toBe('Test');
    expect(task.status).toBe('pending');
  });

  it('creates with priority', async () => {
    const t = await createTask({ title: 'Hi', priority: 'high' });
    expect(t.priority).toBe('high');
  });

  it('gets task by id', async () => {
    const c = await createTask({ title: 'Find' });
    expect((await getTask(c.id))!.title).toBe('Find');
  });

  it('returns null for missing', async () => {
    expect(await getTask('x')).toBeNull();
  });

  it('updates status', async () => {
    const c = await createTask({ title: 'Up' });
    const u = await updateTask(c.id, { status: 'in_progress', progress: 50 });
    expect(u!.status).toBe('in_progress');
    expect(u!.progress).toBe(50);
  });

  it('lists recent first', async () => {
    const t1 = await createTask({ title: 'A' });
    await new Promise((r) => setTimeout(r, 10));
    const t2 = await createTask({ title: 'B' });
    const list = await listTasks();
    expect(list[0].id).toBe(t2.id);
  });

  it('filters by status', async () => {
    const c = await createTask({ title: 'Done' });
    await updateTask(c.id, { status: 'completed' });
    expect((await listTasks({ status: 'completed' })).length).toBe(1);
  });

  it('searches by keyword', async () => {
    await createTask({ title: 'Fix bug' });
    await createTask({ title: 'Add feature' });
    expect((await listTasks({ search: 'bug' })).length).toBe(1);
  });

  it('deletes task', async () => {
    const c = await createTask({ title: 'Del' });
    expect(await deleteTask(c.id)).toBe(true);
    expect(await getTask(c.id)).toBeNull();
  });
});
