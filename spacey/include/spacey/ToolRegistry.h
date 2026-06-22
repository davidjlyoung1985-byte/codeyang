#pragma once

#include <string>
#include <map>
#include <functional>
#include <memory>

namespace spacey {

// Tool function signature: input JSON -> output JSON
using ToolFunction = std::function<std::string(const std::string& input)>;

struct ToolSchema {
    std::string name;
    std::string description;
    std::string parametersSchema; // JSON schema
};

class ToolRegistry {
public:
    static ToolRegistry& instance();

    // Register a tool
    void registerTool(const std::string& name,
                     const std::string& description,
                     const std::string& schema,
                     ToolFunction func);

    // Execute a tool
    std::string executeTool(const std::string& name, const std::string& input);

    // Get all tool schemas for LLM
    std::vector<ToolSchema> getAllSchemas() const;

    // Check if tool exists
    bool hasTool(const std::string& name) const;

private:
    ToolRegistry() = default;

    std::map<std::string, ToolSchema> schemas_;
    std::map<std::string, ToolFunction> functions_;
};

} // namespace spacey
