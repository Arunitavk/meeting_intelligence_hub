import axios from 'axios';

const API_BASE_URL = '/api';

export const apiClient = axios.create({
  baseURL: API_BASE_URL
});

export const getProjects = () => apiClient.get('/projects/');
export const createProject = (name: string, description?: string) => apiClient.post('/projects/', { name, description });

export const getMeetings = () => apiClient.get('/meetings/');

export const getMeeting = (id: number) => apiClient.get(`/meetings/${id}`);
export const getMeetingDecisions = (id: number) => apiClient.get(`/meetings/${id}/decisions`);
export const getMeetingActionItems = (id: number) => apiClient.get(`/meetings/${id}/action_items`);
export const getMeetingSegments = (id: number) => apiClient.get(`/meetings/${id}/segments`);
export const getSentimentAnalysis = (id: number) => apiClient.get(`/meetings/${id}/sentiment_analysis`);
export const analyseSentiment = (id: number) => apiClient.post(`/meetings/${id}/analyse`);
export const getSentimentStatus = (id: number) => apiClient.get(`/meetings/${id}/status`);

export const uploadTranscripts = (files: File[], projectId?: number, projectName?: string) => {
  const formData = new FormData();
  if (projectId) formData.append('project_id', projectId.toString());
  if (projectName) formData.append('project_name', projectName);
  files.forEach(f => formData.append('files', f));
  
  return apiClient.post('/upload/', formData);
};

export const createChatSession = (projectId?: number, meetingId?: number) => {
  return apiClient.post('/chat/session', {
    project_id: projectId || null,
    meeting_id: meetingId || null
  });
};

export const streamChatMessage = async (
  sessionId: string, 
  message: string, 
  onChunk: (chunk: any) => void,
  projectId?: number, 
  meetingIds?: number[]
) => {
  const response = await fetch(`${API_BASE_URL}/chat/message/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      message,
      project_id: projectId || null,
      meeting_ids: meetingIds || null
    })
  });

  if (!response.body) throw new Error("No response body");
  
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          onChunk(data);
        } catch (e) {
          console.error("Error parsing SSE line", e);
        }
      }
    }
  }
};

export const getChatHistory = (sessionId: string) => {
  return apiClient.get(`/chat/session/${sessionId}/history`);
};
