export async function executeWebFetch(url: string, format?: string): Promise<string> {
  if (!url || typeof url !== 'string') {
    throw new Error('URL is required');
  }

  // Validate URL
  let parsed: URL;
  try {
    parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error(`Unsupported protocol: ${parsed.protocol}`);
    }
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  const outputFormat = format === 'html' ? 'html' : 'text';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'CodeYang/0.2.0 (AI Coding Agent)',
        Accept: outputFormat === 'html' ? 'text/html' : 'text/plain, text/html',
      },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || '';
    const isHtml = contentType.includes('text/html');

    if (isHtml && outputFormat === 'text') {
      // Simple HTML-to-text conversion: strip tags, decode entities
      const html = await response.text();
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

    const content = await response.text();
    if (content.length > 100_000) {
      return content.slice(0, 100_000) + '\n\n[Content truncated at 100000 characters]';
    }
    return content;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Request timed out after 15s: ${url}`);
    }
    throw err;
  }
}
