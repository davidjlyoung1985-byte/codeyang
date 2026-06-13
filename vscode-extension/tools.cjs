"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/tools/shared.ts
var shared_exports = {};
__export(shared_exports, {
  executeEdit: () => executeEdit,
  executeGlob: () => executeGlob,
  executeGrep: () => executeGrep,
  executeImageInfo: () => executeImageInfo,
  executeImageToBase64: () => executeImageToBase64,
  executeListImages: () => executeListImages,
  executeRead: () => executeRead,
  executeSearch: () => executeSearch,
  executeTodoWrite: () => executeTodoWrite,
  executeWebFetch: () => executeWebFetch,
  executeWrite: () => executeWrite,
  getTodos: () => getTodos,
  matchGlob: () => matchGlob,
  resetTodos: () => resetTodos,
  resolveSafePath: () => resolveSafePath
});
module.exports = __toCommonJS(shared_exports);
var import_node_path6 = require("path");
var import_node_fs2 = require("fs");

// src/tools/errors.ts
var HINT_SEPARATOR = "\n  \u{1F4A1} ";
var ACTION_SEPARATOR = "\n  \u{1F4DD} ";
function toolError(ctx, msg, hint, severity = "error") {
  const severityIcon = {
    critical: "\u{1F534}",
    error: "\u274C",
    warning: "\u26A0\uFE0F",
    info: "\u2139\uFE0F"
  }[severity];
  let r = `${severityIcon} [${ctx}] ${msg}`;
  if (hint) r += `${HINT_SEPARATOR}${hint}`;
  return r;
}
function toolErrorWithActions(details) {
  let r = toolError(details.context, details.message, details.hint, details.severity);
  if (details.actions && details.actions.length > 0) {
    r += `${ACTION_SEPARATOR}Try:`;
    details.actions.forEach((action, i) => {
      r += `
    ${i + 1}) ${action}`;
    });
  }
  return r;
}
function fileNotFound(p, cwd) {
  const hint = cwd ? `Working directory: ${cwd}` : void 0;
  return toolErrorWithActions({
    severity: "error",
    context: "FS",
    message: `File not found: ${p}`,
    hint,
    actions: [
      "Check the file path for typos",
      "Use Glob or List to find available files",
      "Verify you are in the correct directory"
    ]
  });
}
function invalidParam(k, expect) {
  return toolErrorWithActions({
    severity: "error",
    context: "Validation",
    message: `"${k}" expected ${expect}`,
    actions: ["Check the parameter value", "Refer to tool documentation for correct format"]
  });
}
function netError(url, detail, isTimeout = false) {
  return toolErrorWithActions({
    severity: "error",
    context: "Network",
    message: `${url}: ${detail}`,
    hint: isTimeout ? "Request timed out" : "Check connectivity and URL",
    actions: isTimeout ? ["Retry the request", "Check network connection", "Verify the URL is accessible"] : ["Check your internet connection", "Verify the URL is correct", "Check if the server is online"]
  });
}

// src/tools/ReadTool.ts
var import_promises = require("fs/promises");
var MAX_FILE_SIZE = 10 * 1024 * 1024;
async function executeRead(filePath, offset, limit) {
  const resolved = resolveSafePath(filePath);
  let stats;
  try {
    stats = await (0, import_promises.stat)(resolved);
  } catch {
    throw new Error(fileNotFound(filePath));
  }
  if (stats.isDirectory()) {
    const entries = await (0, import_promises.readdir)(resolved, { withFileTypes: true });
    const lines2 = [];
    const sorted = [...entries].sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const entry of sorted) {
      const suffix = entry.isDirectory() ? "/" : "";
      lines2.push(`${entry.name}${suffix}`);
    }
    const total = entries.length;
    const dirs = entries.filter((e) => e.isDirectory()).length;
    const files = total - dirs;
    return lines2.length > 0 ? `${lines2.join("\n")}

${dirs} director${dirs === 1 ? "y" : "ies"}, ${files} file${files === 1 ? "" : "s"}` : "(empty directory)";
  }
  if (stats.size > MAX_FILE_SIZE && offset === void 0) {
    throw new Error(
      toolError(
        "Read",
        `File is ${(stats.size / 1024 / 1024).toFixed(1)} MB (max ${MAX_FILE_SIZE / 1024 / 1024} MB). Use offset and limit to read specific sections.`
      )
    );
  }
  const content = await (0, import_promises.readFile)(resolved, "utf-8");
  const lines = content.split("\n");
  const totalLines = lines.length;
  if (offset !== void 0) {
    const start = offset;
    const end = limit !== void 0 ? start + limit : totalLines;
    const selected = lines.slice(start, end);
    const shown = selected.length;
    const header = `(Lines ${start + 1}-${start + shown} of ${totalLines})
`;
    return header + selected.map((l, i) => `${start + i + 1}: ${l}`).join("\n");
  }
  return content;
}

