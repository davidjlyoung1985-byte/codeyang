// html_dom.h — DOM 数据结构契约（子代理共享接口）
// 所有子代理必须遵守此头文件定义的结构，禁止修改。
#pragma once
#include <string>
#include <vector>
#include <map>

namespace miniweb {

// 一个 HTML 元素节点（仅支持元素与文本两类）
struct HtmlNode {
    std::string tag;                 // 元素名小写；若为文本节点则为空字符串 ""，text 存内容
    std::string text;                // 文本内容（元素节点为空）
    std::map<std::string, std::string> attrs;  // 元素属性
    std::vector<HtmlNode> children;  // 子节点
};

// 解析 HTML 字符串为 DOM 树（html_parser.cpp 实现）
HtmlNode parseHtml(const std::string& html);

// 遍历时忽略这些不可见/不渲染元素（render.cpp 使用）
bool isVoidOrHiddenTag(const std::string& tag);

} // namespace miniweb
