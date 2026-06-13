import { VERSION } from '../version.js';
import { invalidParam, netError, toolError } from './errors.js';

const MAX_REDIRECTS = 5;

export async function executeWebFetch(url: string, format?: string): Promise<string> {
  if (!url || typeof url !== 'string') {
    throw new Error(invalidParam('url', 'a non-empty URL string'));
  }

  // Validate URL
  let parsed: URL;
  try {
    parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error(netError(url, `Unsupported protocol: ${parsed.protocol}`));
    }
  } catch {
    throw new Error(netError(url, 'Invalid URL'));
  }

  const outputFormat = format === 'html' ? 'html' : 'text';

  return fetchWithRedirectLimit(url, outputFormat, 0);
}

/**
 * 带重定向次数限制的 fetch。
 *
 * Node.js 内置 fetch 默认跟随无限重定向，可能被恶意服务器利用进行重定向循环攻击。
 * 本函数手动控制重定向流程，最多跟随 MAX_REDIRECTS（5）次。
 */
async function fetchWithRedirectLimit(url: string, outputFormat: string, redirectCount: number): Promise<string> {
  if (redirectCount > MAX_REDIRECTS) {
    throw new Error(
      toolError(
        'Network',
        `Too many redirects (max ${MAX_REDIRECTS}): ${url}`,
        'The URL may be caught in a redirect loop.',
      ),
    );
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    const response = await fetch(url, {
      redirect: 'manual', // 手动处理重定向，不自动跟随
      signal: controller.signal,
      headers: {
        'User-Agent': `CodeYang/${VERSION} (AI Coding Agent)`,
        Accept: outputFormat === 'html' ? 'text/html' : 'text/plain, text/html',
      },
    });
    clearTimeout(timeout);

    // 处理重定向响应（301、302、303、307、308）
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) {
        throw new Error(netError(url, `Redirect ${response.status} without Location header`));
      }
      const nextUrl = new URL(location, url).href;
      return fetchWithRedirectLimit(nextUrl, outputFormat, redirectCount + 1);
    }

    if (!response.ok) {
      throw new Error(netError(url, `HTTP ${response.status}: ${response.statusText}`));
    }

    const contentType = response.headers.get('content-type') || '';
    const html = await response.text();

    // Detect HTML even when Content-Type is wrong (e.g. text/plain for HTML pages)
    const isHtml = contentType.includes('text/html') || /<html[\s>]/i.test(html) || /<!doctype\s+html/i.test(html);

    if (isHtml && outputFormat === 'text') {
      // Simple HTML-to-text conversion: strip tags, decode entities
      let text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/\n\s*\n/g, '\n')
        .trim();

      // Truncate very long content
      if (text.length > 100_000) {
        text = text.slice(0, 100_000) + '\n\n[Content truncated at 100000 characters]';
      }

      return text;
    }

    if (html.length > 100_000) {
      return html.slice(0, 100_000) + '\n\n[Content truncated at 100000 characters]';
    }
    return html;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(
        toolError('Network', `Request timed out after 15s: ${url}`, 'The server may be slow or unreachable.'),
      );
    }
    throw err;
  }
}
