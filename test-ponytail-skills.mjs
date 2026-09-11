#!/usr/bin/env node
/**
 * Test script to verify ponytail skills are properly loaded
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SKILLS_DIR = join(__dirname, '.agents', 'skills');
const PONYTAIL_SKILLS = ['ponytail', 'ponytail-debt', 'ponytail-review'];

console.log('🔍 Verifying ponytail skills integration...\n');

let allPassed = true;

// Check if skills directory exists
if (!existsSync(SKILLS_DIR)) {
  console.error('❌ Skills directory not found:', SKILLS_DIR);
  process.exit(1);
}

// Check each ponytail skill
for (const skillName of PONYTAIL_SKILLS) {
  const skillDir = join(SKILLS_DIR, skillName);
  const skillFile = join(skillDir, 'SKILL.md');

  console.log(`📦 Checking ${skillName}...`);

  if (!existsSync(skillDir)) {
    console.error(`  ❌ Skill directory not found: ${skillDir}`);
    allPassed = false;
    continue;
  }

  if (!existsSync(skillFile)) {
    console.error(`  ❌ SKILL.md not found: ${skillFile}`);
    allPassed = false;
    continue;
  }

  try {
    const content = readFileSync(skillFile, 'utf-8');

    // Parse frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) {
      console.error(`  ❌ No frontmatter found in ${skillFile}`);
      allPassed = false;
      continue;
    }

    const frontmatter = frontmatterMatch[1];

    // Check for required fields
    const hasName = /^name:\s*(.+)$/m.test(frontmatter);
    const hasDescription = /^description:/m.test(frontmatter);

    if (!hasName) {
      console.error(`  ❌ Missing 'name:' field in frontmatter`);
      allPassed = false;
      continue;
    }

    if (!hasDescription) {
      console.error(`  ❌ Missing 'description:' field in frontmatter`);
      allPassed = false;
      continue;
    }

    // Extract name from frontmatter
    const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
    const parsedName = nameMatch ? nameMatch[1].trim() : null;

    if (parsedName !== skillName) {
      console.error(`  ⚠️  Name mismatch: expected '${skillName}', got '${parsedName}'`);
    }

    // Check content sections
    const hasLadder = skillName === 'ponytail' && content.includes('## The ladder');
    const hasRules = skillName === 'ponytail' && content.includes('## Rules');
    const hasScanSection = skillName === 'ponytail-debt' && content.includes('## Scan');
    const hasFormat = skillName === 'ponytail-review' && content.includes('## Format');

    if (skillName === 'ponytail' && !hasLadder) {
      console.error(`  ❌ Missing '## The ladder' section`);
      allPassed = false;
      continue;
    }

    console.log(`  ✅ Skill valid (${content.length} chars)`);

  } catch (err) {
    console.error(`  ❌ Error reading skill file:`, err.message);
    allPassed = false;
  }
}

// Check documentation
console.log('\n📚 Checking documentation...');
const docFile = join(__dirname, 'docs', 'ponytail-methodology.md');

if (!existsSync(docFile)) {
  console.error(`  ❌ Documentation not found: ${docFile}`);
  allPassed = false;
} else {
  const docContent = readFileSync(docFile, 'utf-8');
  const hasOverview = docContent.includes('## Overview');
  const hasLadder = docContent.includes('## The Ladder');
  const hasExamples = docContent.includes('## Examples');

  if (!hasOverview || !hasLadder || !hasExamples) {
    console.error(`  ❌ Documentation missing required sections`);
    allPassed = false;
  } else {
    console.log(`  ✅ Documentation complete (${docContent.length} chars)`);
  }
}

// Summary
console.log('\n' + '='.repeat(50));
if (allPassed) {
  console.log('✅ All ponytail skills verified successfully!');
  console.log('\nUsage:');
  console.log('  /ponytail [lite|full|ultra]  - Activate lazy mode');
  console.log('  /ponytail-debt               - List shortcuts');
  console.log('  /ponytail-review             - Review for over-engineering');
  process.exit(0);
} else {
  console.log('❌ Some checks failed. Please review the errors above.');
  process.exit(1);
}
