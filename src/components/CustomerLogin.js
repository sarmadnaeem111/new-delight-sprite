import React, { useState } from 'react';
import { 
  Container, 
  Paper, 
  TextField, 
  Button, 
  Typography, 
  Box,
  Alert,
  Divider,
  CircularProgress,
  IconButton
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { useNavigate } from 'react-router-dom';
import Footer from './Footer';

const CustomerLogin = ({ setIsCustomer }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    console.log("Attempting customer login with email:", email);
    
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      console.log("User signed in successfully:", userCredential.user.uid);
      
      // Check if user is a customer
      const userDoc = await getDoc(doc(db, 'customers', userCredential.user.uid));
      if (userDoc.exists() && userDoc.data().role === 'customer') {
        console.log("User verified as customer, setting isCustomer to true");
        setIsCustomer(true);
        
        // Redirect to home page
        console.log("Redirecting to home page");
        navigate('/');
      } else {
        console.error("User not authorized as customer");
        setError('Not authorized as customer');
        await auth.signOut();
        setLoading(false);
      }
    } catch (error) {
      console.error("Login error:", error.code, error.message);
      setError('Invalid email or password');
      setLoading(false);
    }
  };

  return (
    <>
      <Container maxWidth="sm">
        <Box sx={{ mt: 8 }}>
          <Box sx={{ display: 'flex', justifyContent: 'flex-start', mb: 2 }}>
            <IconButton 
              onClick={() => navigate('/')} 
              aria-label="back to home"
              sx={{ color: 'primary.main' }}
            >
              <ArrowBackIcon />
            </IconButton>
          </Box>
          <Paper elevation={3} sx={{ p: 4 }}>
            <Typography variant="h4" align="center" gutterBottom>
              Customer Login
            </Typography>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <form onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              margin="normal"
              required
              disabled={loading}
            />
            <TextField
              fullWidth
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              margin="normal"
              required
              disabled={loading}
            />
            <Button
              type="submit"
              fullWidth
              variant="contained"
              sx={{ mt: 3 }}
              disabled={loading}
            >
              {loading ? <CircularProgress size={24} /> : "Login"}
            </Button>
          </form>

          <Box sx={{ mt: 3, mb: 2 }}>
            <Divider>
              <Typography variant="body2" color="textSecondary">
                New to E-Commerce Store?
              </Typography>
            </Divider>
          </Box>

          <Button
            fullWidth
            variant="outlined"
            onClick={() => navigate('/customer/register')}
            sx={{ mt: 1 }}
            disabled={loading}
          >
            Create New Account
          </Button>
          
          <Box sx={{ mt: 3, mb: 2 }}>
            <Divider>
              <Typography variant="body2" color="textSecondary">
                Are you a seller?
              </Typography>
            </Divider>
          </Box>
          
          <Button
            fullWidth
            variant="text"
            onClick={() => navigate('/seller/login')}
            sx={{ 
              mt: 1,
              color: 'secondary.main',
              '&:hover': {
                backgroundColor: 'rgba(156, 39, 176, 0.04)'
              }
            }}
            disabled={loading}
          >
            Seller Login
          </Button>
        </Paper>
        </Box>
      </Container>
      <Footer />
    </>
  );
};

export default CustomerLogin; 
