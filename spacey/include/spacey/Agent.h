#pragma once

#include <string>
#include <vector>
#include <memory>
#include <functional>

namespace spacey {

// Message types
struct Message {
    enum class Role { User, Assistant, System };

    Role role;
    std::string content;
    std::vector<std::string> toolCalls;  // JSON strings
    std::vector<std::string> toolResults; // JSON strings
};

// Agent callbacks for UI updates
struct AgentCallbacks {
    std::function<void(const std::string&)> onAgentText;
    std::function<void(const std::string&)> onAgentDelta;
    std::function<void(const std::string&, const std::string&)> onToolStart;
    std::function<void(const std::string&, const std::string&, bool)> onToolResult;
    std::function<void(const std::string&)> onError;
};

class LLMClient;
class ToolRegistry;

class Agent {
public:
    Agent(const std::string& apiKey,
          const std::string& model = "deepseek-chat",
          const std::string& baseUrl = "https://api.deepseek.com/v1");
    ~Agent();

    // Send user message and get response
    void sendMessage(const std::string& userMessage, AgentCallbacks callbacks);

    // Stop current request
    void stop();

    // Clear conversation history
    void clearHistory();

    // Get conversation history
    const std::vector<Message>& getHistory() const { return history_; }

    // Set system prompt
    void setSystemPrompt(const std::string& prompt);

private:
    void processToolCalls(const std::string& response);
    void executeTools();

    std::unique_ptr<LLMClient> client_;
    std::unique_ptr<ToolRegistry> tools_;
    std::vector<Message> history_;
    std::string systemPrompt_;
    AgentCallbacks callbacks_;
    bool stopRequested_ = false;
};

} // namespace spacey
