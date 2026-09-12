// network.h — HTTP 网络抓取契约（network.cpp 实现）
// 使用系统 Winsock（Windows），无第三方依赖。
#pragma once
#include <string>

namespace miniweb {

// 从 url 抓取内容，返回响应体（UTF-8 原始字节）。
// 成功：返回 body 字符串。失败：抛出 std::runtime_error 带错误描述。
// 仅支持 http:// 与 https://（https 可用基础实现或返回清晰错误）。
std::string httpGet(const std::string& url);

// 辅助：从 url 中提取 host（网络模块内部使用，也供其它模块测试用）。
std::string extractHost(const std::string& url);
// 辅助：从 url 中提取路径（默认 "/"）。
std::string extractPath(const std::string& url);

} // namespace miniweb
