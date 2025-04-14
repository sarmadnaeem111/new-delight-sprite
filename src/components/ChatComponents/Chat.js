import React, { useState, useEffect } from 'react';
import { Box, Grid, Paper, Typography, useMediaQuery, useTheme, Drawer, IconButton, styled, alpha, Button, Dialog, DialogTitle, DialogContent, List, ListItem, ListItemText, CircularProgress, TextField, InputAdornment } from '@mui/material';
import { Menu as MenuIcon, Search as SearchIcon, Add as AddIcon } from '@mui/icons-material';
import ChatList from './ChatList';
import ChatWindow from './ChatWindow';
import { db, auth } from '../../firebase';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  getDoc, 
  setDoc, 
  addDoc, 
  serverTimestamp,
  getDocs,
  or
} from 'firebase/firestore';
import { cloudinary } from '../../utils/cloudinaryConfig';
import { initializeChatCleanupWorker } from '../../utils/chatCleanup';

// Add a flag to track if Cloudinary is properly configured
let isCloudinaryConfigured = false;

// Check Cloudinary configuration
try {
  const cloudName = cloudinary.config().cloud.cloudName;
  if (cloudName && cloudName !== 'your-cloud-name') {
    isCloudinaryConfigured = true;
    console.log('Cloudinary integration enabled');
  } else {
    console.warn('Cloudinary not configured properly. Using Firebase Storage as fallback.');
  }
} catch (error) {
  console.error('Error initializing Cloudinary:', error);
}

const ChatContainer = styled(Box)(({ theme }) => ({
  height: '75vh',
  maxHeight: '900px',
  display: 'flex',
  borderRadius: theme.spacing(2),
  overflow: 'hidden',
  boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
  backgroundColor: alpha(theme.palette.background.paper, 0.9),
}));

const SidebarContainer = styled(Paper)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  width: '100%',
  borderRight: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
  overflow: 'hidden',
}));

const SidebarHeader = styled(Box)(({ theme }) => ({
  padding: theme.spacing(2),
  borderBottom: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
  backgroundColor: alpha(theme.palette.background.paper, 0.8),
}));

// Add a new styled component for the scrollable chat list container
const ScrollableChatListContainer = styled(Box)(({ theme }) => ({
  flexGrow: 1,
  overflowY: 'auto',
  '&::-webkit-scrollbar': {
    width: '6px',
  },
  '&::-webkit-scrollbar-track': {
    backgroundColor: 'transparent',
  },
  '&::-webkit-scrollbar-thumb': {
    backgroundColor: alpha(theme.palette.primary.main, 0.2),
    borderRadius: '3px',
  },
  '&::-webkit-scrollbar-thumb:hover': {
    backgroundColor: alpha(theme.palette.primary.main, 0.4),
  },
}));

