import React, { useState, useEffect, useRef } from 'react';
import { 
  Box, Typography, IconButton, TextField, Button, Paper, CircularProgress, Divider, 
  Chip, Card, CardContent, Tooltip, LinearProgress 
} from '@mui/material';
import { Close as CloseIcon, Send as SendIcon, ContentCopy as CopyIcon } from '@mui/icons-material';
import { createChatSession, streamChatMessage, getChatHistory } from '../api/client';

interface ChatbotPanelProps {
  onClose?: () => void;
  projectId?: number;
  meetingId?: number;
}

interface Citation {
  meeting?: string;
  date?: string;
  timestamp?: string;
  meeting_id?: number;
  text_snippet: string;
  speaker: string | null;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  mode?: 'claude' | 'gemini' | 'offline_fallback' | 'thinking';
  isStreaming?: boolean;
  isInitialThinking?: boolean;  // Flag for initial "analyzing..." message

const ChatbotPanel: React.FC<ChatbotPanelProps> = ({ onClose, projectId, meetingId }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Initialize session
  useEffect(() => {
    const initSession = async () => {
      try {
        const storageKey = `chat_session_${projectId || 'global'}_${meetingId || 'global'}`;
        const existingSession = localStorage.getItem(storageKey);
        
        if (existingSession) {
          setSessionId(existingSession);
          try {
            const historyRes = await getChatHistory(existingSession);
            if (historyRes.data && historyRes.data.length > 0) {
              const loadedMsgs = historyRes.data.map((m: any) => ({
                role: m.role,
                content: m.content,
                citations: [],
                isStreaming: false
              }));
              setMessages(loadedMsgs);
            }
          } catch(e) {
            console.error("Failed to load history, clearing session", e);
            localStorage.removeItem(storageKey);
            const res = await createChatSession(projectId, meetingId);
            setSessionId(res.data.session_id);
            localStorage.setItem(storageKey, res.data.session_id);
          }
        } else {
          const res = await createChatSession(projectId, meetingId);
          setSessionId(res.data.session_id);
          localStorage.setItem(storageKey, res.data.session_id);
        }
      } catch (err) {
        console.error('Failed to init chat session', err);
      }
    };
    initSession();
  }, [projectId, meetingId]);

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const getProviderColor = (mode?: string) => {
    switch (mode) {
      case 'claude':
        return '#9b59b6';
      case 'gemini':
        return '#f4b400';
      case 'offline_fallback':
        return '#e74c3c';
      case 'thinking':
        return '#3498db';
      default:
        return '#95a5a6';
    }
  };

  const getProviderLabel = (mode?: string) => {
    switch (mode) {
      case 'claude':
        return 'Claude (Primary)';
      case 'gemini':
        return 'Gemini (Fallback)';
      case 'offline_fallback':
        return 'Offline Mode';
      case 'thinking':
        return 'Analyzing your question...';
      default:
        return 'AI Assistant';
    }
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    
    const userMsg = input.trim();
    setMessages(prev => [...prev, { role: 'user', content: userMsg, isStreaming: false }]);
    setInput('');
    setLoading(true);

    try {
      let currentSessionId = sessionId;
      if (!currentSessionId) {
        const sessionRes = await createChatSession(projectId, meetingId);
        currentSessionId = sessionRes.data.session_id;
        setSessionId(currentSessionId);
      }
      
      if (!currentSessionId) {
        throw new Error("Chat session could not be established.");
      }

      // Add a placeholder assistant message with "thinking" mode (shows "Analyzing..." immediately)
      const assistantMessageIndex = messages.length + 1;
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: '', 
        citations: [], 
        mode: 'thinking',
        isStreaming: true,
        isInitialThinking: true
      }]);

