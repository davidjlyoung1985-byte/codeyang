// browser.h — 主程序入口契约（main.cpp 实现）
#pragma once
#include <string>
#include "html_dom.h"

namespace miniweb {

// 从 URL 抓取并渲染为可读文本（失败返回错误描述，不抛异常）
std::string fetchAndRender(const std::string& url);

// 从本地 HTML 文件读取并渲染为可读文本（供离线测试）
std::string renderHtmlFile(const std::string& filePath);

} // namespace miniweb
