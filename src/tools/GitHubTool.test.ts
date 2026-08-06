import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import axios from 'axios';

// Mock axios before importing the module
vi.mock('axios');

import { executeGitHub, configureGitHub } from './GitHubTool.js';

describe('GitHubTool', () => {
  let mockAxiosInstance: {
    get: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset environment
    delete process.env.GITHUB_TOKEN;

    // Reset configuration
    configureGitHub(undefined, undefined);

    // Create mock axios instance
    mockAxiosInstance = {
      get: vi.fn(),
    };

    vi.mocked(axios.create).mockReturnValue(mockAxiosInstance as unknown as ReturnType<typeof vi.fn>);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('configuration', () => {
    it('should configure GitHub token and repo', async () => {
      configureGitHub('test-token', 'owner/repo');

      const result = await executeGitHub({ action: 'config' });

      expect(result).toContain('repo=owner/repo');
      expect(result).toContain('token=***');
    });

    it('should use environment variable token', async () => {
      process.env.GITHUB_TOKEN = 'env-token';

      mockAxiosInstance.get.mockResolvedValue({ data: [] });

      await executeGitHub({ action: 'list-prs', repo: 'test/repo' });

      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer env-token',
          }),
        }),
      );
    });

    it('should prefer configured token over environment', async () => {
      process.env.GITHUB_TOKEN = 'env-token';
      configureGitHub('config-token', 'owner/repo');

      mockAxiosInstance.get.mockResolvedValue({ data: [] });

      await executeGitHub({ action: 'list-prs', repo: 'test/repo' });

      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer config-token',
          }),
        }),
      );
    });
  });

  describe('help action', () => {
    it('should return help message', async () => {
      const result = await executeGitHub({ action: 'help' });

      expect(result).toContain('GitHub Tool');
      expect(result).toContain('list-prs');
      expect(result).toContain('list-issues');
      expect(result).toContain('get-file');
    });

    it('should not require token for help', async () => {
      const result = await executeGitHub({ action: 'help' });

      expect(result).not.toContain('No authentication token');
      expect(result).toContain('GitHub Tool');
    });
  });

  describe('list-prs action', () => {
    beforeEach(() => {
      configureGitHub('test-token', undefined);
    });

    it('should list pull requests successfully', async () => {
      const mockPRs = [
        { number: 1, title: 'Fix bug', user: { login: 'user1' } },
        { number: 2, title: 'Add feature', user: { login: 'user2' } },
      ];

      mockAxiosInstance.get.mockResolvedValue({ data: mockPRs });

      const result = await executeGitHub({ action: 'list-prs', repo: 'owner/repo' });

      expect(result).toContain('#1 Fix bug (user1)');
      expect(result).toContain('#2 Add feature (user2)');
    });

    it('should handle empty PR list', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: [] });

      const result = await executeGitHub({ action: 'list-prs', repo: 'owner/repo' });

      expect(result).toContain('No open pull requests');
    });

    it('should require repository parameter', async () => {
      const result = await executeGitHub({ action: 'list-prs' });

      expect(result).toContain('Repository required');
    });

    it('should handle missing user in PR', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: [{ number: 1, title: 'PR without user' }],
      });

      const result = await executeGitHub({ action: 'list-prs', repo: 'owner/repo' });

      expect(result).toContain('#1 PR without user (unknown)');
    });

    it('should use default repo from config', async () => {
      configureGitHub('test-token', 'default/repo');
      mockAxiosInstance.get.mockResolvedValue({ data: [] });

      await executeGitHub({ action: 'list-prs' });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/repos/default/repo/pulls');
    });
  });

  describe('list-issues action', () => {
    beforeEach(() => {
      configureGitHub('test-token', undefined);
    });

    it('should list issues successfully', async () => {
      const mockIssues = [
        { number: 10, title: 'Bug report' },
        { number: 11, title: 'Feature request' },
      ];

      mockAxiosInstance.get.mockResolvedValue({ data: mockIssues });

      const result = await executeGitHub({ action: 'list-issues', repo: 'owner/repo' });

      expect(result).toContain('#10 Bug report');
      expect(result).toContain('#11 Feature request');
    });

    it('should filter out pull requests from issues', async () => {
      const mockData = [
        { number: 1, title: 'Issue' },
        { number: 2, title: 'PR', pull_request: {} },
      ];

      mockAxiosInstance.get.mockResolvedValue({ data: mockData });

      const result = await executeGitHub({ action: 'list-issues', repo: 'owner/repo' });

      expect(result).toContain('#1 Issue');
      expect(result).not.toContain('#2 PR');
    });

    it('should handle empty issue list', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: [] });

      const result = await executeGitHub({ action: 'list-issues', repo: 'owner/repo' });

      expect(result).toContain('No open issues');
    });

    it('should require repository parameter', async () => {
      const result = await executeGitHub({ action: 'list-issues' });

      expect(result).toContain('Repository required');
    });
  });

  describe('get-file action', () => {
    beforeEach(() => {
      configureGitHub('test-token', undefined);
    });

    it('should get file content successfully', async () => {
      const content = Buffer.from('Hello World').toString('base64');
      mockAxiosInstance.get.mockResolvedValue({ data: { content } });

      const result = await executeGitHub({
        action: 'get-file',
        repo: 'owner/repo',
        path: 'README.md',
      });

      expect(result).toBe('Hello World');
    });

    it('should require both repo and path', async () => {
      const result1 = await executeGitHub({ action: 'get-file', repo: 'owner/repo' });
      expect(result1).toContain('Both "repo"');

      const result2 = await executeGitHub({ action: 'get-file', path: 'file.txt' });
      expect(result2).toContain('Both "repo"');
    });

    it('should handle missing content', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: {} });

      const result = await executeGitHub({
        action: 'get-file',
        repo: 'owner/repo',
        path: 'dir/',
      });

      expect(result).toContain('No content returned');
    });

    it('should encode file path', async () => {
      const content = Buffer.from('content').toString('base64');
      mockAxiosInstance.get.mockResolvedValue({ data: { content } });

      await executeGitHub({
        action: 'get-file',
        repo: 'owner/repo',
        path: 'path/with spaces.txt',
      });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        expect.stringContaining(encodeURIComponent('path/with spaces.txt')),
      );
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      configureGitHub('test-token', undefined);
    });

    it('should handle 404 errors', async () => {
      mockAxiosInstance.get.mockRejectedValue({
        response: { status: 404, data: { message: 'Not Found' } },
        config: { url: '/repos/owner/repo/pulls' },
      });

      const result = await executeGitHub({ action: 'list-prs', repo: 'owner/repo' });

      expect(result).toContain('Resource not found (404)');
    });

    it('should handle 401 authentication errors', async () => {
      mockAxiosInstance.get.mockRejectedValue({
        response: { status: 401, data: { message: 'Bad credentials' } },
      });

      const result = await executeGitHub({ action: 'list-prs', repo: 'owner/repo' });

      expect(result).toContain('Authentication error (401)');
    });

    it('should handle 403 permission errors', async () => {
      mockAxiosInstance.get.mockRejectedValue({
        response: { status: 403, data: { message: 'Forbidden' } },
      });

      const result = await executeGitHub({ action: 'list-prs', repo: 'owner/repo' });

      expect(result).toContain('Authentication error (403)');
    });

    it('should handle network errors', async () => {
      mockAxiosInstance.get.mockRejectedValue({
        message: 'Network Error',
      });

      const result = await executeGitHub({ action: 'list-prs', repo: 'owner/repo' });

      expect(result).toContain('Network Error');
    });

    it('should handle timeout errors', async () => {
      mockAxiosInstance.get.mockRejectedValue({
        message: 'timeout of 30000ms exceeded',
        config: { url: '/repos/owner/repo/pulls' },
      });

      const result = await executeGitHub({ action: 'list-prs', repo: 'owner/repo' });

      expect(result).toContain('timeout');
    });

    it('should require authentication token', async () => {
      const result = await executeGitHub({ action: 'list-prs', repo: 'owner/repo' });

      expect(result).toContain('No authentication token available');
    });

    it('should handle rate limiting', async () => {
      mockAxiosInstance.get.mockRejectedValue({
        response: {
          status: 403,
          data: { message: 'API rate limit exceeded' },
        },
      });

      const result = await executeGitHub({ action: 'list-prs', repo: 'owner/repo' });

      expect(result).toContain('Authentication error');
    });
  });

  describe('edge cases', () => {
    beforeEach(() => {
      configureGitHub('test-token', undefined);
    });

    it('should handle unknown action', async () => {
      const result = await executeGitHub({ action: 'unknown-action' });

      expect(result).toContain('GitHub Tool');
      expect(result).toContain('Actions:');
    });

    it('should handle missing action', async () => {
      const result = await executeGitHub({});

      expect(result).toContain('No authentication token available');
    });

    it('should handle malformed response data', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: null });

      const result = await executeGitHub({ action: 'list-prs', repo: 'owner/repo' });

      expect(result).toContain('No open pull requests');
    });

    it('should handle non-array response', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: { not: 'array' } });

      const result = await executeGitHub({ action: 'list-prs', repo: 'owner/repo' });

      expect(result).toContain('No open pull requests');
    });

    it('should handle special characters in repo name', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: [] });

      await executeGitHub({ action: 'list-prs', repo: 'owner-name/repo.name' });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/repos/owner-name/repo.name/pulls');
    });

    it('should handle very long file content', async () => {
      const longContent = 'a'.repeat(100000);
      const content = Buffer.from(longContent).toString('base64');
      mockAxiosInstance.get.mockResolvedValue({ data: { content } });

      const result = await executeGitHub({
        action: 'get-file',
        repo: 'owner/repo',
        path: 'large.txt',
      });

      expect(result).toBe(longContent);
    });

    it('should handle concurrent requests', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: [] });

      const promises = [
        executeGitHub({ action: 'list-prs', repo: 'owner/repo1' }),
        executeGitHub({ action: 'list-prs', repo: 'owner/repo2' }),
        executeGitHub({ action: 'list-issues', repo: 'owner/repo3' }),
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(3);
    });

    it('should handle empty token configuration', async () => {
      configureGitHub('', '');

      const result = await executeGitHub({ action: 'list-prs', repo: 'owner/repo' });

      expect(result).toContain('No authentication token');
    });

    it('should handle config without parameters', async () => {
      const result = await executeGitHub({ action: 'config' });

      expect(result).toContain('GitHub configured');
    });
  });
});
