import React, { useEffect, useState } from 'react';
import { Box, Typography, Button, Grid, Card, CardContent, CardActions, LinearProgress, Alert } from '@mui/material';
import { CloudUpload as UploadIcon } from '@mui/icons-material';
import { getProjects, uploadTranscripts } from '../api/client';
import { useNavigate } from 'react-router-dom';

const Dashboard: React.FC = () => {
  const [projects, setProjects] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const fetchProjects = async () => {
    try {
      const res = await getProjects();
      setProjects(res.data);
    } catch (err) {
      console.error('Failed to load projects', err);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFiles(Array.from(e.target.files));
    }
  };

  const handleFiles = async (files: File[]) => {
    const validFiles = files.filter(f => f.name.endsWith('.txt') || f.name.endsWith('.vtt') || f.name.endsWith('.pdf'));
    if (validFiles.length === 0) {
      setError('Please upload .txt, .vtt, or .pdf files only.');
      return;
    }
    
    setUploading(true);
    setError(null);
    try {
      await uploadTranscripts(validFiles, undefined, 'Default Project');
      // Wait a bit for backend to process backgrounds mapping
      setTimeout(() => fetchProjects(), 2000);
    } catch (err) {
      setError('Failed to upload files.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Box>
      <Typography variant="h4" mb={4}>Dashboard</Typography>
      
      <Box 
        onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
        sx={{
          border: '2px dashed',
          borderColor: dragActive ? 'primary.main' : 'grey.600',
          borderRadius: 2, p: 6, mb: 4, textAlign: 'center', bgcolor: dragActive ? 'action.hover' : 'background.paper',
          cursor: 'pointer',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
        }}
        component="label"
      >
        <UploadIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
        <Typography variant="h6">Drag and drop transcripts here</Typography>
        <Typography variant="body2" color="text.secondary" mb={2}>Supported: .txt, .vtt, .pdf</Typography>
        <input type="file" multiple accept=".txt,.vtt,.pdf" hidden onChange={handleChange} />
        <Button variant="contained" component="span" sx={{ mt: 2 }}>Browse Files</Button>
      </Box>

      {uploading && <LinearProgress sx={{ mb: 4 }} />}
      {error && <Alert severity="error" sx={{ mb: 4 }}>{error}</Alert>}

      <Typography variant="h5" mb={3}>Recent Projects</Typography>
      <Grid container spacing={3}>
        {projects.map(p => (
          <Grid item xs={12} md={6} lg={4} key={p.id}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>{p.name}</Typography>
                <Typography variant="body2" color="text.secondary">Meetings: {p.meeting_count}</Typography>
                <Typography variant="body2" color="text.secondary">Action Items: {p.action_item_count}</Typography>
                <Typography variant="body2" color="text.secondary">
                  Sentiment: {p.overall_sentiment !== null ? p.overall_sentiment.toFixed(2) : 'N/A'}
                </Typography>
              </CardContent>
              <CardActions>
                {/* For demo, navigating to meeting #id or project router. We'll map to Meeting #id since it's 1:1 in this mock. */}
                <Button size="small" onClick={() => navigate(`/meeting/${p.id}`)}>View Meetings</Button>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

export default Dashboard;
