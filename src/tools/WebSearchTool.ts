/**
 * WebSearchTool — search the web using a configurable search API.
 *
 * Supports:
 * - Built-in: uses web_search tool (LLM provider's built-in search if available)
 * - Configurable: SearXNG / SerpAPI / Bing / Google via CODEYANG_SEARCH_API env var
 *
 * Env vars:
 *   CODEYANG_SEARCH_API    — "searxng" | "serpapi" | "bing" | "google" (default: "searxng")
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
    api: process.env['CODEYANG_SEARCH_API'] || 'searxng',
    baseUrl: process.env['CODEYANG_SEARCH_URL'] || 'http://localhost:8888',
    apiKey: process.env['CODEYANG_SEARCH_KEY'] || '',
    fallback: process.env['CODEYANG_SEARCH_FALLBACK'] === 'true',
  };
}

async function searchSearXNG(query: string, topK: number): Promise<SearchResult[]> {
  const cfg = getConfig();
  const resp = await axios.get(`${cfg.baseUrl}/search`, {
    params: { q: query, format: 'json', language: 'zh-CN', number_of_results: topK },
    timeout: 10000,
  });
  return (resp.data.results || []).slice(0, topK).map((r: { title?: string; url?: string; content?: string; snippet?: string }) => ({
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
  return (resp.data.organic_results || []).slice(0, topK).map((r: { title?: string; link?: string; snippet?: string }) => ({
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
  return (resp.data.webPages?.value || []).slice(0, topK).map((r: { name?: string; url?: string; snippet?: string }) => ({
    title: r.name || '',
    url: r.url || '',
    snippet: r.snippet || '',
  }));
}

export async function executeWebSearch(
  query: string,
  topK: number = 5,
): Promise<string> {
  if (!query.trim()) return 'Error: search query cannot be empty';

  const cfg = getConfig();
  let results: SearchResult[] = [];

  try {
    switch (cfg.api) {
      case 'serpapi':
        results = await searchSerpAPI(query, topK);
        break;
      case 'bing':
        results = await searchBing(query, topK);
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
    return `Search failed: ${msg}. Set CODEYANG_SEARCH_URL for self-hosted SearXNG, or CODEYANG_SEARCH_KEY + CODEYANG_SEARCH_API=serpapi for SerpAPI.`;
  }

  if (results.length === 0) return `No results found for: ${query}`;

  const lines: string[] = [
    `Web search results for: "${query}"`,
    `Source: ${cfg.api}`,
    `Results: ${results.length}`,
    '',
  ];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    lines.push(`${i + 1}. ${r.title}`);
    lines.push(`   ${r.url}`);
    lines.push(`   ${r.snippet.slice(0, 200)}`);
    lines.push('');
  }

  return lines.join('\n');
}
