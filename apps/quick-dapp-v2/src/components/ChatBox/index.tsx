import React, { useState, useRef, useEffect } from 'react';
import { Form, Button, Card } from 'react-bootstrap';
import { FormattedMessage, useIntl } from 'react-intl';
import './ChatBox.css';
import { trackMatomoEvent } from '@remix-api'

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ChatBoxProps {
  onSendMessage?: (message: string) => void;
  onUpdateCode?: (code: string) => void;
}

const ChatBox: React.FC<ChatBoxProps> = ({ onSendMessage, onUpdateCode }) => {
  const intl = useIntl();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;

    trackMatomoEvent(this, {
      category: 'quick-dapp-v2',
      action: 'update',
      name: 'chat_request',
      isClick: true
    })

    const newMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputMessage,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, newMessage]);
    setInputMessage('');
    setIsLoading(true);

    if (onSendMessage) {
      onSendMessage(inputMessage);
    }

    // Simulate assistant response (this will be replaced with actual LLM integration)
    setTimeout(() => {
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'I understand you want to update the frontend. I can help you modify the HTML template. What specific changes would you like to make?',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, assistantMessage]);
      setIsLoading(false);
    }, 1000);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <Card className="chat-box-container">
      <Card.Footer className="chat-box-footer">
        <div className="chat-input-group">
          <Form.Control
            as="textarea"
            rows={2}
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={intl.formatMessage({ 
              id: 'quickDapp.chatPlaceholder', 
              defaultMessage: 'Ask the assistant to help modify your dApp...' 
            })}
            disabled={isLoading}
            className="chat-input"
          />
          <Button
            variant="primary"
            onClick={handleSendMessage}
            disabled={!inputMessage.trim() || isLoading}
            className="send-button"
          >
            <FormattedMessage id="quickDapp.send" defaultMessage="Send" />
          </Button>
        </div>
      </Card.Footer>
    </Card>
  );
};

export default ChatBox;