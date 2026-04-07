import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import MeetingDetail from './pages/MeetingDetail';
import UploadDashboard from './pages/UploadDashboard';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#90caf9',
    },
    secondary: {
      main: '#f48fb1',
    },
    background: {
      default: '#121212',
      paper: '#1e1e1e'
    }
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
  }
});

function AppRoutes() {
  const location = useLocation();

  if (location.pathname === '/') {
    return (
      <Routes>
        <Route path="/" element={<UploadDashboard />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/meeting/:id" element={<MeetingDetail />} />
    </Routes>
  );
}

function App() {
  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Router>
        <AppRoutes />
      </Router>
    </ThemeProvider>
  );
}

export default App;
