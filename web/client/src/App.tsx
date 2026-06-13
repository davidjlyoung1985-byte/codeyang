import React, { useState, useEffect, useRef } from 'react';
import './App.css';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

function App() {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentAssistantText, setCurrentAssistantText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const websocket = new WebSocket('ws://localhost:3001');

    websocket.onopen = () => {
      console.log('Connected');
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

          case 'assistant_delta':
            // Streaming text — accumulates into current assistant message
            setCurrentAssistantText((prev) => prev + (data.text || ''));
            break;

          case 'assistant_text':
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.role === 'assistant') {
                return [
                  ...prev.slice(0, -1),
                  { ...last, content: last.content + (data.text || '') },
                ];
              }
              return [...prev, { role: 'assistant', content: data.text || '', timestamp: Date.now() }];
            });
            break;

          case 'status':
            if (data.status === 'completed' || data.status === 'cancelled' || data.status === 'error') {
              // Flush accumulated streaming text into messages
              setCurrentAssistantText((prev) => {
                if (prev) {
                  setMessages((m) => [...m, { role: 'assistant', content: prev, timestamp: Date.now() }]);
                }
                return '';
              });
              setLoading(false);
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
        console.error('Parse error:', err);
      }
    };

    websocket.onclose = () => {
      console.log('Disconnected');
      setConnected(false);
    };

    websocket.onerror = () => {
      setConnected(false);
    };

    setWs(websocket);

    return () => {
      websocket.close();
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentAssistantText]);

  const handleSend = () => {
    if (!ws || !connected || !input.trim() || loading) return;

    const text = input.trim();
    setMessages((prev) => [...prev, { role: 'user', content: text, timestamp: Date.now() }]);
    setInput('');
    setLoading(true);

    ws.send(JSON.stringify({ type: 'prompt', prompt: text }));
  };

  const handleCancel = () => {
    if (!ws || !connected) return;
    ws.send(JSON.stringify({ type: 'cancel' }));
  };

  const handleReset = () => {
    if (!ws || !connected) return;
    ws.send(JSON.stringify({ type: 'reset' }));
    setMessages([]);
    setCurrentAssistantText('');
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
          {currentAssistantText && (
            <div className="message message-assistant">
              <div className="message-role">assistant</div>
              <div className="message-content">{currentAssistantText}</div>
            </div>
          )}
          {loading && !currentAssistantText && (
            <div className="message message-system">
              <div className="message-content">Thinking...</div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="input-area">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type your message..."
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
