/**
 * Configuration file security checks.
 * Validates file permissions and warns about overly permissive access.
 */
import { promises as fs } from 'fs';
import { platform } from 'os';
import { execSync } from 'child_process';
import { logger } from './logger.js';

/**
 * Check and fix configuration file permissions.
 * - Unix: Ensures 600 (rw-------)
 * - Windows: Warns if Everyone/Users groups have access
 */
export async function checkConfigPermissions(configPath: string): Promise<void> {
  try {
    // Check if file exists
    await fs.access(configPath);
  } catch {
    // File doesn't exist yet, skip check
    return;
  }

  if (platform() === 'win32') {
    // Windows: Use icacls to check permissions
    try {
      const output = execSync(`icacls "${configPath}"`, { encoding: 'utf8' });

      // Check for overly permissive access
      if (output.includes('Everyone') || output.includes('BUILTIN\\Users')) {
        logger.warn(`⚠️  Config file has overly permissive access: ${configPath}`);
        logger.warn('   Recommended: Remove Everyone/Users group access');
        logger.warn(`   Run: icacls "${configPath}" /inheritance:r /grant:r "%USERNAME%:(F)"`);
      } else {
        logger.debug(`✅ Config file permissions OK: ${configPath}`);
      }
    } catch (err) {
      // icacls failed, skip check
      logger.debug(`Could not check permissions for ${configPath}: ${err}`);
    }
  } else {
    // Unix: Check file mode
    try {
      const stats = await fs.stat(configPath);
      const mode = stats.mode & 0o777;

      // Should be 600 (rw-------)
      if (mode !== 0o600) {
        logger.warn(`⚠️  Config file has insecure permissions: ${mode.toString(8)}`);
        logger.warn(`   Recommended: chmod 600 ${configPath}`);

        // Auto-fix if possible
        try {
          await fs.chmod(configPath, 0o600);
          logger.info(`✅ Fixed permissions for ${configPath}`);
        } catch (chmodErr) {
          logger.warn(`   Could not auto-fix permissions: ${chmodErr}`);
        }
      } else {
        logger.debug(`✅ Config file permissions OK: ${configPath}`);
      }
    } catch (err) {
      logger.debug(`Could not check permissions for ${configPath}: ${err}`);
    }
  }
}

/**
 * Validate API key format and detect common issues.
 */
export function validateApiKey(key: string): { valid: boolean; warning?: string } {
  // Check for example/placeholder keys
  if (key === 'your-key-here' || key === 'sk-...' || key === 'your-api-key' || key.includes('example')) {
    return { valid: false, warning: 'Please replace example API key with real key' };
  }

  // Check minimum length
  if (key.length < 20) {
    return { valid: false, warning: 'API key too short (minimum 20 characters)' };
  }

  // Check for truncation
  if (key.endsWith('...') || key.includes('***') || key.includes('[REDACTED]')) {
    return { valid: false, warning: 'API key appears to be truncated or redacted' };
  }

  // Check for whitespace
  if (key.trim() !== key) {
    return { valid: false, warning: 'API key contains leading/trailing whitespace' };
  }

  return { valid: true };
}
