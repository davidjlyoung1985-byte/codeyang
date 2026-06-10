interface EditEntry {
  filePath: string;
  previousContent: string;
  timestamp: number;
}

class EditHistory {
  private stack: EditEntry[] = [];
  private redoStack: EditEntry[] = [];
  private readonly MAX_HISTORY = 50;

  push(filePath: string, previousContent: string): void {
    this.stack.push({ filePath, previousContent, timestamp: Date.now() });
    if (this.stack.length > this.MAX_HISTORY) this.stack.shift();
    this.redoStack = []; // Clear redo on new edit
  }

  undo(): EditEntry | null {
    const entry = this.stack.pop();
    if (entry) this.redoStack.push(entry);
    return entry ?? null;
  }

  redo(): EditEntry | null {
    const entry = this.redoStack.pop();
    if (entry) this.stack.push(entry);
    return entry ?? null;
  }

  clear(): void {
    this.stack = [];
    this.redoStack = [];
  }

  get canUndo(): boolean {
    return this.stack.length > 0;
  }
  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }
}

export const editHistory = new EditHistory();
