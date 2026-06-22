#include "spacey/ToolRegistry.h"
#include <nlohmann/json.hpp>
#include <fstream>
#include <sstream>
#include <filesystem>
#include <iostream>

using json = nlohmann::json;
namespace fs = std::filesystem;

namespace spacey {

// Read file tool
std::string readFileTool(const std::string& input) {
    auto j = json::parse(input);
    std::string path = j["file_path"];

    std::ifstream file(path);
    if (!file) {
        return json{{"error", "File not found: " + path}}.dump();
    }

    std::stringstream buffer;
    buffer << file.rdbuf();

    return json{
        {"content", buffer.str()},
        {"path", path}
    }.dump();
}

// Write file tool
std::string writeFileTool(const std::string& input) {
    auto j = json::parse(input);
    std::string path = j["file_path"];
    std::string content = j["content"];

    // Create parent directories if needed
    fs::path filePath(path);
    fs::create_directories(filePath.parent_path());

    std::ofstream file(path);
    if (!file) {
        return json{{"error", "Cannot write to file: " + path}}.dump();
    }

    file << content;

    return json{
        {"success", true},
        {"path", path},
        {"bytes_written", content.size()}
    }.dump();
}

// List directory tool
std::string listDirectoryTool(const std::string& input) {
    auto j = json::parse(input);
    std::string path = j["path"];

    json result = json::array();

    try {
        for (const auto& entry : fs::directory_iterator(path)) {
            result.push_back({
                {"name", entry.path().filename().string()},
                {"type", entry.is_directory() ? "directory" : "file"},
                {"size", entry.is_regular_file() ? entry.file_size() : 0}
            });
        }
    } catch (const fs::filesystem_error& e) {
        return json{{"error", e.what()}}.dump();
    }

    return json{{"entries", result}}.dump();
}

// Execute shell command tool
std::string executeShellTool(const std::string& input) {
    auto j = json::parse(input);
    std::string command = j["command"];

    // Security: basic validation
    if (command.find("rm -rf /") != std::string::npos ||
        command.find("format") != std::string::npos) {
        return json{{"error", "Command blocked for safety"}}.dump();
    }

    FILE* pipe = _popen(command.c_str(), "r");
    if (!pipe) {
        return json{{"error", "Failed to execute command"}}.dump();
    }

    std::string output;
    char buffer[256];
    while (fgets(buffer, sizeof(buffer), pipe) != nullptr) {
        output += buffer;
    }

    int exitCode = _pclose(pipe);

    return json{
        {"output", output},
        {"exit_code", exitCode}
    }.dump();
}

// Register all file tools
void registerFileTools() {
    auto& registry = ToolRegistry::instance();

    registry.registerTool(
        "Read",
        "Read the contents of a file",
        R"({
            "type": "object",
            "properties": {
                "file_path": {"type": "string", "description": "Path to the file"}
            },
            "required": ["file_path"]
        })",
        readFileTool
    );

    registry.registerTool(
        "Write",
        "Write content to a file",
        R"({
            "type": "object",
            "properties": {
                "file_path": {"type": "string", "description": "Path to the file"},
                "content": {"type": "string", "description": "Content to write"}
            },
            "required": ["file_path", "content"]
        })",
        writeFileTool
    );

    registry.registerTool(
        "List",
        "List files in a directory",
        R"({
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Directory path"}
            },
            "required": ["path"]
        })",
        listDirectoryTool
    );

    registry.registerTool(
        "Bash",
        "Execute a shell command",
        R"({
            "type": "object",
            "properties": {
                "command": {"type": "string", "description": "Command to execute"}
            },
            "required": ["command"]
        })",
        executeShellTool
    );
}

} // namespace spacey
