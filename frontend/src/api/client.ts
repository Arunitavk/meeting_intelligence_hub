import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const getProjects = () => apiClient.get('/projects/');
export const createProject = (name: string, description?: string) => apiClient.post('/projects/', { name, description });

export const getMeeting = (id: number) => apiClient.get(`/meetings/${id}`);
export const getMeetingDecisions = (id: number) => apiClient.get(`/meetings/${id}/decisions`);
export const getMeetingActionItems = (id: number) => apiClient.get(`/meetings/${id}/action_items`);

export const uploadTranscripts = (files: File[], projectId?: number, projectName?: string) => {
  const formData = new FormData();
  files.forEach(f => formData.append('files', f));
  if (projectId) formData.append('project_id', projectId.toString());
  if (projectName) formData.append('project_name', projectName);
  
  return apiClient.post('/upload/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
};

export const queryChatbot = (message: string, projectId?: number, meetingIds?: number[]) => {
  return apiClient.post('/chat/query', {
    message,
    project_id: projectId || null,
    meeting_ids: meetingIds || null
  });
};
