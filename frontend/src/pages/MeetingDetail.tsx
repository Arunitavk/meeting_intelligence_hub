import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Box, Typography, Tabs, Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Button } from '@mui/material';
import { Download as DownloadIcon } from '@mui/icons-material';
import { getMeeting, getMeetingDecisions, getMeetingActionItems } from '../api/client';
import ChatbotPanel from '../components/ChatbotPanel';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}
function CustomTabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div role="tabpanel" hidden={value !== index} {...other}>
      {value === index && (<Box sx={{ p: 3 }}>{children}</Box>)}
    </div>
  );
}

const MeetingDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [meeting, setMeeting] = useState<any>(null);
  const [decisions, setDecisions] = useState<any[]>([]);
  const [actions, setActions] = useState<any[]>([]);
  const [tab, setTab] = useState(0);

  useEffect(() => {
    if (id) {
      getMeeting(parseInt(id)).then(res => setMeeting(res.data)).catch(console.error);
      getMeetingDecisions(parseInt(id)).then(res => setDecisions(res.data)).catch(console.error);
      getMeetingActionItems(parseInt(id)).then(res => setActions(res.data)).catch(console.error);
    }
  }, [id]);

  if (!meeting) return <Typography>Loading meeting {id}...</Typography>;

  return (
    <Box sx={{ display: 'flex', flexDirection: { xs: 'column', lg: 'row' }, gap: 4 }}>
      <Box sx={{ flex: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h4">{meeting.title}</Typography>
          <Button variant="outlined" startIcon={<DownloadIcon />}>Export CSV</Button>
        </Box>
        <Typography color="text.secondary" mb={4}>
          Date: {new Date(meeting.date).toLocaleString()} | Overall Sentiment: {meeting.overall_sentiment?.toFixed(2) || 'N/A'}
        </Typography>

        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tab} onChange={(_, nv) => setTab(nv)}>
            <Tab label={`Action Items (${actions.length})`} />
            <Tab label={`Decisions (${decisions.length})`} />
          </Tabs>
        </Box>

        <CustomTabPanel value={tab} index={0}>
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Assignee</TableCell>
                  <TableCell>Task</TableCell>
                  <TableCell>Due Date</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {actions.map((act, i) => (
                  <TableRow key={i}>
                    <TableCell>{act.assignee || 'Unassigned'}</TableCell>
                    <TableCell>{act.task_description}</TableCell>
                    <TableCell>{act.due_date || '-'}</TableCell>
                    <TableCell>{act.status}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CustomTabPanel>

        <CustomTabPanel value={tab} index={1}>
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Decision Summary</TableCell>
                  <TableCell>Rationale</TableCell>
                  <TableCell>Time</TableCell>
                  <TableCell>Speakers</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {decisions.map((dec, i) => (
                  <TableRow key={i}>
                    <TableCell>{dec.summary}</TableCell>
                    <TableCell>{dec.rationale || '-'}</TableCell>
                    <TableCell>{dec.time_reference || '-'}</TableCell>
                    <TableCell>{dec.speakers || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CustomTabPanel>
      </Box>

      {/* Scoped Chatbot Panel for this specific meeting */}
      <Box sx={{ flex: 1, minWidth: 350, borderLeft: 1, borderColor: 'divider', pl: 3 }}>
        <ChatbotPanel meetingId={meeting.id} />
      </Box>
    </Box>
  );
};

export default MeetingDetail;