      await streamChatMessage(
        currentSessionId,
        userMsg,
        (chunk) => {
          setMessages(prev => {
            const next = [...prev];
            const msg = { ...next[assistantMessageIndex] };
            if (chunk.type === 'metadata') {
              msg.citations = chunk.citations;
              // Only update mode if this is the final metadata (is_initial=False)
              if (chunk.is_initial === false) {
                msg.mode = chunk.mode;
                msg.isInitialThinking = false;
              }
              // Keep mode='thinking' if is_initial=True
            } else if (chunk.type === 'delta') {
              msg.content += chunk.text;
              msg.isInitialThinking = false;  // Once we have content, stop showing "thinking"
            } else if (chunk.type === 'done') {
              msg.isStreaming = false;
              msg.isInitialThinking = false;
            } else if (chunk.type === 'error') {
              msg.content = `Error: ${chunk.message}`;
              msg.isStreaming = false;
              msg.isInitialThinking = false;
            }
            next[assistantMessageIndex] = msg;
            return next;
          });
        },
        projectId,
        meetingId ? [meetingId] : undefined
      );

    } catch (err) {
      console.error('Chat error:', err);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'Error fetching response. Please try again.', 
        isStreaming: false 
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', p: 2, bgcolor: '#f8f9fa' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            💬 Meeting Intelligence Chatbot
          </Typography>
          <Typography variant="caption" color="textSecondary">
            Ask questions about {meetingId ? 'this meeting' : (projectId ? 'this project' : 'all meetings')}
          </Typography>
        </Box>
        {onClose && (
          <IconButton size="small" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        )}
      </Box>
      <Divider sx={{ mb: 2 }} />
      
      {/* Messages Area */}
      <Box sx={{ 
        flexGrow: 1, 
        overflowY: 'auto', 
        mb: 2, 
        display: 'flex', 
        flexDirection: 'column', 
        gap: 2,
        paddingRight: 1,
        '&::-webkit-scrollbar': {
          width: '8px',
        },
        '&::-webkit-scrollbar-track': {
          background: '#f1f1f1',
        },
        '&::-webkit-scrollbar-thumb': {
          background: '#888',
          borderRadius: '4px',
          '&:hover': {
            background: '#555',
          },
        },
      }}>
        {messages.length === 0 && (
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            height: '100%',
            flexDirection: 'column',
            color: '#999'
          }}>
            <Typography variant="h6" sx={{ mb: 1 }}>👋 Welcome!</Typography>
            <Typography variant="body2" align="center" sx={{ maxWidth: '200px' }}>
              Ask any question about your meeting transcripts or general knowledge
            </Typography>
          </Box>
        )}

        {messages.map((msg, idx) => (
          <Box
            key={idx}
            sx={{
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              animation: 'fadeIn 0.3s ease-in',
              '@keyframes fadeIn': {
                from: { opacity: 0, transform: 'translateY(10px)' },
                to: { opacity: 1, transform: 'translateY(0)' },
              },
            }}
          >
            <Card
              sx={{
                maxWidth: '80%',
                bgcolor: msg.role === 'user' ? '#007bff' : '#fff',
                color: msg.role === 'user' ? '#fff' : '#000',
                boxShadow: msg.role === 'user' ? '0 2px 8px rgba(0, 123, 255, 0.3)' : '0 2px 4px rgba(0, 0, 0, 0.1)',
                borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
              }}
            >
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                {/* Message Content */}
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {msg.content}
                </Typography>

                {/* Initial Thinking Indicator */}
                {msg.isInitialThinking && !msg.content && (
                  <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CircularProgress size={16} />
                    <Typography variant="caption" sx={{ fontStyle: 'italic', color: '#666' }}>
                      Analyzing your question...
                    </Typography>
                  </Box>
                )}

                {/* Streaming Indicator */}
                {msg.isStreaming && !msg.isInitialThinking && (
                  <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CircularProgress size={16} />
                    <Typography variant="caption">Streaming...</Typography>
                  </Box>
                )}

                {/* Mode Badge for Assistant */}
                {msg.role === 'assistant' && msg.mode && (
                  <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Tooltip title={`Powered by ${getProviderLabel(msg.mode)}`}>
                      <Chip
                        size="small"
                        label={getProviderLabel(msg.mode)}
                        sx={{
                          bgcolor: getProviderColor(msg.mode),
                          color: '#fff',
                          height: '22px',
                          fontSize: '0.7rem',
                          fontWeight: 500,
                        }}
                      />
                    </Tooltip>
                  </Box>
                )}

                {/* Copy Button */}
                {msg.role === 'assistant' && msg.content && (
                  <Tooltip title={copiedIndex === idx ? 'Copied!' : 'Copy message'}>
                    <IconButton
                      size="small"
                      onClick={() => handleCopy(msg.content, idx)}
                      sx={{
                        mt: 1,
                        color: msg.role === 'user' ? '#fff' : 'textSecondary',
                        opacity: 0.7,
                        '&:hover': { opacity: 1 },
                      }}
                    >
                      <CopyIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}

                {/* Citations */}
                {msg.citations && msg.citations.length > 0 && (
                  <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid rgba(0, 0, 0, 0.1)' }}>
                    <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 1 }}>
                      📚 Sources:
                    </Typography>
                    {msg.citations.map((c, i) => (
                      <Box
                        key={i}
                        sx={{
                          mb: 1,
                          p: 1,
                          bgcolor: msg.role === 'user' ? 'rgba(255, 255, 255, 0.1)' : '#f5f5f5',
                          borderLeft: `3px solid ${getProviderColor(msg.mode)}`,
                          borderRadius: '4px',
                          fontSize: '0.85rem',
                        }}
                      >
                        <Typography variant="caption" sx={{ display: 'block', fontWeight: 600 }}>
                          📝 {c.meeting || `Meeting #${c.meeting_id}`}
                        </Typography>
                        <Typography variant="caption" sx={{ display: 'block', color: 'textSecondary' }}>
                          📅 {c.date || 'Unknown Date'} • ⏱️ {c.timestamp || '00:00:00'}
                        </Typography>
                        {c.speaker && (
                          <Typography variant="caption" sx={{ display: 'block', fontStyle: 'italic', mt: 0.5 }}>
                            🎤 {c.speaker}
                          </Typography>
                        )}
                        <Typography
                          variant="caption"
                          sx={{
                            display: 'block',
                            mt: 0.5,
                            fontStyle: 'italic',
                            color: msg.role === 'user' ? '#fff' : 'textSecondary',
                          }}
                        >
                          "{c.text_snippet}"
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                )}
              </CardContent>
            </Card>
          </Box>
        ))}

        {/* Loading indicator */}
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <CircularProgress size={20} />
              <Typography variant="caption" color="textSecondary">
                Processing your question...
              </Typography>
            </Box>
          </Box>
        )}

        <div ref={messagesEndRef} />
      </Box>

      {/* Input Area */}
      <Box sx={{ display: 'flex', gap: 1 }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Ask a question... (Try: 'What was discussed about...?', 'Who said...?')"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          disabled={loading}
          multiline
          maxRows={4}
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: '8px',
            },
          }}
        />
        <Button
          variant="contained"
          onClick={handleSend}
          disabled={!input.trim() || loading}
          endIcon={loading ? <CircularProgress size={20} /> : <SendIcon />}
          sx={{ borderRadius: '8px' }}
        >
          Send
        </Button>
      </Box>
    </Box>
  );
};

export default ChatbotPanel;