const Chat = ({ isAdmin }) => {
  const [chats, setChats] = useState([]);
  const [selectedChatId, setSelectedChatId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [otherUserDetails, setOtherUserDetails] = useState(null);
  const [currentUserUid, setCurrentUserUid] = useState(null);
  const [currentUserName, setCurrentUserName] = useState(null);
  
  // New state for seller selection dialog
  const [showSellerDialog, setShowSellerDialog] = useState(false);
  const [availableSellers, setAvailableSellers] = useState([]);
  const [sellerSearchQuery, setSellerSearchQuery] = useState('');
  const [loadingSellers, setLoadingSellers] = useState(false);
  
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  
  // Initialize the chat cleanup worker once when the component mounts
  useEffect(() => {
    // Only initialize the worker once, preferably if the user is an admin or seller
    if (currentUserUid) {
      console.log('Initializing chat cleanup worker for 24-hour message retention policy');
      initializeChatCleanupWorker();
    }
    
    // No cleanup needed for this effect as the worker will stop when the app is closed
  }, [currentUserUid]);
  
  // Get current user's UID and details
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        setCurrentUserUid(user.uid);
        
        // Get current user profile data
        try {
          let userDoc;
          
          if (isAdmin) {
            userDoc = await getDoc(doc(db, 'admins', user.uid));
          } else {
            userDoc = await getDoc(doc(db, 'sellers', user.uid));
          }
          
          if (userDoc.exists()) {
            const userData = userDoc.data();
            setCurrentUserName(userData.displayName || userData.shopName || userData.email || 'User');
          }
        } catch (error) {
          console.error('Error fetching user profile:', error);
        }
      } else {
        // Check localStorage for stored credentials when Firebase Auth doesn't have a user
        if (isAdmin) {
          // For admin users
          const adminId = localStorage.getItem('adminId');
          const adminEmail = localStorage.getItem('adminEmail');
          
          if (adminId) {
            console.log('Using admin data from localStorage:', adminId);
            setCurrentUserUid(adminId);
            setCurrentUserName(adminEmail || 'Admin');
            
            // Try to fetch fresh admin data
            try {
              const adminDoc = await getDoc(doc(db, 'admins', adminId));
              if (adminDoc.exists()) {
                const userData = adminDoc.data();
                setCurrentUserName(userData.displayName || userData.email || 'Admin');
              }
            } catch (error) {
              console.error('Error fetching admin profile from Firestore:', error);
            }
          } else {
            setCurrentUserUid(null);
            setCurrentUserName(null);
          }
        } else {
          // For seller users
          const sellerId = localStorage.getItem('sellerId');
          const sellerEmail = localStorage.getItem('sellerEmail');
          const sellerName = localStorage.getItem('sellerName');
          const sellerShopName = localStorage.getItem('sellerShopName');
          
          if (sellerId) {
            console.log('Using seller data from localStorage:', sellerId);
            setCurrentUserUid(sellerId);
            setCurrentUserName(sellerName || sellerShopName || sellerEmail || 'Seller');
            
            // Try to fetch fresh seller data
            try {
              const sellerDoc = await getDoc(doc(db, 'sellers', sellerId));
              if (sellerDoc.exists()) {
                const userData = sellerDoc.data();
                setCurrentUserName(userData.displayName || userData.shopName || userData.email || 'Seller');
              }
            } catch (error) {
              console.error('Error fetching seller profile from Firestore:', error);
            }
          } else {
            setCurrentUserUid(null);
            setCurrentUserName(null);
          }
        }
      }
    });
    
    return () => unsubscribe();
  }, [isAdmin]);
  
  // Load chats for the current user
  useEffect(() => {
    // Check localStorage for user data if we don't have currentUserUid yet
    if (!currentUserUid) {
      if (isAdmin) {
        const adminId = localStorage.getItem('adminId');
        if (adminId) {
          console.log('Setting admin ID from localStorage:', adminId);
          setCurrentUserUid(adminId);
          return; // The effect will run again with the userId set
        }
      } else {
        const sellerId = localStorage.getItem('sellerId');
        if (sellerId) {
          console.log('Setting seller ID from localStorage:', sellerId);
          setCurrentUserUid(sellerId);
          return; // The effect will run again with the userId set
        }
      }
    }
    
    if (!currentUserUid) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    
    // Create query based on user role
    const chatsRef = collection(db, 'chats');
    let chatQuery;
    
    if (isAdmin) {
      // For admins: get all chats in the system
      // This ensures any admin can see all seller conversations
      chatQuery = query(chatsRef);
    } else {
      // For sellers: only get chats where they are the seller
      chatQuery = query(chatsRef, where('sellerUid', '==', currentUserUid));
    }
    
    const unsubscribe = onSnapshot(chatQuery, async (snapshot) => {
      // Map the chat documents to state, including other user details
      const chatPromises = snapshot.docs.map(async (docSnapshot) => {
        const chatData = docSnapshot.data();
        
        // Determine other user ID
        const otherUserUid = isAdmin ? chatData.sellerUid : chatData.adminUid;
        
        // Set unread count based on user role
        const unreadCount = isAdmin ? chatData.adminUnreadCount || 0 : chatData.sellerUnreadCount || 0;
        
        // Get other user details
        let otherUserName = 'Unknown User';
        
        try {
          if (!isAdmin && otherUserUid) {
            // If current user is a seller and other user is admin, always show "Customer Care"
            otherUserName = "Customer Care";
            // Also store the admin email but it won't be displayed
            otherUserDetails = {
              displayName: "Customer Care",
              email: "mdzahid11@gmail.com"
            };
          } else {
            const userDoc = await getDoc(doc(db, isAdmin ? 'sellers' : 'admins', otherUserUid));
            if (userDoc.exists()) {
              const userData = userDoc.data();
              if (isAdmin) {
                // Admin viewing a seller chat - always display the seller's email
                otherUserName = userData.email || 'Unknown User';
              } else {
                // Normal display name hierarchy for other cases
                otherUserName = userData.displayName || userData.shopName || userData.email || 'Unknown User';
              }
            }
          }
        } catch (error) {
          console.error('Error fetching other user details:', error);
        }
        
        return {
          id: docSnapshot.id,
          ...chatData,
          otherUserUid,
          otherUserName,
          unreadCount
        };
      });
      
      const chatsList = await Promise.all(chatPromises);
      
      // Sort chats by last message time (newest first)
      chatsList.sort((a, b) => {
        if (!a.lastMessageTime) return 1;
        if (!b.lastMessageTime) return -1;
        return b.lastMessageTime.seconds - a.lastMessageTime.seconds;
      });
      
      setChats(chatsList);
      setLoading(false);
    });
    
    return () => unsubscribe();
  }, [currentUserUid, isAdmin]);
  
  // Fetch other user details when selected chat changes
  useEffect(() => {
    const fetchOtherUserDetails = async () => {
      if (!selectedChatId) {
        setOtherUserDetails(null);
        return;
      }
      
      const selectedChat = chats.find(chat => chat.id === selectedChatId);
      if (!selectedChat) return;
      
      try {
        if (!isAdmin) {
          // If this is a seller viewing admin messages, always display as Customer Care
          setOtherUserDetails({
            uid: selectedChat.otherUserUid,
            displayName: "Customer Care",
            email: "mdzahid11@gmail.com" // Update email but it won't be displayed
          });
        } else {
          // Admin viewing seller details
          const userDoc = await getDoc(doc(db, 'sellers', selectedChat.otherUserUid));
          if (userDoc.exists()) {
            setOtherUserDetails({
              uid: selectedChat.otherUserUid,
              ...userDoc.data()
            });
          }
        }
      } catch (error) {
        console.error('Error fetching other user details:', error);
      }
    };
    
    fetchOtherUserDetails();
  }, [selectedChatId, chats, isAdmin]);
  
  // Function to fetch all sellers for admin
  const fetchAvailableSellers = async () => {
    if (!isAdmin || !currentUserUid) return;
    
    setLoadingSellers(true);
    try {
      const sellersRef = collection(db, 'sellers');
      // Only include active and frozen sellers
      const q = query(sellersRef, where('status', 'in', ['active', 'frozen']));
      const querySnapshot = await getDocs(q);
      
      const sellers = [];
      querySnapshot.forEach((doc) => {
        const sellerData = doc.data();
        sellers.push({
          id: doc.id,
          name: sellerData.shopName || sellerData.name || sellerData.email || 'Unknown Seller',
          email: sellerData.email || 'No email',
          status: sellerData.status || 'unknown'
        });
      });
      
      // Sort alphabetically by name
      sellers.sort((a, b) => a.name.localeCompare(b.name));
      
      setAvailableSellers(sellers);
    } catch (error) {
      console.error('Error fetching sellers:', error);
    } finally {
      setLoadingSellers(false);
    }
  };

  // Admin starts a new chat with a seller
  const startAdminChat = async (sellerId, sellerName) => {
    if (!isAdmin || !currentUserUid) return;
    
    try {
      // Check if a chat already exists
      const chatsRef = collection(db, 'chats');
      const existingChatQuery = query(
        chatsRef, 
        where('sellerUid', '==', sellerId),
        where('adminUid', '==', currentUserUid)
      );
      
      const existingChatsSnapshot = await getDocs(existingChatQuery);
      
      let chatId;
      
      if (existingChatsSnapshot.empty) {
        // Create a new chat document
        const newChatRef = await addDoc(chatsRef, {
          sellerUid: sellerId,
          adminUid: currentUserUid,
          createdAt: serverTimestamp(),
          lastMessageTime: null,
          adminUnreadCount: 0,
          sellerUnreadCount: 0
        });
        
        chatId = newChatRef.id;
      } else {
        // Use existing chat
        chatId = existingChatsSnapshot.docs[0].id;
      }
      
      setSelectedChatId(chatId);
      setShowSellerDialog(false);
    } catch (error) {
      console.error('Error starting chat with seller:', error);
    }
  };

  // Filter sellers based on search query
  const filteredSellers = sellerSearchQuery.trim() === '' 
    ? availableSellers 
    : availableSellers.filter(seller => 
        seller.name.toLowerCase().includes(sellerSearchQuery.toLowerCase()) ||
        seller.email.toLowerCase().includes(sellerSearchQuery.toLowerCase())
      );

  // Start a new chat
  const startNewChat = async () => {
    if (!currentUserUid || isAdmin) return;
    
    try {
      // Find admin user
      const adminsRef = collection(db, 'admins');
      const adminsSnapshot = await getDocs(adminsRef);
      
      if (adminsSnapshot.empty) {
        console.error('No admin found');
        return;
      }
      
      // Use the first admin (this is a simplification, might need to be adjusted)
      const adminDoc = adminsSnapshot.docs[0];
      const adminUid = adminDoc.id;
      
      // Check if a chat already exists
      const chatsRef = collection(db, 'chats');
      const existingChatQuery = query(
        chatsRef, 
        where('sellerUid', '==', currentUserUid),
        where('adminUid', '==', adminUid)
      );
      
      const existingChatsSnapshot = await getDocs(existingChatQuery);
      
      let chatId;
      
      if (existingChatsSnapshot.empty) {
        // Create a new chat document
        const newChatRef = await addDoc(chatsRef, {
          sellerUid: currentUserUid,
          adminUid: adminUid,
          createdAt: serverTimestamp(),
          lastMessageTime: null,
          adminUnreadCount: 0,
          sellerUnreadCount: 0
        });
        
        chatId = newChatRef.id;
      } else {
        // Use existing chat
        chatId = existingChatsSnapshot.docs[0].id;
      }
      
      setSelectedChatId(chatId);
      setSidebarOpen(false);
    } catch (error) {
      console.error('Error starting new chat:', error);
    }
  };
  
  // Handle chat selection
  const handleSelectChat = (chatId) => {
    setSelectedChatId(chatId);
    if (isMobile) {
      setSidebarOpen(false);
    }
  };
  
  // Handle back button in mobile view
  const handleBackClick = () => {
    setSelectedChatId(null);
    if (isMobile) {
      setSidebarOpen(true);
    }
  };
  
  // Toggle sidebar on mobile
  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };
  
  // Modify the useEffect for the admin to fetch sellers when they open the dialog
  useEffect(() => {
    if (showSellerDialog && isAdmin) {
      fetchAvailableSellers();
    }
  }, [showSellerDialog, isAdmin]);
  
  // Create the chat layout
  const renderChatLayout = () => {
    if (isMobile) {
      return (
        <>
          <IconButton 
            onClick={toggleSidebar} 
            sx={{ display: { xs: 'flex', md: 'none' }, mb: 1 }}
          >
            <MenuIcon />
          </IconButton>
          
          <Drawer
            anchor="left"
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            PaperProps={{
              sx: { width: '80%', maxWidth: '320px' }
            }}
          >
            <SidebarContainer square elevation={0}>
              <SidebarHeader>
                <Typography variant="h6">Conversations</Typography>
                {isAdmin ? (
                  <Button
                    startIcon={<AddIcon />}
                    size="small"
                    color="primary"
                    variant="outlined"
                    onClick={() => setShowSellerDialog(true)}
                    sx={{ mt: 1, borderRadius: '20px', textTransform: 'none' }}
                  >
                    New Conversation
                  </Button>
                ) : (
                  <Typography 
                    variant="body2" 
                    color="primary" 
                    sx={{ cursor: 'pointer', mt: 1 }}
                    onClick={startNewChat}
                  >
                    + Start new conversation
                  </Typography>
                )}
              </SidebarHeader>
              <ScrollableChatListContainer>
                <ChatList 
                  chats={chats} 
                  selectedChatId={selectedChatId}
                  onSelectChat={handleSelectChat}
                  currentUserIsAdmin={isAdmin}
                />
              </ScrollableChatListContainer>
            </SidebarContainer>
          </Drawer>
          
          <Box sx={{ width: '100%', height: '100%' }}>
            <ChatWindow 
              selectedChatId={selectedChatId}
              onBackClick={handleBackClick}
              currentUserUid={currentUserUid}
              currentUserName={currentUserName}
              isAdmin={isAdmin}
              otherUserDetails={otherUserDetails}
            />
          </Box>
        </>
      );
    }
    
    return (
      <Grid container sx={{ height: '100%' }}>
        <Grid item xs={12} md={4} sx={{ height: '100%' }}>
          <SidebarContainer elevation={0}>
            <SidebarHeader>
              <Typography variant="h6">Conversations</Typography>
              {isAdmin ? (
                <Button
                  startIcon={<AddIcon />}
                  size="small"
                  color="primary"
                  variant="outlined"
                  onClick={() => setShowSellerDialog(true)}
                  sx={{ mt: 1, borderRadius: '20px', textTransform: 'none' }}
                >
                  New Conversation
                </Button>
              ) : (
                <Typography 
                  variant="body2" 
                  color="primary" 
                  sx={{ cursor: 'pointer', mt: 1 }}
                  onClick={startNewChat}
                >
                  + Start new conversation
                </Typography>
              )}
            </SidebarHeader>
            <ScrollableChatListContainer>
              <ChatList 
                chats={chats} 
                selectedChatId={selectedChatId}
                onSelectChat={handleSelectChat}
                currentUserIsAdmin={isAdmin}
              />
            </ScrollableChatListContainer>
          </SidebarContainer>
        </Grid>
        
        <Grid item xs={12} md={8} sx={{ height: '100%' }}>
          <ChatWindow 
            selectedChatId={selectedChatId}
            onBackClick={handleBackClick}
            currentUserUid={currentUserUid}
            currentUserName={currentUserName}
            isAdmin={isAdmin}
            otherUserDetails={otherUserDetails}
          />
        </Grid>
      </Grid>
    );
  };
  
  return (
    <ChatContainer>
      {renderChatLayout()}
      
      {/* Seller Selection Dialog */}
      <Dialog 
        open={showSellerDialog} 
        onClose={() => setShowSellerDialog(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>
          Select a Seller to Start Conversation
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            fullWidth
            placeholder="Search sellers..."
            value={sellerSearchQuery}
            onChange={(e) => setSellerSearchQuery(e.target.value)}
            variant="outlined"
            sx={{ mb: 2 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
          />
          
          {loadingSellers ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
              <CircularProgress />
            </Box>
          ) : filteredSellers.length > 0 ? (
            <List sx={{ maxHeight: '400px', overflow: 'auto' }}>
              {filteredSellers.map((seller) => (
                <ListItem 
                  button 
                  key={seller.id}
                  onClick={() => startAdminChat(seller.id, seller.name)}
                  sx={{
                    borderRadius: 1,
                    mb: 0.5,
                    '&:hover': { backgroundColor: 'rgba(0, 0, 0, 0.04)' },
                    position: 'relative',
                    pl: 2,
                    ...(seller.status === 'frozen' ? { opacity: 0.7 } : {})
                  }}
                >
                  <ListItemText 
                    primary={seller.name}
                    secondary={
                      <>
                        {seller.email}
                        {seller.status === 'frozen' && (
                          <Box component="span" sx={{ ml: 1, color: 'error.main', fontSize: '0.75rem' }}>
                            (Frozen)
                          </Box>
                        )}
                      </>
                    }
                  />
                </ListItem>
              ))}
            </List>
          ) : (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <Typography color="text.secondary">
                {availableSellers.length === 0 
                  ? 'No sellers found' 
                  : 'No sellers match your search'}
              </Typography>
            </Box>
          )}
        </DialogContent>
      </Dialog>
    </ChatContainer>
  );
};

export default Chat; 