// src/tools/WriteTool.ts
var import_promises2 = require("fs/promises");
var import_node_path = require("path");
async function executeWrite(filePath, content) {
  const resolved = resolveSafePath(filePath);
  await (0, import_promises2.mkdir)((0, import_node_path.dirname)(resolved), { recursive: true });
  await (0, import_promises2.writeFile)(resolved, content, "utf-8");
  return `Written ${content.length} bytes to ${filePath}`;
}

// src/tools/EditTool.ts
var import_promises3 = require("fs/promises");

// src/utils/editHistory.ts
var EditHistory = class {
  stack = [];
  redoStack = [];
  MAX_HISTORY = 50;
  MAX_TOTAL_BYTES = 10 * 1024 * 1024;
  // 10 MB total cap
  push(filePath, previousContent) {
    this.stack.push({ filePath, previousContent, timestamp: Date.now() });
    this.redoStack = [];
    if (this.stack.length > this.MAX_HISTORY) {
      this.stack.shift();
    }
    while (this.totalBytes() > this.MAX_TOTAL_BYTES && this.stack.length > 1) {
      this.stack.shift();
    }
  }
  undo() {
    const entry = this.stack.pop();
    if (entry) this.redoStack.push(entry);
    return entry ?? null;
  }
  redo() {
    const entry = this.redoStack.pop();
    if (entry) this.stack.push(entry);
    return entry ?? null;
  }
  clear() {
    this.stack = [];
    this.redoStack = [];
  }
  totalBytes() {
    let total = 0;
    for (const e of this.stack) {
      total += e.previousContent.length;
    }
    return total;
  }
  get canUndo() {
    return this.stack.length > 0;
  }
  get canRedo() {
    return this.redoStack.length > 0;
  }
};
var editHistory = new EditHistory();

// src/tools/EditTool.ts
async function executeEdit(filePath, oldString, newString, replaceAll) {
  const resolved = resolveSafePath(filePath);
  try {
    await (0, import_promises3.stat)(resolved);
  } catch {
    throw new Error(fileNotFound(filePath));
  }
  const currentContent = await (0, import_promises3.readFile)(resolved, "utf-8");
  editHistory.push(resolved, currentContent);
  const content = currentContent;
  if (replaceAll) {
    if (!content.includes(oldString)) {
      throw new Error(toolError("Edit", `oldString not found in ${filePath}`, "Verify the exact text to replace."));
    }
    const beforeCount = countMatches(content, oldString);
    const updated2 = content.replaceAll(oldString, newString);
    await (0, import_promises3.writeFile)(resolved, updated2, "utf-8");
    const verify2 = await (0, import_promises3.readFile)(resolved, "utf-8");
    const afterCount = countMatches(verify2, oldString);
    if (afterCount > 0) {
      throw new Error(
        toolError(
          "Edit",
          `Replace verification failed: ${afterCount} occurrence(s) of oldString remain in ${filePath}`,
          "Unexpected \u2014 file content may be stale."
        )
      );
    }
    return `Replaced ${beforeCount} occurrence(s) in ${filePath}`;
  }
  const idx = content.indexOf(oldString);
  if (idx === -1) {
    throw new Error(toolError("Edit", `oldString not found in ${filePath}`, "Verify the exact text to replace."));
  }
  if (content.indexOf(oldString, idx + 1) !== -1) {
    throw new Error(
      toolError(
        "Edit",
        `Found multiple matches for oldString in ${filePath}`,
        "Provide more surrounding context or use replaceAll."
      )
    );
  }
  const updated = content.slice(0, idx) + newString + content.slice(idx + oldString.length);
  await (0, import_promises3.writeFile)(resolved, updated, "utf-8");
  const verify = await (0, import_promises3.readFile)(resolved, "utf-8");
  if (!verify.includes(newString) && newString.length > 0) {
    throw new Error(
      toolError(
        "Edit",
        `Replace verification failed: newString not found in ${filePath}`,
        "Unexpected \u2014 file may be read-only."
      )
    );
  }
  return `Edited ${filePath} (1 occurrence)`;
}
function countMatches(str, search) {
  if (!search) return 0;
  let count = 0;
  let pos = 0;
  while ((pos = str.indexOf(search, pos)) !== -1) {
    count++;
    pos += search.length;
  }
  return count;
}

