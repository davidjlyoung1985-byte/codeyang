# Agent.run() Refactoring Plan

## Current Issues
- Method is 330+ lines long
- Multiple responsibilities in one method
- Hard to test individual components
- Poor separation of concerns

## Proposed Refactoring

### 1. Extract Message Preparation
```typescript
private async prepareMessages(prompt: string): Promise<LLMMessage[]> {
  const messages = jsonClone(this.conversationManager.getHistory());
  
  const isComplex = this.isComplexPrompt(prompt);
  const userMsg = isComplex 
    ? this.formatComplexPrompt(prompt)
    : prompt;
    
  messages.push({ role: 'user', content: userMsg });
  
  return messages;
}

private isComplexPrompt(prompt: string): boolean {
  return prompt.length > 200 
    || (prompt.match(/[。；;.!?？]/g) || []).length >= 2 
    || prompt.includes('\n');
}
```

### 2. Extract Context Summarization
```typescript
private async handleContextSummarization(messages: LLMMessage[]): Promise<void> {
  // Rule-based summarization
  const summarized = this.ctxManager.summarizeContext(messages);
  if (summarized !== messages) {
    messages.length = 0;
    messages.push(...summarized);
  }
  
  // LLM-based summarization for large contexts
  if (messages.length > 400) {
    await this.llmSummarizeIfNeeded(messages);
  }
  
  this.validateMessages(messages);
}
```

### 3. Extract Planning Phase
```typescript
private async handlePlanningPhase(prompt: string, messages: LLMMessage[]): Promise<string | null> {
  // Tree-of-Thoughts
  if (this.treeOfThoughts.shouldUseToT(prompt)) {
    await this.executeTreeOfThoughts(prompt, messages);
  }
  
  // Planner
  if (config.planner.enabled && this.planner.shouldPlan(prompt)) {
    return await this.executePlanner(prompt, messages);
  }
  
  return null;
}
```

### 4. Extract Main Loop
```typescript
private async executeMainLoop(
  messages: LLMMessage[],
  traceId: string,
  currentPlanId: string | null
): Promise<void> {
  const maxTurns = config.maxTurns;
  
  for (let turn = 0; turn < maxTurns; turn++) {
    const result = await this.executeTurn(messages, traceId, turn);
    
    if (result.shouldBreak) {
      break;
    }
    
    if (result.planProgress) {
      currentPlanId = await this.handlePlanProgress(currentPlanId, result.planProgress);
    }
  }
}
```

### 5. Extract Turn Execution
```typescript
private async executeTurn(
  messages: LLMMessage[],
  traceId: string,
  turnIndex: number
): Promise<TurnResult> {
  logger.debug(`[turn ${turnIndex}] messages count: ${messages.length}`);
  
  this.ctxManager.truncateIfNeeded(messages, config.maxTokens);
  
  const systemPrompt = await this.ctxManager.getSystemPrompt(this.qtContext);
  const streamResult = await this.callLLM(systemPrompt, messages, traceId);
  
  // Handle response
  const { toolCalls, assistantText } = streamResult;
  
  // Check for repetition
  if (this.detectRepetition(assistantText, messages, toolCalls)) {
    return { shouldBreak: true };
  }
  
  // Execute tools
  if (toolCalls.length > 0) {
    await this.executeTools(toolCalls, messages, traceId);
  } else {
    return { shouldBreak: true };
  }
  
  return { shouldBreak: false };
}
```

### 6. Refactored run() Method
```typescript
async run(prompt: string): Promise<void> {
  // Setup
  await this.setupRun(prompt);
  
  try {
    // Prepare
    const messages = await this.prepareMessages(prompt);
    await this.handleContextSummarization(messages);
    
    // Planning
    const currentPlanId = await this.handlePlanningPhase(prompt, messages);
    
    // Main loop
    await this.executeMainLoop(messages, this.currentTraceId, currentPlanId);
    
    // Save
    this.conversationManager.setHistory(messages);
  } finally {
    await this.cleanup();
  }
}
```

## Benefits
- ✅ Each method has single responsibility
- ✅ Easier to test individual components
- ✅ Better readability
- ✅ Easier to maintain and extend
- ✅ Reduced cognitive load

## Implementation Steps
1. Create private helper methods
2. Extract setup and cleanup
3. Extract message preparation
4. Extract context summarization
5. Extract planning phase
6. Extract main loop
7. Extract turn execution
8. Update run() to use new methods
9. Add unit tests for each method
10. Verify integration tests pass

## Testing Strategy
- Unit test each extracted method
- Mock dependencies
- Test error cases
- Integration test full run() flow
- Performance benchmarks

## Estimated Effort
- Extraction: 4-6 hours
- Testing: 2-3 hours
- Documentation: 1 hour
- **Total: 7-10 hours**
