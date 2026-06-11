/**
 * WebSearchTool — search the web using a configurable search API.
 *
 * Supports:
 * - DuckDuckGo (default, free, no API key needed)
 * - SearXNG (self-hosted)
 * - SerpAPI / Bing / Google (commercial, requires API key)
 *
 * Env vars:
 *   CODEYANG_SEARCH_API    — "duckduckgo" | "searxng" | "serpapi" | "bing" | "google" (default: "duckduckgo")
 *   CODEYANG_SEARCH_URL    — base URL for self-hosted search (default: http://localhost:8888)
 *   CODEYANG_SEARCH_KEY    — API key for commercial search APIs
 *   CODEYANG_SEARCH_FALLBACK — if "true", falls back to WebFetch on search failure
 */
import axios from 'axios';

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

function getConfig() {
  return {
    api: process.env['CODEYANG_SEARCH_API'] || 'duckduckgo',
    baseUrl: process.env['CODEYANG_SEARCH_URL'] || 'http://localhost:8888',
    apiKey: process.env['CODEYANG_SEARCH_KEY'] || '',
    fallback: process.env['CODEYANG_SEARCH_FALLBACK'] === 'true',
  };
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}

function cleanSnippet(text: string): string {
  return decodeHtmlEntities(stripTags(text)).replace(/\s+/g, ' ').trim();
}

async function searchDuckDuckGo(query: string, topK: number): Promise<SearchResult[]> {
  const resp = await axios.get('https://lite.duckduckgo.com/lite/', {
    params: { q: query },
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    },
    timeout: 12000,
  });

  const html: string = resp.data;
  const results: SearchResult[] = [];

  // Parse DuckDuckGo Lite HTML results
  // Each result row contains: link with title, URL display, and snippet
  const rowRegex = /<tr[^>]*class="result"[^>]*>([\s\S]*?)<\/tr>/gi;
  const linkRegex = /<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i;
  const snippetRegex = /<td[^>]*class="result-snippet"[^>]*>([\s\S]*?)<\/td>/i;

  let rowMatch;
  while ((rowMatch = rowRegex.exec(html)) !== null && results.length < topK) {
    const rowHtml = rowMatch[1];
    const linkMatch = linkRegex.exec(rowHtml);
    if (!linkMatch) continue;

    let url = linkMatch[1];
    // Skip internal DuckDuckGo links
    if (url.startsWith('//duckduckgo.com') || url.startsWith('/')) continue;
    // Clean DuckDuckGo redirect URLs
    if (url.startsWith('//')) url = 'https:' + url;

    const title = cleanSnippet(linkMatch[2]);

    const snippetMatch = snippetRegex.exec(rowHtml);
    const snippet = snippetMatch ? cleanSnippet(snippetMatch[1]) : '';

    if (title) {
      results.push({ title, url, snippet });
    }
  }

  // Fallback: try alternate parsing for lite version variant
  if (results.length === 0) {
    const altLinkRegex = /<a[^>]*href="(https?:\/\/[^"]*)"[^>]*class="result-link"[^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = altLinkRegex.exec(html)) !== null && results.length < topK) {
      const url = m[1];
      if (url.includes('duckduckgo.com')) continue;
      results.push({ title: cleanSnippet(m[2]), url, snippet: '' });
    }
  }

  return results;
}

async function searchSearXNG(query: string, topK: number): Promise<SearchResult[]> {
  const cfg = getConfig();
  const resp = await axios.get(`${cfg.baseUrl}/search`, {
    params: { q: query, format: 'json', language: 'zh-CN', number_of_results: topK },
    timeout: 10000,
  });
  return (resp.data.results || [])
    .slice(0, topK)
    .map((r: { title?: string; url?: string; content?: string; snippet?: string }) => ({
      title: r.title || '',
      url: r.url || '',
      snippet: r.content || r.snippet || '',
    }));
}

async function searchSerpAPI(query: string, topK: number): Promise<SearchResult[]> {
  const cfg = getConfig();
  const resp = await axios.get('https://serpapi.com/search', {
    params: { q: query, api_key: cfg.apiKey, engine: 'google', num: topK },
    timeout: 10000,
  });
  return (resp.data.organic_results || [])
    .slice(0, topK)
    .map((r: { title?: string; link?: string; snippet?: string }) => ({
      title: r.title || '',
      url: r.link || '',
      snippet: r.snippet || '',
    }));
}

async function searchBing(query: string, topK: number): Promise<SearchResult[]> {
  const cfg = getConfig();
  const resp = await axios.get('https://api.bing.microsoft.com/v7.0/search', {
    headers: { 'Ocp-Apim-Subscription-Key': cfg.apiKey },
    params: { q: query, count: topK, mkt: 'zh-CN' },
    timeout: 10000,
  });
  return (resp.data.webPages?.value || [])
    .slice(0, topK)
    .map((r: { name?: string; url?: string; snippet?: string }) => ({
      title: r.name || '',
      url: r.url || '',
      snippet: r.snippet || '',
    }));
}

async function searchGoogle(query: string, topK: number): Promise<SearchResult[]> {
  const cfg = getConfig();
  const resp = await axios.get('https://www.googleapis.com/customsearch/v1', {
    params: {
      q: query,
      key: cfg.apiKey,
      cx: cfg.baseUrl || '017576662512468239146:omuauf_lfve',
      num: Math.min(topK, 10),
    },
    timeout: 10000,
  });
  return (resp.data.items || []).map((r: { title?: string; link?: string; snippet?: string }) => ({
    title: r.title || '',
    url: r.link || '',
    snippet: r.snippet || '',
  }));
}

function formatResults(query: string, api: string, results: SearchResult[]): string {
  if (results.length === 0) return `No results found for: ${query}`;

  const lines: string[] = [`Web search results for: "${query}"`, `Source: ${api}`, `Results: ${results.length}`, ''];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    lines.push(`${i + 1}. ${r.title}`);
    lines.push(`   ${r.url}`);
    lines.push(`   ${r.snippet.slice(0, 200)}`);
    lines.push('');
  }

  return lines.join('\n');
}

export async function executeWebSearch(query: string, topK: number = 5): Promise<string> {
  if (!query.trim()) return 'Error: search query cannot be empty';

  const cfg = getConfig();
  let results: SearchResult[] = [];

  try {
    switch (cfg.api) {
      case 'duckduckgo':
        results = await searchDuckDuckGo(query, topK);
        break;
      case 'serpapi':
        results = await searchSerpAPI(query, topK);
        break;
      case 'bing':
        results = await searchBing(query, topK);
        break;
      case 'google':
        results = await searchGoogle(query, topK);
        break;
      case 'searxng':
      default:
        results = await searchSearXNG(query, topK);
        break;
    }
  } catch (err) {
    if (cfg.fallback) {
      return `[WebSearch unavailable (${err instanceof Error ? err.message : String(err)}). Try WebFetch for specific URLs.]`;
    }
    const msg = err instanceof Error ? err.message : String(err);
    return `Search failed: ${msg}. Configure via CODEYANG_SEARCH_API (duckduckgo/searxng/serpapi/bing/google) and CODEYANG_SEARCH_KEY.`;
  }

  return formatResults(query, cfg.api, results);
}