// src/tools/GlobTool.ts
var import_promises4 = require("fs/promises");
var import_node_path2 = require("path");

// src/utils/globMatch.ts
function globToRegex(pattern) {
  let regexStr = "";
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    switch (ch) {
      case "*":
        if (pattern[i + 1] === "*") {
          i += 2;
          if (i < pattern.length && pattern[i] === "/") {
            i++;
          }
          regexStr += i < pattern.length ? "(.*/)?" : ".*";
        } else {
          i++;
          regexStr += "[^/]*";
        }
        break;
      case "?":
        i++;
        regexStr += "[^/]";
        break;
      case "[": {
        const end = pattern.indexOf("]", i);
        if (end === -1) {
          regexStr += "\\[";
          i++;
        } else {
          let classContent = pattern.slice(i + 1, end);
          let negate = false;
          if (classContent.startsWith("!") || classContent.startsWith("^")) {
            negate = true;
            classContent = classContent.slice(1);
          }
          if (!classContent) {
            regexStr += "\\[" + pattern.slice(i + 1, end) + "\\]";
            i = end + 1;
            break;
          }
          const escaped = classContent.replace(/\\/g, "\\\\").replace(/\]/g, "\\]").replace(/\^/g, "\\^");
          regexStr += negate ? `[^${escaped}]` : `[${escaped}]`;
          i = end + 1;
        }
        break;
      }
      case ".":
      case "^":
      case "$":
      case "+":
      case "{":
      case "}":
      case "(":
      case ")":
      case "|":
      case "\\":
        regexStr += "\\" + ch;
        i++;
        break;
      default:
        regexStr += ch;
        i++;
    }
  }
  if (regexStr.endsWith("/")) {
    regexStr = regexStr.slice(0, -1) + "(/.*)?";
  }
  return new RegExp(`^${regexStr}$`);
}

