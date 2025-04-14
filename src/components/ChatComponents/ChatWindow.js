import React, { useState, useEffect, useRef } from 'react';
import { 
  Box, 
  Paper, 
  Typography, 
  Divider, 
  CircularProgress, 
  IconButton, 
  Stack,
  Tooltip,
  styled,
  alpha
} from '@mui/material';
import { 
  ArrowBack as ArrowBackIcon,
  MoreVert as MoreVertIcon 
} from '@mui/icons-material';
import Message from './Message';
import ChatInput from './ChatInput';
import { db } from '../../firebase';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  serverTimestamp,
  getDoc,
  doc,
  updateDoc,
  arrayUnion
} from 'firebase/firestore';

const ChatContainer = styled(Paper)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  borderRadius: theme.spacing(2),
  overflow: 'hidden',
  boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
}));

const ChatHeader = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  padding: theme.spacing(2),
  backgroundColor: alpha(theme.palette.primary.main, 0.05),
  borderBottom: `1px solid ${alpha(theme.palette.divider, 0.2)}`,
}));

const MessagesContainer = styled(Box)(({ theme }) => ({
  flexGrow: 1,
  overflowY: 'auto',
  padding: theme.spacing(2),
  display: 'flex',
  flexDirection: 'column',
  gap: theme.spacing(1),
  backgroundColor: alpha(theme.palette.background.default, 0.4),
}));

const NoConversationContainer = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  padding: theme.spacing(3),
  backgroundColor: alpha(theme.palette.background.default, 0.4),
}));

