import React, { useState } from 'react';
import { Box, Typography, IconButton, TextField, Button, Paper, CircularProgress, Divider } from '@mui/material';
import { Close as CloseIcon, Send as SendIcon } from '@mui/icons-material';
import { queryChatbot } from '../api/client';

interface ChatbotPanelProps {
  onClose?: () => void;
  projectId?: number;
  meetingId?: number;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  citations?: { meeting_id: number; text_snippet: string; speaker: string | null }[];
}

const ChatbotPanel: React.FC<ChatbotPanelProps> = ({ onClose, projectId, meetingId }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (!input.trim()) return;
    
    const userMsg = input.trim();
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setInput('');
    setLoading(true);

    try {
      const response = await queryChatbot(userMsg, projectId, meetingId ? [meetingId] : undefined);
      setMessages(prev => [
        ...prev, 
        { 
          role: 'assistant', 
          content: response.data.answer, 
          citations: response.data.citations 
        }
      ]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Error fetching response.' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', p: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">Chat Context: {meetingId ? 'Meeting' : (projectId ? 'Project' : 'Global')}</Typography>
        {onClose && (
          <IconButton onClick={onClose}>
            <CloseIcon />
          </IconButton>
        )}
      </Box>
      <Divider />
      
      <Box sx={{ flexGrow: 1, overflowY: 'auto', mt: 2, mb: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {messages.map((msg, idx) => (
          <Paper key={idx} sx={{ p: 2, alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%', bgcolor: msg.role === 'user' ? 'primary.dark' : 'background.paper' }}>
            <Typography variant="body1">{msg.content}</Typography>
            {msg.citations && msg.citations.length > 0 && (
              <Box sx={{ mt: 1, p: 1, bgcolor: 'background.default', borderRadius: 1 }}>
                <Typography variant="caption" color="text.secondary">Sources:</Typography>
                {msg.citations.map((c, i) => (
                  <Typography key={i} variant="caption" display="block">• {c.speaker ? `${c.speaker}: ` : ''}"{c.text_snippet}" (Meeting #{c.meeting_id})</Typography>
                ))}
              </Box>
            )}
          </Paper>
        ))}
        {loading && <CircularProgress size={24} sx={{ alignSelf: 'center' }} />}
      </Box>

      <Box sx={{ display: 'flex', gap: 1 }}>
        <TextField 
          fullWidth 
          size="small" 
          placeholder="Ask a question..." 
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
        />
        <Button variant="contained" onClick={handleSend} endIcon={<SendIcon />}>
          Send
        </Button>
      </Box>
    </Box>
  );
};

export default ChatbotPanel;