// src/tools/GlobTool.ts
var SKIP_DIRS = /* @__PURE__ */ new Set(["node_modules", ".git", "dist", ".next", "build", ".turbo", "coverage", "__pycache__"]);
function matchGlob(pattern, path3) {
  return globToRegex(pattern).test(path3);
}
async function executeGlob(pattern, root) {
  try {
    const base = root ? (0, import_node_path2.isAbsolute)(root) ? root : (0, import_node_path2.join)(process.cwd(), root) : process.cwd();
    const results = [];
    const regex = globToRegex(pattern);
    async function walk(dir) {
      let entries;
      try {
        entries = await (0, import_promises4.readdir)(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const full = (0, import_node_path2.join)(dir, entry.name);
        const rel = (0, import_node_path2.relative)(base, full).replace(/\\/g, "/");
        if (regex.test(rel)) {
          results.push(rel);
        }
        if (entry.isDirectory() && !entry.name.startsWith(".") && !SKIP_DIRS.has(entry.name)) {
          if (pattern.includes("**")) {
            await walk(full);
          } else if (pattern.includes("/")) {
            const depth = rel.split("/").length;
            const patternDepth = pattern.split("/").length;
            if (depth < patternDepth) {
              await walk(full);
            }
          }
        }
      }
    }
    await walk(base);
    return results.length > 0 ? results.join("\n") : "(no matches)";
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// src/tools/GrepTool.ts
var import_promises5 = require("fs/promises");
var import_node_path3 = require("path");
var SKIP_DIRS2 = /* @__PURE__ */ new Set(["node_modules", ".git", "dist", ".next", "build", ".turbo", "coverage", "__pycache__"]);
async function tryRipgrep(pattern, include, base, contextLines) {
  try {
    const { execa } = await import("execa");
    const args = ["-n", "-i", "--no-heading", "-m", "20"];
    if (contextLines > 0) args.push(`-C${contextLines}`);
    if (include) args.push("-g", include);
    args.push(pattern, base);
    const result = await execa("rg", args, {
      timeout: 1e4,
      reject: false,
      env: { ...process.env }
    });
    if (result.exitCode === 0) {
      return result.stdout || "(no matches)";
    }
    if (result.exitCode === 1) {
      if (result.stderr && result.stderr.length > 0) return null;
      return "(no matches)";
    }
    return null;
  } catch {
    return null;
  }
}
async function grepFileLineStream(filePath, regex, maxMatches, contextLines = 0) {
  let content;
  try {
    content = await (0, import_promises5.readFile)(filePath, "utf-8");
  } catch {
    return null;
  }
  if (content.includes("\0")) return null;
  const lines = content.split("\n");
  const matches = [];
  const seen = /* @__PURE__ */ new Set();
  for (let i = 0; i < lines.length && matches.length < maxMatches; i++) {
    if (regex.test(lines[i])) {
      const start = Math.max(0, i - contextLines);
      const end = Math.min(lines.length - 1, i + contextLines);
      for (let j = start; j <= end; j++) {
        if (!seen.has(j)) {
          seen.add(j);
          const prefix = j === i ? `${j + 1}: ` : `${j + 1}  `;
          matches.push(prefix + lines[j].trim());
        }
      }
      if (contextLines > 0) matches.push("--");
    }
  }
  return matches.length > 0 ? matches : null;
}
async function executeGrep(pattern, include, path3, contextLines = 0) {
  const base = path3 ? (0, import_node_path3.isAbsolute)(path3) ? path3 : (0, import_node_path3.join)(process.cwd(), path3) : process.cwd();
  const includeRegex = include ? globToRegex(include) : null;
  const rgResult = await tryRipgrep(pattern, include ?? null, base, contextLines);
  if (rgResult !== null) return rgResult;
  const regex = new RegExp(pattern, "i");
  const results = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await (0, import_promises5.readdir)(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = (0, import_node_path3.join)(dir, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith(".") && !SKIP_DIRS2.has(entry.name)) {
          await walk(full);
        }
      } else if (entry.isFile()) {
        if (includeRegex && !includeRegex.test(entry.name)) continue;
        const matched = await grepFileLineStream(full, regex, 20, contextLines);
        if (matched) {
          const relPath = (0, import_node_path3.relative)(base, full).replace(/\\/g, "/");
          results.push({ file: relPath, lines: matched });
        }
      }
    }
  }
  await walk(base);
  if (results.length === 0) return "(no matches)";
  return results.map((r) => `${r.file}
${r.lines.join("\n")}`).join("\n\n");
}

// src/utils/todoStore.ts
var import_promises6 = require("fs/promises");
var import_node_path4 = require("path");
var import_node_os = require("os");
var DIR = (0, import_node_path4.join)((0, import_node_os.homedir)(), ".codeyang");
var FILE = (0, import_node_path4.join)(DIR, "todos.json");
async function saveTodos(todos) {
  await (0, import_promises6.mkdir)(DIR, { recursive: true });
  await (0, import_promises6.writeFile)(FILE, JSON.stringify(todos, null, 2));
}
async function loadTodos() {
  try {
    return JSON.parse(await (0, import_promises6.readFile)(FILE, "utf-8"));
  } catch {
    return [];
  }
}
async function clearTodos() {
  await saveTodos([]);
}

// src/tools/TodoWriteTool.ts
async function getTodos() {
  const persisted = await loadTodos();
  return persisted.map((t) => ({
    content: t.content,
    status: t.status,
    priority: t.priority
  }));
}
async function resetTodos() {
  await clearTodos();
}
async function executeTodoWrite(todos) {
  if (!Array.isArray(todos) || todos.length === 0) {
    return 'Usage: Provide a non-empty array of todo items, each with:\n  - content: description of the task\n  - status: "pending" | "in_progress" | "completed" | "cancelled"\n  - priority: "high" | "medium" | "low"';
  }
  const validStatuses = /* @__PURE__ */ new Set(["pending", "in_progress", "completed", "cancelled"]);
  const validPriorities = /* @__PURE__ */ new Set(["high", "medium", "low"]);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const existing = await loadTodos();
  const existingMap = new Map(existing.map((t) => [t.content, t]));
  const items = todos.map((t) => ({
    content: String(t.content ?? ""),
    status: validStatuses.has(t.status) ? t.status : "pending",
    priority: validPriorities.has(t.priority) ? t.priority : "medium",
    createdAt: existingMap.get(t.content)?.createdAt ?? now,
    updatedAt: now
  }));
  await saveTodos(items);
  const active = items.filter((t) => t.status === "pending" || t.status === "in_progress");
  const done = items.filter((t) => t.status === "completed");
  const cancelled = items.filter((t) => t.status === "cancelled");
  let out = `Todos saved (${items.length}: ${active.length} active, ${done.length} done, ${cancelled.length} cancelled)`;
  if (active.length > 0) {
    out += "\n\nActive:";
    for (const t of active) {
      out += `
  ${t.status === "in_progress" ? "\u2192" : "\xB7"} ${t.content} (${t.priority})`;
    }
  }
  return out;
}

// src/version.ts
var VERSION = "0.7.0";

// src/tools/WebFetchTool.ts
async function executeWebFetch(url, format) {
  if (!url || typeof url !== "string") {
    throw new Error(invalidParam("url", "a non-empty URL string"));
  }
  let parsed;
  try {
    parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error(netError(url, `Unsupported protocol: ${parsed.protocol}`));
    }
  } catch {
    throw new Error(netError(url, "Invalid URL"));
  }
  const outputFormat = format === "html" ? "html" : "text";
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15e3);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": `CodeYang/${VERSION} (AI Coding Agent)`,
        Accept: outputFormat === "html" ? "text/html" : "text/plain, text/html"
      }
    });
    clearTimeout(timeout);
    if (!response.ok) {
      throw new Error(netError(url, `HTTP ${response.status}: ${response.statusText}`));
    }
    const contentType = response.headers.get("content-type") || "";
    const html = await response.text();
    const isHtml = contentType.includes("text/html") || /<html[\s>]/i.test(html) || /<!doctype\s+html/i.test(html);
    if (isHtml && outputFormat === "text") {
      let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<head[^>]*>[\s\S]*?<\/head>/gi, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").replace(/\n\s*\n/g, "\n").trim();
      if (text.length > 1e5) {
        text = text.slice(0, 1e5) + "\n\n[Content truncated at 100000 characters]";
      }
      return text;
    }
    if (html.length > 1e5) {
      return html.slice(0, 1e5) + "\n\n[Content truncated at 100000 characters]";
    }
    return html;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        toolError("Network", `Request timed out after 15s: ${url}`, "The server may be slow or unreachable.")
      );
    }
    throw err;
  }
}