const ChatWindow = ({ 
  selectedChatId, 
  onBackClick, 
  currentUserUid, 
  currentUserName,
  isAdmin,
  otherUserDetails
}) => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef(null);
  const [localUserDetails, setLocalUserDetails] = useState(null);
  
  // Scroll to bottom whenever messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  // Load messages for the selected chat
  useEffect(() => {
    if (!selectedChatId) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    
    const messagesRef = collection(db, 'chats', selectedChatId, 'messages');
    const messagesQuery = query(messagesRef, orderBy('timestamp', 'asc'));
    
    const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
      const messagesList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      setMessages(messagesList);
      setLoading(false);
      
      // Mark messages as read
      if (messagesList.length > 0) {
        markMessagesAsRead();
      }
    });
    
    return () => unsubscribe();
  }, [selectedChatId, currentUserUid]);
  
  // Mark messages as read
  const markMessagesAsRead = async () => {
    if (!selectedChatId) return;
    
    try {
      const chatRef = doc(db, 'chats', selectedChatId);
      const chatDoc = await getDoc(chatRef);
      
      if (chatDoc.exists()) {
        // Determine which field to update based on whether user is admin
        const fieldToUpdate = isAdmin 
          ? 'adminUnreadCount' 
          : 'sellerUnreadCount';
        
        await updateDoc(chatRef, {
          [fieldToUpdate]: 0
        });
      }
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  };
  
  // Send a new message
  const handleSendMessage = async (text, imageUrl) => {
    if ((!text || text.trim() === '') && !imageUrl) return;
    
    try {
      // Get user data from localStorage if currentUserUid is not available 
      // (this happens when using localStorage persistence)
      let senderUid = currentUserUid;
      let senderName = currentUserName;
      
      if (!senderUid) {
        if (isAdmin) {
          // For admin users
          senderUid = localStorage.getItem('adminId');
          senderName = "Customer Care"; // Always use "Customer Care" for admin instead of email
          
          if (!senderUid) {
            console.error('No admin ID available');
            return;
          }
        } else {
          // For seller users
          senderUid = localStorage.getItem('sellerId');
          senderName = localStorage.getItem('sellerName') || 
                     localStorage.getItem('sellerShopName') || 
                     localStorage.getItem('sellerEmail') || 'Seller';
          
          if (!senderUid) {
            console.error('No seller ID available');
            return;
          }
        }
      } else if (isAdmin) {
        // Always use "Customer Care" as the sender name for admin users
        senderName = "Customer Care";
      }
      
      // Add the message to the messages subcollection
      await addDoc(collection(db, 'chats', selectedChatId, 'messages'), {
        text: text || '',
        imageUrl: imageUrl || null,
        senderUid: senderUid,
        senderName: senderName,
        timestamp: serverTimestamp(),
        isRead: false
      });
      
      // Update the chat document with the last message
      const chatRef = doc(db, 'chats', selectedChatId);
      
      await updateDoc(chatRef, {
        lastMessage: {
          text: text || '',
          imageUrl: imageUrl || null,
          senderUid: senderUid,
          timestamp: serverTimestamp()
        },
        lastMessageTime: serverTimestamp(),
        // Increment unread count for the other user
        [isAdmin ? 'sellerUnreadCount' : 'adminUnreadCount']: arrayUnion(1)
      });
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  // Fetch other user details when selected chat changes
  useEffect(() => {
    const fetchOtherUserDetails = async () => {
      if (!selectedChatId) {
        setLocalUserDetails(null);
        return;
      }
      
      try {
        const chatDoc = await getDoc(doc(db, 'chats', selectedChatId));
        if (!chatDoc.exists()) return;
        
        const chatData = chatDoc.data();
        const otherUserUid = isAdmin ? chatData.sellerUid : chatData.adminUid;
        
        // If the current user is a seller and the other user is an admin, display "Customer Care"
        if (!isAdmin) {
          setLocalUserDetails({
            uid: otherUserUid,
            displayName: "Customer Care"
          });
          return;
        }
        
        // If the current user is an admin, make sure to display seller's email
        const userDoc = await getDoc(doc(db, isAdmin ? 'sellers' : 'admins', otherUserUid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          
          if (isAdmin) {
            // For admin dashboard, always show seller's email
            setLocalUserDetails({
              uid: otherUserUid,
              displayName: userData.email || 'Unknown User'
            });
          } else {
            // For other cases, use normal display hierarchy
            setLocalUserDetails({
              uid: otherUserUid,
              displayName: userData.displayName || userData.shopName || userData.email || 'Unknown User'
            });
          }
        }
      } catch (error) {
        console.error('Error fetching chat details:', error);
      }
    };
    
    fetchOtherUserDetails();
  }, [selectedChatId, isAdmin]);

  // Use either the props otherUserDetails or our local state
  const displayUserDetails = otherUserDetails || localUserDetails;
  
  // Ensure admin email is hidden and displayed as Customer Care
  const displayName = displayUserDetails?.displayName === "mdzahid11@gmail.com" || displayUserDetails?.displayName === "Customer Care" 
    ? "Customer Care" 
    : displayUserDetails?.displayName || 'Chat';

  if (!selectedChatId) {
    return (
      <ChatContainer>
        <NoConversationContainer>
          <Typography variant="h6" color="text.secondary">
            Select a conversation to start chatting
          </Typography>
        </NoConversationContainer>
      </ChatContainer>
    );
  }

  return (
    <ChatContainer>
      <ChatHeader>
        <IconButton onClick={onBackClick} sx={{ mr: 1 }} size="small">
          <ArrowBackIcon />
        </IconButton>
        
        <Typography variant="subtitle1" fontWeight="medium">
          {displayName}
        </Typography>
        
        <Box sx={{ flexGrow: 1 }} />
        
        <Tooltip title="More options">
          <IconButton size="small">
            <MoreVertIcon />
          </IconButton>
        </Tooltip>
      </ChatHeader>
      
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          <Box sx={{ 
            padding: '8px 16px', 
            backgroundColor: alpha('#fafafa', 0.8), 
            borderBottom: '1px solid #eee',
            display: 'flex',
            justifyContent: 'center'
          }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic', fontSize: '0.7rem' }}>
              Messages in this conversation will be automatically deleted after 24 hours
            </Typography>
          </Box>
          
          <MessagesContainer>
            {messages.length === 0 ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                <Typography color="text.secondary">No messages yet. Start a conversation!</Typography>
              </Box>
            ) : (
              messages.map((message) => (
                <Message 
                  key={message.id}
                  message={message}
                  isAdmin={isAdmin}
                />
              ))
            )}
            <div ref={messagesEndRef} />
          </MessagesContainer>
          
          <Box sx={{ p: 2 }}>
            <ChatInput 
              onSendMessage={handleSendMessage}
              currentUserUid={currentUserUid}
            />
          </Box>
        </>
      )}
    </ChatContainer>
  );
};

export default ChatWindow; 