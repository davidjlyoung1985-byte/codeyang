#include "spacey/LLMClient.h"
#include <curl/curl.h>
#include <nlohmann/json.hpp>
#include <iostream>

using json = nlohmann::json;

namespace spacey {

// Callback for curl to write response data
static size_t WriteCallback(void* contents, size_t size, size_t nmemb, std::string* userp) {
    size_t totalSize = size * nmemb;
    userp->append((char*)contents, totalSize);
    return totalSize;
}

LLMClient::LLMClient(const std::string& apiKey, const std::string& baseUrl)
    : apiKey_(apiKey), baseUrl_(baseUrl) {
    curl_global_init(CURL_GLOBAL_DEFAULT);
}

LLMClient::~LLMClient() {
    curl_global_cleanup();
}

LLMClient::Response LLMClient::sendRequest(const std::string& jsonPayload) {
    CURL* curl = curl_easy_init();
    Response response;

    if (!curl) {
        response.isError = true;
        response.content = "Failed to initialize CURL";
        return response;
    }

    std::string responseData;
    std::string url = baseUrl_ + "/chat/completions";

    struct curl_slist* headers = nullptr;
    headers = curl_slist_append(headers, "Content-Type: application/json");
    std::string authHeader = "Authorization: Bearer " + apiKey_;
    headers = curl_slist_append(headers, authHeader.c_str());

    curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
    curl_easy_setopt(curl, CURLOPT_POSTFIELDS, jsonPayload.c_str());
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, WriteCallback);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &responseData);

    CURLcode res = curl_easy_perform(curl);

    if (res != CURLE_OK) {
        response.isError = true;
        response.content = curl_easy_strerror(res);
    } else {
        long httpCode = 0;
        curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &httpCode);
        response.statusCode = static_cast<int>(httpCode);
        response.content = responseData;
        response.isError = (httpCode < 200 || httpCode >= 300);
    }

    curl_slist_free_all(headers);
    curl_easy_cleanup(curl);

    return response;
}

void LLMClient::sendStreamingRequest(const std::string& jsonPayload, StreamCallback callback) {
    CURL* curl = curl_easy_init();
    if (!curl) {
        callback("{\"error\": \"Failed to initialize CURL\"}");
        return;
    }

    std::string url = baseUrl_ + "/chat/completions";

    struct curl_slist* headers = nullptr;
    headers = curl_slist_append(headers, "Content-Type: application/json");
    std::string authHeader = "Authorization: Bearer " + apiKey_;
    headers = curl_slist_append(headers, authHeader.c_str());

    // Streaming callback
    auto streamCallback = [](char* ptr, size_t size, size_t nmemb, void* userdata) -> size_t {
        size_t totalSize = size * nmemb;
        auto* cb = static_cast<StreamCallback*>(userdata);

        std::string chunk(ptr, totalSize);

        // Parse SSE format: "data: {...}\n\n"
        if (chunk.find("data: ") == 0) {
            std::string jsonStr = chunk.substr(6);
            if (jsonStr.find("[DONE]") == std::string::npos) {
                try {
                    auto j = json::parse(jsonStr);
                    if (j.contains("choices") && !j["choices"].empty()) {
                        auto& choice = j["choices"][0];
                        if (choice.contains("delta") && choice["delta"].contains("content")) {
                            std::string content = choice["delta"]["content"];
                            (*cb)(content);
                        }
                    }
                } catch (...) {
                    // Ignore parse errors in streaming
                }
            }
        }

        return totalSize;
    };

    curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
    curl_easy_setopt(curl, CURLOPT_POSTFIELDS, jsonPayload.c_str());
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, streamCallback);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &callback);

    CURLcode res = curl_easy_perform(curl);

    if (res != CURLE_OK && !cancelled_) {
        callback(std::string("{\"error\": \"") + curl_easy_strerror(res) + "\"}");
    }

    curl_slist_free_all(headers);
    curl_easy_cleanup(curl);
    cancelled_ = false;
}

void LLMClient::cancel() {
    cancelled_ = true;
}

} // namespace spacey
