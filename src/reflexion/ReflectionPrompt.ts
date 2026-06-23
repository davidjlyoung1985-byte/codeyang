import type { ExecutionRecord } from './ExecutionTracker.js';

/**
 * Generate prompts for the LLM to perform reflection on execution outcomes.
 */
export class ReflectionPrompt {
  /**
   * Generate a reflection prompt from execution records
   */
  static generate(records: ExecutionRecord[], trigger: string): string {
    const prompt = [
      '# Self-Reflection Task',
      '',
      `## Context`,
      `You are reflecting on recent execution failures to learn and improve.`,
      `Trigger: ${trigger}`,
      '',
      '## Recent Executions',
      '',
    ];

    for (const record of records) {
      prompt.push(`### Execution ${record.id} (${record.success ? 'SUCCESS' : 'FAILED'})`);
      prompt.push(`Task: ${record.task}`);
      prompt.push(`Duration: ${record.durationMs}ms`);
      prompt.push('');
      prompt.push('**Tools Used:**');
      for (const call of record.toolCalls) {
        prompt.push(`- ${call.name}(${JSON.stringify(call.args)})`);
      }
      prompt.push('');
      prompt.push('**Results:**');
      for (const result of record.results) {
        prompt.push(`- ${result.tool}: ${result.isError ? 'ERROR' : 'OK'}`);
        if (result.isError || !record.success) {
          prompt.push(`  Output: ${result.output.slice(0, 200)}`);
        }
      }
      if (record.errorMessage) {
        prompt.push(`**Error:** ${record.errorMessage}`);
      }
      prompt.push('');
    }

    prompt.push('## Your Task');
    prompt.push('');
    prompt.push('Analyze these executions and provide:');
    prompt.push('1. **Root Cause Analysis**: What went wrong and why?');
    prompt.push('2. **Patterns**: What common patterns led to failures?');
    prompt.push('3. **Recommendations**: Specific, actionable steps to avoid similar failures.');
    prompt.push('');
    prompt.push('Format your response as JSON:');
    prompt.push('```json');
    prompt.push('{');
    prompt.push('  "analysis": "Your analysis here",');
    prompt.push('  "patterns": ["pattern1", "pattern2"],');
    prompt.push('  "recommendations": ["rec1", "rec2"]');
    prompt.push('}');
    prompt.push('```');

    return prompt.join('\n');
  }

  /**
   * Generate a simpler reflection prompt for single failure
   */
  static generateSimple(record: ExecutionRecord): string {
    return [
      '# Quick Reflection',
      '',
      `Task: ${record.task}`,
      `Result: ${record.success ? 'SUCCESS' : 'FAILED'}`,
      record.errorMessage ? `Error: ${record.errorMessage}` : '',
      '',
      'What could be done differently next time?',
      'Provide 2-3 brief, actionable recommendations.',
    ]
      .filter(Boolean)
      .join('\n');
  }
}
