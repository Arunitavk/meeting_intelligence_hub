import React, { useState } from 'react';
import { AppBar, Toolbar, Typography, Box, IconButton, Drawer, List, ListItem, ListItemIcon, ListItemText } from '@mui/material';
import { Dashboard as DashboardIcon, Chat as ChatIcon, Menu as MenuIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import ChatbotPanel from './ChatbotPanel';

const DRAWER_WIDTH = 240;

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const navigate = useNavigate();

  const handleDrawerToggle = () => setMobileOpen(!mobileOpen);
  const handleChatToggle = () => setChatOpen(!chatOpen);

  const drawerItems = (
    <div>
      <Toolbar>
        <Typography variant="h6" noWrap>
          Meeting Hub
        </Typography>
      </Toolbar>
      <List>
        <ListItem component="button" onClick={() => { navigate('/'); handleDrawerToggle(); }}>
          <ListItemIcon><DashboardIcon /></ListItemIcon>
          <ListItemText primary="Dashboard" />
        </ListItem>
        <ListItem component="button" onClick={handleChatToggle}>
          <ListItemIcon><ChatIcon /></ListItemIcon>
          <ListItemText primary="Global Chat" />
        </ListItem>
      </List>
    </div>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar>
          <IconButton color="inherit" edge="start" onClick={handleDrawerToggle} sx={{ mr: 2, display: { sm: 'none' } }}>
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
            Meeting Intelligence Hub
          </Typography>
          <IconButton color="inherit" onClick={handleChatToggle}>
            <ChatIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      <Box component="nav" sx={{ width: { sm: DRAWER_WIDTH }, flexShrink: { sm: 0 } }}>
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: true }}
          sx={{ display: { xs: 'block', sm: 'none' }, '& .MuiDrawer-paper': { boxSizing: 'border-box', width: DRAWER_WIDTH } }}
        >
          {drawerItems}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{ display: { xs: 'none', sm: 'block' }, '& .MuiDrawer-paper': { boxSizing: 'border-box', width: DRAWER_WIDTH } }}
          open
        >
          {drawerItems}
        </Drawer>
      </Box>

      <Box component="main" sx={{ flexGrow: 1, p: 3, width: { sm: `calc(100% - ${DRAWER_WIDTH}px)` }, mt: 8 }}>
        {children}
      </Box>

      {/* Global Chatbot Panel */}
      <Drawer anchor="right" open={chatOpen} onClose={handleChatToggle} PaperProps={{ sx: { width: { xs: '100%', sm: 400 } } }}>
        <ChatbotPanel onClose={handleChatToggle} />
      </Drawer>
    </Box>
  );
};

export default Layout;