// src/tools/SearchTool.ts
var path = __toESM(require("path"), 1);
var import_node_fs = require("fs");

// src/utils/projectIndex.ts
var import_promises7 = require("fs/promises");
var import_node_path5 = require("path");
var index = null;
var REBUILD_INTERVAL_MS = 6e4;
var EXCLUDE = /* @__PURE__ */ new Set([
  "node_modules",
  ".git",
  "dist",
  ".cache",
  "build",
  "target",
  "__pycache__",
  ".venv",
  ".next",
  ".turbo",
  "coverage"
]);
async function walkDir(dir, base) {
  const entries = [];
  try {
    const dirEntries = await (0, import_promises7.readdir)(dir, { withFileTypes: true });
    for (const entry of dirEntries) {
      if (EXCLUDE.has(entry.name) || entry.name.startsWith(".")) continue;
      const full = (0, import_node_path5.join)(dir, entry.name);
      if (entry.isDirectory()) {
        entries.push(...await walkDir(full, base));
      } else {
        entries.push((0, import_node_path5.relative)(base, full));
      }
    }
  } catch {
  }
  return entries;
}
async function getProjectIndex(root) {
  const projectRoot = root || process.cwd();
  if (index && Date.now() - index.lastBuilt < REBUILD_INTERVAL_MS) {
    return index;
  }
  const files = await walkDir(projectRoot, projectRoot);
  index = { files, lastBuilt: Date.now() };
  return index;
}

