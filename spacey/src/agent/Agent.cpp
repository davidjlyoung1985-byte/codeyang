#include "spacey/Agent.h"
#include "spacey/LLMClient.h"
#include "spacey/ToolRegistry.h"
#include <nlohmann/json.hpp>

using json = nlohmann::json;

namespace spacey {

Agent::Agent(const std::string& apiKey, const std::string& model, const std::string& baseUrl)
    : client_(std::make_unique<LLMClient>(apiKey, baseUrl))
    , tools_(std::make_unique<ToolRegistry>())
{
    systemPrompt_ = R"(You are SpaceY, an AI coding assistant for Windows.
You have access to tools for file operations, shell commands, code analysis, and more.
When the user asks you to do something, use the appropriate tools to accomplish the task.
Always explain what you're doing and show the results.)";
}

Agent::~Agent() = default;

void Agent::sendMessage(const std::string& userMessage, AgentCallbacks callbacks) {
    callbacks_ = callbacks;
    stopRequested_ = false;

    // Add user message to history
    Message msg;
    msg.role = Message::Role::User;
    msg.content = userMessage;
    history_.push_back(msg);

    // Build request payload
    json messages = json::array();

    // System prompt
    messages.push_back({
        {"role", "system"},
        {"content", systemPrompt_}
    });

    // Conversation history
    for (const auto& m : history_) {
        std::string role;
        switch (m.role) {
            case Message::Role::User: role = "user"; break;
            case Message::Role::Assistant: role = "assistant"; break;
            case Message::Role::System: role = "system"; break;
        }
        messages.push_back({
            {"role", role},
            {"content", m.content}
        });
    }

    // Add tool schemas
    auto toolSchemas = ToolRegistry::instance().getAllSchemas();
    json tools = json::array();
    for (const auto& schema : toolSchemas) {
        tools.push_back({
            {"type", "function"},
            {"function", {
                {"name", schema.name},
                {"description", schema.description},
                {"parameters", json::parse(schema.parametersSchema)}
            }}
        });
    }

    json payload = {
        {"model", "deepseek-chat"},
        {"messages", messages},
        {"tools", tools},
        {"stream", true}
    };

    // Send streaming request
    std::string assistantResponse;
    client_->sendStreamingRequest(payload.dump(), [&](const std::string& delta) {
        if (stopRequested_) {
            client_->cancel();
            return;
        }

        assistantResponse += delta;
        if (callbacks_.onAgentDelta) {
            callbacks_.onAgentDelta(delta);
        }
    });

    // Add assistant response to history
    Message assistantMsg;
    assistantMsg.role = Message::Role::Assistant;
    assistantMsg.content = assistantResponse;
    history_.push_back(assistantMsg);

    // Process any tool calls
    processToolCalls(assistantResponse);
}

void Agent::processToolCalls(const std::string& response) {
    // Parse response for tool calls
    // This is simplified - actual implementation needs proper JSON parsing
    // of OpenAI function calling format
    try {
        auto j = json::parse(response);
        if (j.contains("tool_calls")) {
            for (const auto& call : j["tool_calls"]) {
                std::string toolName = call["function"]["name"];
                std::string toolInput = call["function"]["arguments"].dump();

                if (callbacks_.onToolStart) {
                    callbacks_.onToolStart(toolName, toolInput);
                }

                // Execute tool
                std::string result = ToolRegistry::instance().executeTool(toolName, toolInput);

                if (callbacks_.onToolResult) {
                    callbacks_.onToolResult(toolName, result, false);
                }
            }
        }
    } catch (const std::exception& e) {
        if (callbacks_.onError) {
            callbacks_.onError(std::string("Tool processing error: ") + e.what());
        }
    }
}

void Agent::stop() {
    stopRequested_ = true;
}

void Agent::clearHistory() {
    history_.clear();
}

void Agent::setSystemPrompt(const std::string& prompt) {
    systemPrompt_ = prompt;
}

} // namespace spacey
