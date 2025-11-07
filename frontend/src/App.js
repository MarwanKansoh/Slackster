import React, { useState, useEffect } from 'react';
import { Amplify, Auth } from 'aws-amplify';
import { 
  Container, CssBaseline, AppBar, Toolbar, Typography, 
  Box, Tabs, Tab, Paper, TextField, Button, List, 
  ListItem, ListItemText, Divider, CircularProgress
} from '@mui/material';
import { createTheme, ThemeProvider } from '@mui/material/styles';

// Input sanitization utility
const sanitizeInput = (input) => {
  if (typeof input !== 'string') return '';
  return input.replace(/<script[^>]*>.*?<\/script>/gi, '')
              .replace(/<[^>]*>/g, '')
              .replace(/javascript:/gi, '')
              .replace(/on\w+=/gi, '')
              .trim();
};

// HTML escape utility
const escapeHtml = (text) => {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};

// Configure Amplify
const configureAmplify = () => {
  const region = process.env.REACT_APP_AWS_REGION || 'us-east-1';
  const userPoolId = process.env.REACT_APP_COGNITO_USER_POOL_ID;
  const userPoolWebClientId = process.env.REACT_APP_COGNITO_CLIENT_ID;
  const apiEndpoint = process.env.REACT_APP_API_ENDPOINT;
  
  if (!userPoolId || !userPoolWebClientId) {
    console.error('Cognito configuration missing');
    return false;
  }
  
  Amplify.configure({
    Auth: {
      region,
      userPoolId,
      userPoolWebClientId,
    },
    API: {
      endpoints: [
        {
          name: 'SlacksterAPI',
          endpoint: apiEndpoint,
          custom_header: async () => {
            const session = await Auth.currentSession();
            return {
              Authorization: `Bearer ${session.getIdToken().getJwtToken()}`
            };
          }
        }
      ]
    }
  });
  
  return true;
};