// src/tools/SearchTool.ts
async function executeSearch(query, rootDir = process.cwd(), options = {}) {
  const { maxResults = 20, includeGlob, searchContent = true, searchNames = true, caseSensitive = false } = options;
  if (!query.trim()) return "Error: query cannot be empty";
  if (!(0, import_node_fs.existsSync)(rootDir)) return `Error: directory not found: ${rootDir}`;
  const results = [];
  if (searchNames) {
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = caseSensitive ? new RegExp(escaped) : new RegExp(escaped, "i");
    try {
      const idx = await getProjectIndex(rootDir);
      for (const filePath of idx.files) {
        if (!filePath.toLowerCase().includes(query.toLowerCase())) continue;
        const base = path.basename(filePath);
        if (re.test(base)) {
          results.push({ type: "name", path: filePath });
          if (results.length >= maxResults) break;
        }
      }
    } catch {
    }
  }
  if (searchContent && results.length < maxResults) {
    try {
      const grepOut = await executeGrep(query, includeGlob, rootDir, 0);
      if (grepOut && grepOut !== "(no matches)") {
        let currentFile = "";
        for (const line of grepOut.split("\n")) {
          if (results.length >= maxResults) break;
          if (!line.trim()) continue;
          const rgMatch = line.match(/^(.+?):(\d+):(.*)$/);
          if (rgMatch) {
            const [, filePath, lineNum, snippet] = rgMatch;
            const absPath = path.isAbsolute(filePath) ? filePath : path.join(rootDir, filePath);
            if (!results.find((r) => r.path === absPath && r.type === "name")) {
              results.push({ type: "content", path: absPath, line: Number(lineNum), snippet: snippet.trim() });
            }
            continue;
          }
          const lineMatch = line.match(/^(\d+)[: ]\s*(.*)/);
          if (lineMatch && currentFile) {
            const absPath = path.isAbsolute(currentFile) ? currentFile : path.join(rootDir, currentFile);
            if (!results.find((r) => r.path === absPath && r.type === "name")) {
              results.push({
                type: "content",
                path: absPath,
                line: Number(lineMatch[1]),
                snippet: lineMatch[2].trim()
              });
            }
          } else if (!line.startsWith(" ") && !line.match(/^\d/)) {
            currentFile = line.trim();
          }
        }
      }
    } catch {
    }
  }
  if (results.length === 0) return `No results found for: ${query}`;
  const lines = [`Search: "${query}" in ${rootDir}`, `Found ${results.length} result(s):`, ""];
  const nameMatches = results.filter((r) => r.type === "name");
  const contentMatches = results.filter((r) => r.type === "content");
  if (nameMatches.length > 0) {
    lines.push(`## File name matches (${nameMatches.length})`);
    for (const r of nameMatches) lines.push(`  ${r.path}`);
    lines.push("");
  }
  if (contentMatches.length > 0) {
    lines.push(`## Content matches (${contentMatches.length})`);
    for (const r of contentMatches) {
      lines.push(`  ${r.path}:${r.line}  ${r.snippet?.slice(0, 120) ?? ""}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

// src/tools/ImageTool.ts
var fs = __toESM(require("fs/promises"), 1);
var path2 = __toESM(require("path"), 1);
var IMAGE_SIGNATURES = [
  { ext: "png", mime: "image/png", magic: Buffer.from([137, 80, 78, 71]) },
  { ext: "jpg", mime: "image/jpeg", magic: Buffer.from([255, 216, 255]) },
  { ext: "gif", mime: "image/gif", magic: Buffer.from([71, 73, 70, 56]) },
  { ext: "webp", mime: "image/webp", magic: Buffer.from([82, 73, 70, 70]) },
  { ext: "bmp", mime: "image/bmp", magic: Buffer.from([66, 77]) },
  { ext: "ico", mime: "image/x-icon", magic: Buffer.from([0, 0, 1, 0]) }
];
function detectFormat(buf) {
  for (const sig of IMAGE_SIGNATURES) {
    if (buf.subarray(0, sig.magic.length).equals(sig.magic)) {
      return { ext: sig.ext, mime: sig.mime };
    }
  }
  return null;
}
function readDimensions(buf, fmt) {
  try {
    if (fmt === "png") {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    if (fmt === "jpg") {
      let i = 2;
      while (i < buf.length - 8) {
        if (buf[i] !== 255) break;
        const marker = buf[i + 1];
        const segLen = buf.readUInt16BE(i + 2);
        if (marker === 192 || marker === 194) {
          return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
        }
        i += 2 + segLen;
      }
    }
    if (fmt === "gif") {
      return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
    }
    if (fmt === "webp") {
      if (buf.length > 30 && buf.subarray(12, 16).toString("ascii") === "VP8 ") {
        return {
          width: (buf.readUInt16LE(26) & 16383) + 1,
          height: (buf.readUInt16LE(28) & 16383) + 1
        };
      }
    }
  } catch {
  }
  return null;
}
async function executeImageInfo(filePath) {
  try {
    const absPath = resolveSafePath(filePath);
    const stats = await fs.stat(absPath);
    const fd = await fs.open(absPath, "r");
    try {
      const header = Buffer.alloc(64);
      await fd.read(header, 0, 64, 0);
      const fmt = detectFormat(header);
      const dims = fmt ? readDimensions(header, fmt.ext) : null;
      const lines = [
        `File: ${absPath}`,
        `Size: ${stats.size} bytes (${(stats.size / 1024).toFixed(1)} KB)`,
        `Format: ${fmt ? `${fmt.ext.toUpperCase()} (${fmt.mime})` : "unknown"}`
      ];
      if (dims) lines.push(`Dimensions: ${dims.width} \xD7 ${dims.height} px`);
      lines.push(`Modified: ${stats.mtime.toISOString()}`);
      return lines.join("\n");
    } finally {
      await fd.close();
    }
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
async function executeImageToBase64(filePath, maxBytes = 5242880) {
  try {
    const absPath = resolveSafePath(filePath);
    const stats = await fs.stat(absPath);
    if (stats.size > maxBytes) {
      return `Error: file too large (${(stats.size / 1024 / 1024).toFixed(1)} MB > ${maxBytes / 1024 / 1024} MB limit)`;
    }
    const buf = await fs.readFile(absPath);
    const fmt = detectFormat(buf);
    const mime = fmt?.mime ?? "application/octet-stream";
    const b64 = buf.toString("base64");
    return `data:${mime};base64,${b64}`;
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
async function executeListImages(dirPath) {
  try {
    const absDir = resolveSafePath(dirPath);
    const IMAGE_EXTS = /* @__PURE__ */ new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".ico", ".svg", ".tiff", ".tif"]);
    const entries = await fs.readdir(absDir, { withFileTypes: true });
    const images = entries.filter((e) => e.isFile() && IMAGE_EXTS.has(path2.extname(e.name).toLowerCase())).map((e) => e.name);
    if (images.length === 0) return `No image files found in: ${absDir}`;
    return [`Images in ${absDir} (${images.length}):`, ...images.map((n) => `  ${n}`)].join("\n");
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// src/tools/shared.ts
function resolveSafePath(inputPath, cwd) {
  const base = cwd || process.cwd();
  const resolved = (0, import_node_path6.resolve)(base, inputPath);
  const sandbox = process.env["CODEX_SANDBOX"];
  if (!sandbox) return resolved;
  if (process.env["CODEYANG_NO_SANDBOX"] === "true") return resolved;
  const absSandbox = (0, import_node_path6.resolve)(sandbox);
  if (resolved === absSandbox) return resolved;
  let real = resolved;
  try {
    real = (0, import_node_fs2.realpathSync)(resolved);
  } catch {
  }
  const sandboxSep = absSandbox.endsWith(import_node_path6.sep) ? absSandbox : absSandbox + import_node_path6.sep;
  const isInsideSandbox = real.startsWith(sandboxSep) || real === absSandbox;
  const allowDrives = (process.env["CODEYANG_ALLOW_DRIVES"] || "").split(",").map((d) => d.trim().replace(/:?$/, "").toUpperCase()).filter(Boolean);
  if (allowDrives.length > 0) {
    const drive = resolved.charAt(0).toUpperCase();
    if (allowDrives.includes(drive)) {
      if (!isInsideSandbox) {
        throw new Error(
          toolError(
            "Security",
            `Path traversal blocked: "${inputPath}" is on whitelisted drive ${drive}: but outside sandbox (${absSandbox})`,
            `Whitelisted drives still enforce sandbox boundaries.`
          )
        );
      }
      return resolved;
    }
  }
  if (!isInsideSandbox) {
    throw new Error(
      toolError(
        "Security",
        `Path traversal blocked: "${inputPath}" resolves outside sandbox (${absSandbox})`,
        `To allow: set CODEYANG_NO_SANDBOX=true or CODEYANG_ALLOW_DRIVES=E,F,... (Windows) to whitelist drives.`
      )
    );
  }
  return resolved;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  executeEdit,
  executeGlob,
  executeGrep,
  executeImageInfo,
  executeImageToBase64,
  executeListImages,
  executeRead,
  executeSearch,
  executeTodoWrite,
  executeWebFetch,
  executeWrite,
  getTodos,
  matchGlob,
  resetTodos,
  resolveSafePath
});
//# sourceMappingURL=tools.cjs.map