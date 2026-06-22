#pragma once

#include <string>
#include <functional>
#include <map>

namespace spacey {

class LLMClient {
public:
    struct Response {
        std::string content;
        bool isError = false;
        int statusCode = 0;
    };

    using StreamCallback = std::function<void(const std::string& delta)>;

    LLMClient(const std::string& apiKey, const std::string& baseUrl);
    ~LLMClient();

    // Non-streaming request
    Response sendRequest(const std::string& jsonPayload);

    // Streaming request
    void sendStreamingRequest(const std::string& jsonPayload, StreamCallback callback);

    // Cancel current request
    void cancel();

private:
    std::string apiKey_;
    std::string baseUrl_;
    bool cancelled_ = false;
};

} // namespace spacey
