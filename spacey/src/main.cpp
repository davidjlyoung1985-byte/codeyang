#include <QApplication>
#include <QMainWindow>
#include <QVBoxLayout>
#include <QTextEdit>
#include <QLineEdit>
#include <QPushButton>
#include <QLabel>
#include "spacey/Agent.h"
#include "spacey/ToolRegistry.h"

extern void registerFileTools();

class SpaceYWindow : public QMainWindow {
    Q_OBJECT

public:
    SpaceYWindow(QWidget* parent = nullptr) : QMainWindow(parent) {
        setWindowTitle("SpaceY - AI Coding Agent");
        resize(1000, 700);

        // Central widget
        auto* central = new QWidget(this);
        setCentralWidget(central);

        auto* layout = new QVBoxLayout(central);

        // Chat display
        chatDisplay_ = new QTextEdit(this);
        chatDisplay_->setReadOnly(true);
        chatDisplay_->setStyleSheet(
            "QTextEdit { background-color: #1e1e1e; color: #d4d4d4; "
            "font-family: 'Consolas', monospace; font-size: 14px; }"
        );
        layout->addWidget(chatDisplay_);

        // Status label
        statusLabel_ = new QLabel("Ready", this);
        statusLabel_->setStyleSheet("color: #4ec9b0;");
        layout->addWidget(statusLabel_);

        // Input area
        auto* inputLayout = new QHBoxLayout();

        inputField_ = new QLineEdit(this);
        inputField_->setPlaceholderText("Enter your message...");
        inputField_->setStyleSheet(
            "QLineEdit { background-color: #2d2d2d; color: #d4d4d4; "
            "padding: 8px; border: 1px solid #3e3e3e; }"
        );
        inputLayout->addWidget(inputField_);

        sendButton_ = new QPushButton("Send", this);
        sendButton_->setStyleSheet(
            "QPushButton { background-color: #0e639c; color: white; "
            "padding: 8px 20px; border: none; }"
            "QPushButton:hover { background-color: #1177bb; }"
        );
        inputLayout->addWidget(sendButton_);

        layout->addLayout(inputLayout);

        // Connect signals
        connect(sendButton_, &QPushButton::clicked, this, &SpaceYWindow::onSendMessage);
        connect(inputField_, &QLineEdit::returnPressed, this, &SpaceYWindow::onSendMessage);

        // Initialize agent
        std::string apiKey = std::getenv("SPACEY_API_KEY")
            ? std::getenv("SPACEY_API_KEY")
            : "";

        if (apiKey.empty()) {
            appendMessage("System", "⚠️ SPACEY_API_KEY not set. Please set your API key.");
        }

        agent_ = std::make_unique<spacey::Agent>(apiKey);

        // Register tools
        registerFileTools();

        appendMessage("SpaceY", "👋 Hello! I'm SpaceY, your AI coding assistant.\n"
                                "I can help you with:\n"
                                "• Reading and writing files\n"
                                "• Running shell commands\n"
                                "• Code analysis\n"
                                "• Git operations\n"
                                "\nWhat would you like me to do?");
    }

private slots:
    void onSendMessage() {
        QString userText = inputField_->text().trimmed();
        if (userText.isEmpty()) return;

        appendMessage("You", userText.toStdString());
        inputField_->clear();
        sendButton_->setEnabled(false);
        statusLabel_->setText("Thinking...");

        // Send to agent
        spacey::AgentCallbacks callbacks;
        callbacks.onAgentDelta = [this](const std::string& delta) {
            QMetaObject::invokeMethod(this, [this, delta]() {
                appendText(delta);
            }, Qt::QueuedConnection);
        };

        callbacks.onToolStart = [this](const std::string& name, const std::string& args) {
            QMetaObject::invokeMethod(this, [this, name]() {
                statusLabel_->setText(QString("Executing: %1").arg(QString::fromStdString(name)));
            }, Qt::QueuedConnection);
        };

        callbacks.onToolResult = [this](const std::string& name, const std::string& result, bool isError) {
            QMetaObject::invokeMethod(this, [this, name, result, isError]() {
                std::string icon = isError ? "❌" : "✅";
                appendMessage("Tool: " + name, icon + " " + result);
            }, Qt::QueuedConnection);
        };

        callbacks.onError = [this](const std::string& error) {
            QMetaObject::invokeMethod(this, [this, error]() {
                appendMessage("Error", "❌ " + error);
            }, Qt::QueuedConnection);
        };

        // Run in separate thread
        std::thread([this, userText = userText.toStdString(), callbacks]() {
            agent_->sendMessage(userText, callbacks);

            QMetaObject::invokeMethod(this, [this]() {
                sendButton_->setEnabled(true);
                statusLabel_->setText("Ready");
            }, Qt::QueuedConnection);
        }).detach();
    }

private:
    void appendMessage(const std::string& sender, const std::string& message) {
        QString html = QString("<div style='margin: 10px 0;'>"
                              "<b style='color: #4ec9b0;'>%1:</b> "
                              "<span style='color: #d4d4d4;'>%2</span>"
                              "</div>")
            .arg(QString::fromStdString(sender))
            .arg(QString::fromStdString(message).toHtmlEscaped());

        chatDisplay_->append(html);
        chatDisplay_->verticalScrollBar()->setValue(
            chatDisplay_->verticalScrollBar()->maximum()
        );
    }

    void appendText(const std::string& text) {
        chatDisplay_->insertPlainText(QString::fromStdString(text));
        chatDisplay_->verticalScrollBar()->setValue(
            chatDisplay_->verticalScrollBar()->maximum()
        );
    }

    QTextEdit* chatDisplay_;
    QLineEdit* inputField_;
    QPushButton* sendButton_;
    QLabel* statusLabel_;
    std::unique_ptr<spacey::Agent> agent_;
};

int main(int argc, char* argv[]) {
    QApplication app(argc, argv);

    SpaceYWindow window;
    window.show();

    return app.exec();
}

#include "main.moc"