// TabPanel component
function TabPanel(props) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`tabpanel-${index}`}
      aria-labelledby={`tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

// Main App component
function App() {
  const [isConfigured, setIsConfigured] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [tabValue, setTabValue] = useState(0);
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // Theme
  const theme = createTheme({
    palette: {
      primary: {
        main: '#232F3E', // AWS blue
      },
      secondary: {
        main: '#FF9900', // AWS orange
      },
    },
  });
  
  // Initialize Amplify configuration
  useEffect(() => {
    const configured = configureAmplify();
    setIsConfigured(configured);
    
    // Check authentication status
    if (configured) {
      checkAuthStatus();
    }
  }, []);
  
  // Check if user is authenticated
  const checkAuthStatus = async () => {
    try {
      const currentUser = await Auth.currentAuthenticatedUser();
      setIsAuthenticated(true);
      setUser(currentUser);
    } catch (error) {
      setIsAuthenticated(false);
      setUser(null);
    }
  };
  
  // Handle tab change
  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };
  
  // Handle chat input change
  const handleChatInputChange = (event) => {
    setChatInput(event.target.value);
  };
  
  // Handle chat submit
  const handleChatSubmit = async () => {
    const sanitizedInput = sanitizeInput(chatInput);
    if (!sanitizedInput.trim()) return;
    
    // Add user message to chat history
    const userMessage = {
      role: 'user',
      content: escapeHtml(sanitizedInput),
      timestamp: new Date().toISOString()
    };
    
    setChatHistory(prev => [...prev, userMessage]);
    setIsLoading(true);
    
    try {
      // Call API
      const response = await fetch(process.env.REACT_APP_API_ENDPOINT + '/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await Auth.currentSession()).getIdToken().getJwtToken()}`,
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({
          prompt: sanitizedInput
        })
      });
      
      const data = await response.json();
      
      // Add assistant message to chat history
      const assistantMessage = {
        role: 'assistant',
        content: escapeHtml(sanitizeInput(data.response || '')),
        sources: data.sources?.map(source => ({
          ...source,
          title: escapeHtml(sanitizeInput(source.title || ''))
        })) || [],
        timestamp: new Date().toISOString()
      };
      
      setChatHistory(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error sending chat message:', error);
      
      // Add error message to chat history
      const errorMessage = {
        role: 'system',
        content: escapeHtml('An error occurred while processing your request.'),
        timestamp: new Date().toISOString()
      };
      
      setChatHistory(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setChatInput('');
    }
  };
  
  // Handle login
  const handleLogin = async (email, password) => {
    try {
      await Auth.signIn(email, password);
      await checkAuthStatus();
    } catch (error) {
      console.error('Error signing in:', error);
    }
  };
  
  // Handle logout
  const handleLogout = async () => {
    try {
      await Auth.signOut();
      setIsAuthenticated(false);
      setUser(null);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };
  
  // Login component
  const LoginForm = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    
    const handleSubmit = (e) => {
      e.preventDefault();
      handleLogin(email, password);
    };
    
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          mt: 8
        }}
      >
        <Paper elevation={3} sx={{ p: 4, maxWidth: 400, width: '100%' }}>
          <Typography component="h1" variant="h5" align="center" gutterBottom>
            Sign in to Slackster
          </Typography>
          <form onSubmit={handleSubmit}>
            <TextField
              margin="normal"
              required
              fullWidth
              id="email"
              label="Email Address"
              name="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              name="password"
              label="Password"
              type="password"
              id="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button
              type="submit"
              fullWidth
              variant="contained"
              sx={{ mt: 3, mb: 2 }}
            >
              Sign In
            </Button>
          </form>
        </Paper>
      </Box>
    );
  };
  
  // Chat interface component
  const ChatInterface = () => {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 150px)' }}>
        <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2 }}>
          <List>
            {chatHistory.map((message, index) => (
              <React.Fragment key={index}>
                <ListItem alignItems="flex-start" sx={{ 
                  flexDirection: message.role === 'user' ? 'row-reverse' : 'row'
                }}>
                  <Paper 
                    elevation={1} 
                    sx={{ 
                      p: 2, 
                      maxWidth: '70%',
                      bgcolor: message.role === 'user' ? 'primary.light' : 'secondary.light',
                      color: message.role === 'user' ? 'primary.contrastText' : 'secondary.contrastText'
                    }}
                  >
                    <ListItemText
                      primary={<span dangerouslySetInnerHTML={{ __html: message.content }} />}
                      secondary={new Date(message.timestamp).toLocaleTimeString()}
                    />
                    {message.sources && message.sources.length > 0 && (
                      <Box sx={{ mt: 1 }}>
                        <Typography variant="caption">Sources:</Typography>
                        <List dense>
                          {message.sources.map((source, idx) => (
                            <ListItem key={idx} dense>
                              <ListItemText primary={<span dangerouslySetInnerHTML={{ __html: source.title }} />} />
                            </ListItem>
                          ))}
                        </List>
                      </Box>
                    )}
                  </Paper>
                </ListItem>
                {index < chatHistory.length - 1 && <Divider variant="middle" />}
              </React.Fragment>
            ))}
          </List>
          {isLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
              <CircularProgress />
            </Box>
          )}
        </Box>
        <Box sx={{ p: 2, backgroundColor: 'background.default' }}>
          <TextField
            fullWidth
            variant="outlined"
            placeholder="Type your message..."
            value={chatInput}
            onChange={handleChatInputChange}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleChatSubmit();
              }
            }}
            InputProps={{
              endAdornment: (
                <Button 
                  variant="contained" 
                  color="primary" 
                  onClick={handleChatSubmit}
                  disabled={isLoading}
                >
                  Send
                </Button>
              )
            }}
          />
        </Box>
      </Box>
    );
  };
  
  // Admin console component
  const AdminConsole = () => {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>
          Admin Console
        </Typography>
        <Typography paragraph>
          Configure your Slackster deployment here.
        </Typography>
        {/* Admin console content */}
      </Box>
    );
  };
  
  // Main content
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <AppBar position="static">
          <Toolbar>
            <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
              Slackster
            </Typography>
            {isAuthenticated && (
              <>
                <Typography variant="body2" sx={{ mr: 2 }}>
                  {user?.attributes?.email}
                </Typography>
                <Button color="inherit" onClick={handleLogout}>
                  Logout
                </Button>
              </>
            )}
          </Toolbar>
        </AppBar>
        
        <Container maxWidth="lg" sx={{ mt: 4, mb: 4, flexGrow: 1 }}>
          {!isConfigured ? (
            <Typography>Configuration error. Please check your environment variables.</Typography>
          ) : !isAuthenticated ? (
            <LoginForm />
          ) : (
            <>
              <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                <Tabs value={tabValue} onChange={handleTabChange}>
                  <Tab label="Chat" />
                  <Tab label="Admin" />
                </Tabs>
              </Box>
              <TabPanel value={tabValue} index={0}>
                <ChatInterface />
              </TabPanel>
              <TabPanel value={tabValue} index={1}>
                <AdminConsole />
              </TabPanel>
            </>
          )}
        </Container>
        
        <Box component="footer" sx={{ p: 2, bgcolor: 'background.paper' }}>
          <Typography variant="body2" color="text.secondary" align="center">
            Slackster - Powered by AWS
          </Typography>
        </Box>
      </Box>
    </ThemeProvider>
  );
}

export default App;