import React, { useState, useEffect, useRef } from 'react';
import './App.css';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

interface ToolCall {
  toolName: string;
  timestamp: number;
}

function App() {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Connect to WebSocket server
    const websocket = new WebSocket('ws://localhost:3000');

    websocket.onopen = () => {
      console.log('Connected to server');
      setConnected(true);
    };

    websocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case 'connected':
            setMessages((prev) => [
              ...prev,
              { role: 'system', content: data.message, timestamp: Date.now() },
            ]);
            break;

          case 'assistant_text':
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.role === 'assistant') {
                // Append to last assistant message
                return [
                  ...prev.slice(0, -1),
                  { ...last, content: last.content + data.text },
                ];
              } else {
                // New assistant message
                return [...prev, { role: 'assistant', content: data.text, timestamp: Date.now() }];
              }
            });
            break;

          case 'tool_call':
            setToolCalls((prev) => [...prev, { toolName: data.toolName, timestamp: Date.now() }]);
            break;

          case 'tool_result':
            // Could display tool results in a separate panel
            console.log(`Tool ${data.toolName} result:`, data.result);
            break;

          case 'status':
            if (data.status === 'completed') {
              setLoading(false);
              setToolCalls([]);
            } else if (data.status === 'cancelled') {
              setLoading(false);
              setMessages((prev) => [
                ...prev,
                { role: 'system', content: 'Execution cancelled', timestamp: Date.now() },
              ]);
            } else if (data.status === 'reset') {
              setMessages([]);
              setToolCalls([]);
            }
            break;

          case 'error':
            setLoading(false);
            setMessages((prev) => [
              ...prev,
              { role: 'system', content: `Error: ${data.error}`, timestamp: Date.now() },
            ]);
            break;
        }
      } catch (err) {
        console.error('Failed to parse message:', err);
      }
    };

    websocket.onclose = () => {
      console.log('Disconnected from server');
      setConnected(false);
    };

    websocket.onerror = (err) => {
      console.error('WebSocket error:', err);
      setConnected(false);
    };

    setWs(websocket);

    return () => {
      websocket.close();
    };
  }, []);

  useEffect(() => {
    // Auto-scroll to bottom
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!ws || !connected || !input.trim() || loading) return;

    const userMessage = input.trim();
    setMessages((prev) => [...prev, { role: 'user', content: userMessage, timestamp: Date.now() }]);
    setInput('');
    setLoading(true);

    ws.send(JSON.stringify({ type: 'prompt', prompt: userMessage }));
  };

  const handleCancel = () => {
    if (!ws || !connected) return;
    ws.send(JSON.stringify({ type: 'cancel' }));
  };

  const handleReset = () => {
    if (!ws || !connected) return;
    ws.send(JSON.stringify({ type: 'reset' }));
    setMessages([]);
    setToolCalls([]);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="app">
      <header className="header">
        <h1>CodeYang Web</h1>
        <div className="status">
          <span className={`status-dot ${connected ? 'connected' : 'disconnected'}`}></span>
          {connected ? 'Connected' : 'Disconnected'}
        </div>
      </header>

      <div className="main">
        <div className="messages">
          {messages.map((msg, idx) => (
            <div key={idx} className={`message message-${msg.role}`}>
              <div className="message-role">{msg.role}</div>
              <div className="message-content">{msg.content}</div>
            </div>
          ))}
          {loading && toolCalls.length > 0 && (
            <div className="tool-calls">
              <div className="tool-calls-header">Executing tools...</div>
              {toolCalls.map((tc, idx) => (
                <div key={idx} className="tool-call">
                  • {tc.toolName}
                </div>
              ))}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="input-area">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type your message... (Enter to send, Shift+Enter for new line)"
            disabled={!connected || loading}
            rows={3}
          />
          <div className="buttons">
            <button onClick={handleSend} disabled={!connected || loading || !input.trim()}>
              {loading ? 'Sending...' : 'Send'}
            </button>
            {loading && (
              <button onClick={handleCancel} className="btn-cancel">
                Cancel
              </button>
            )}
            <button onClick={handleReset} disabled={!connected} className="btn-reset">
              Reset
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
