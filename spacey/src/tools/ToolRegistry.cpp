#include "spacey/ToolRegistry.h"
#include <stdexcept>

namespace spacey {

ToolRegistry& ToolRegistry::instance() {
    static ToolRegistry instance;
    return instance;
}

void ToolRegistry::registerTool(const std::string& name,
                                const std::string& description,
                                const std::string& schema,
                                ToolFunction func) {
    schemas_[name] = ToolSchema{name, description, schema};
    functions_[name] = func;
}

std::string ToolRegistry::executeTool(const std::string& name, const std::string& input) {
    auto it = functions_.find(name);
    if (it == functions_.end()) {
        throw std::runtime_error("Tool not found: " + name);
    }

    try {
        return it->second(input);
    } catch (const std::exception& e) {
        return std::string("{\"error\": \"") + e.what() + "\"}";
    }
}

std::vector<ToolSchema> ToolRegistry::getAllSchemas() const {
    std::vector<ToolSchema> result;
    for (const auto& [name, schema] : schemas_) {
        result.push_back(schema);
    }
    return result;
}

bool ToolRegistry::hasTool(const std::string& name) const {
    return functions_.find(name) != functions_.end();
}

} // namespace spacey
