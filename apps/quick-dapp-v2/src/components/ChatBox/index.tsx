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
  imageUrl?: string;
}

interface ChatBoxProps {
  onSendMessage?: (message: string, imageBase64?: string) => void;
  isLoading: boolean;
}

const ChatBox: React.FC<ChatBoxProps> = ({ onSendMessage, isLoading }) => {
  const intl = useIntl();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      
      if (file.size > 4 * 1024 * 1024) {
        alert("Image size should be less than 4MB");
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setSelectedImage(base64String);
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const handleClearImage = () => {
    setSelectedImage(null);
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() && !selectedImage || isLoading) return;

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
      imageUrl: selectedImage || undefined,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, newMessage]);
    
    if (onSendMessage) {
      onSendMessage(inputMessage, selectedImage || undefined);
    }

    setInputMessage('');
    setSelectedImage(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <Card className="chat-box-container">
      <Card.Footer className="chat-box-footer d-flex flex-column">
        {selectedImage && (
          <div className="mb-2 position-relative d-inline-block align-self-start">
            <img 
              src={selectedImage} 
              alt="Preview" 
              style={{ height: '60px', borderRadius: '4px', border: '1px solid #dee2e6' }} 
            />
            <Button 
              onClick={handleClearImage}
              variant="danger"
              className="position-absolute top-0 start-100 translate-middle badge border border-light rounded-circle p-0 d-flex justify-content-center align-items-center"
              style={{ width: '20px', height: '20px' }}
            >
              <i className="fas fa-times" style={{ fontSize: '10px' }}></i>
            </Button>
          </div>
        )}

        <div className="chat-input-group d-flex w-100">
          <input 
            type="file" 
            accept="image/*" 
            ref={fileInputRef} 
            style={{ display: 'none' }} 
            onChange={handleImageSelect}
          />
          <Button 
            variant="outline-secondary" 
            onClick={() => fileInputRef.current?.click()}
            title="Attach image (Screenshot, Mockup)"
            disabled={isLoading}
          >
            <i className="fas fa-paperclip"></i>
          </Button>

          <Form.Control
            as="textarea"
            rows={1}
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={intl.formatMessage({ 
              id: 'quickDapp.chatPlaceholder', 
              defaultMessage: 'Ask AI or upload a design...' 
            })}
            disabled={isLoading}
            className="chat-input flex-grow-1 mx-2"
            style={{ resize: 'none' }}
          />

          <Button
            variant="primary"
            onClick={handleSendMessage}
            disabled={(!inputMessage.trim() && !selectedImage) || isLoading}
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