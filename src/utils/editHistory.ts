interface EditEntry {
  filePath: string;
  previousContent: string;
  timestamp: number;
}

class EditHistory {
  private stack: EditEntry[] = [];
  private redoStack: EditEntry[] = [];
  private readonly MAX_HISTORY = 50;
  private readonly MAX_TOTAL_BYTES = 10 * 1024 * 1024; // 10 MB total cap

  push(filePath: string, previousContent: string): void {
    this.stack.push({ filePath, previousContent, timestamp: Date.now() });
    this.redoStack = []; // Clear redo on new edit

    // Enforce both count and total size limits
    if (this.stack.length > this.MAX_HISTORY) {
      this.stack.shift();
    }
    // If total content exceeds the cap, discard oldest entries
    while (this.totalBytes() > this.MAX_TOTAL_BYTES && this.stack.length > 1) {
      this.stack.shift();
    }
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

  private totalBytes(): number {
    let total = 0;
    for (const e of this.stack) {
      total += e.previousContent.length;
    }
    return total;
  }

  get canUndo(): boolean {
    return this.stack.length > 0;
  }
  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }
}

export const editHistory = new EditHistory();
