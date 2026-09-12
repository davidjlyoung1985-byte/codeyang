// render.h — 终端渲染契约（render.cpp 实现）
#pragma once
#include <string>
#include "html_dom.h"

namespace miniweb {

// 把 DOM 树渲染为适合终端阅读的纯文本（无 ANSI 色或含基础 ANSI 均可，但必须可读）。
// 标题输出为大写/装饰行，段落换行，链接显示为 [text](href)。
std::string renderToText(const HtmlNode& root);

// 供命令行展示用的简单分隔线
std::string renderSeparator();

} // namespace miniweb
