import React, { useState } from 'react';
import { Box, Typography, Avatar, Paper, styled, alpha, CircularProgress } from '@mui/material';
import { Image, Transformation } from 'cloudinary-react';
import { cloudinary } from '../../utils/cloudinaryConfig';

const MessageContainer = styled(Box)(({ theme, isAdmin }) => ({
  display: 'flex',
  justifyContent: isAdmin ? 'flex-end' : 'flex-start',
  marginBottom: theme.spacing(2),
  width: '100%',
}));

const MessageBubble = styled(Paper)(({ theme, isAdmin }) => ({
  padding: theme.spacing(1.5),
  borderRadius: '18px',
  maxWidth: '70%',
  boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
  position: 'relative',
  backgroundColor: isAdmin 
    ? alpha(theme.palette.primary.main, 0.1)
    : alpha(theme.palette.secondary.main, 0.1),
  borderTopLeftRadius: isAdmin ? '18px' : '4px',
  borderTopRightRadius: isAdmin ? '4px' : '18px',
}));

const MessageContent = styled(Box)({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
});

const MessageTimeStamp = styled(Typography)(({ theme }) => ({
  fontSize: '0.7rem',
  color: theme.palette.text.secondary,
  alignSelf: 'flex-end',
  marginTop: '4px',
}));

const MessageImage = styled('img')({
  maxWidth: '100%',
  maxHeight: '200px',
  borderRadius: '8px',
  cursor: 'pointer',
  display: 'block',
});

const CloudinaryImage = ({ publicId, url, alt, onClick }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  
  if (!publicId && url) {
    return (
      <Box sx={{ position: 'relative' }}>
        {loading && (
          <Box sx={{ 
            position: 'absolute', 
            top: '50%', 
            left: '50%', 
            transform: 'translate(-50%, -50%)' 
          }}>
            <CircularProgress size={24} />
          </Box>
        )}
        <MessageImage
          src={url} 
          alt={alt}
          onClick={onClick}
          onLoad={() => setLoading(false)}
          onError={() => {
            setLoading(false);
            setError(true);
          }}
          style={{ display: loading ? 'none' : 'block' }}
        />
      </Box>
    );
  }
  
  const extractPublicId = (cloudinaryUrl) => {
    if (!cloudinaryUrl || !cloudinaryUrl.includes('cloudinary.com')) return null;
    
    try {
      const urlParts = cloudinaryUrl.split('/');
      const uploadIndex = urlParts.indexOf('upload');
      if (uploadIndex === -1) return null;
      
      return urlParts.slice(uploadIndex + 2).join('/');
    } catch (e) {
      console.error('Error extracting Cloudinary public ID:', e);
      return null;
    }
  };
  
  const imagePublicId = publicId || extractPublicId(url);
  
  if (imagePublicId) {
    return (
      <Box sx={{ position: 'relative' }}>
        {loading && (
          <Box sx={{ 
            position: 'absolute', 
            top: '50%', 
            left: '50%', 
            transform: 'translate(-50%, -50%)' 
          }}>
            <CircularProgress size={24} />
          </Box>
        )}
        <Image 
          publicId={imagePublicId} 
          cloudName={cloudinary.config().cloud.cloudName}
          onClick={onClick}
          onLoad={() => setLoading(false)}
          onError={() => {
            setLoading(false);
            setError(true);
          }}
          style={{ 
            maxWidth: '100%', 
            maxHeight: '200px', 
            borderRadius: '8px', 
            cursor: 'pointer',
            display: loading ? 'none' : 'block' 
          }}
        >
          <Transformation quality="auto" fetchFormat="auto" />
          <Transformation crop="limit" width="800" height="600" />
        </Image>
      </Box>
    );
  }
  
  return null;
};

const Message = ({ message, isAdmin }) => {
  const { text, imageUrl, timestamp, senderName, senderUid } = message;
  
  // Display "Customer Care" instead of "mdzahid11@gmail.com" for sender name
  const displayName = senderName === "mdzahid11@gmail.com" || senderName === "Customer Care" ? "Customer Care" : senderName;
  
  // Determine if this message is from the current user (either admin or seller)
  // isAdmin prop now represents whether the current user is admin, not the message sender
  const isCurrentUserMessage = (isAdmin && (senderName === "mdzahid11@gmail.com" || senderName === "Customer Care")) || 
                              (!isAdmin && senderName !== "mdzahid11@gmail.com" && senderName !== "Customer Care");
  
  const formattedTime = timestamp ? new Date(timestamp.toDate()).toLocaleString() : '';
  
  // Calculate and format when the message will be deleted (24 hours after creation)
  const getExpirationTime = () => {
    if (!timestamp) return '';
    
    const messageDate = timestamp.toDate();
    const expirationDate = new Date(messageDate);
    expirationDate.setHours(expirationDate.getHours() + 24);
    
    // Check if message is about to expire
    const now = new Date();
    const hoursRemaining = Math.max(0, Math.floor((expirationDate - now) / (1000 * 60 * 60)));
    const minutesRemaining = Math.max(0, Math.floor(((expirationDate - now) % (1000 * 60 * 60)) / (1000 * 60)));
    
    if (hoursRemaining === 0 && minutesRemaining < 30) {
      return `Expires in ${minutesRemaining} min`;
    } else if (hoursRemaining < 3) {
      return `Expires in ${hoursRemaining}h ${minutesRemaining}m`;
    } else {
      return `Expires: ${expirationDate.toLocaleTimeString()}`;
    }
  };
  
  const handleImageClick = (url) => {
    window.open(url, '_blank');
  };

  const isCloudinaryImage = imageUrl && imageUrl.includes('cloudinary.com');

  return (
    <MessageContainer isAdmin={isCurrentUserMessage}>
      {!isCurrentUserMessage && (
        <Avatar 
          sx={{ mr: 1, width: 36, height: 36 }}
          alt={displayName}
        />
      )}
      <MessageBubble isAdmin={isCurrentUserMessage}>
        <MessageContent>
          {!isCurrentUserMessage && (
            <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary' }}>
              {displayName}
            </Typography>
          )}
          {text && (
            <Typography variant="body2">
              {text}
            </Typography>
          )}
          {imageUrl && (
            isCloudinaryImage ? (
              <CloudinaryImage
                url={imageUrl}
                alt="Message attachment"
                onClick={() => handleImageClick(imageUrl)}
              />
            ) : (
              <MessageImage 
                src={imageUrl} 
                alt="Message attachment"
                onClick={() => handleImageClick(imageUrl)}
              />
            )
          )}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <MessageTimeStamp variant="caption">
              {formattedTime}
            </MessageTimeStamp>
            <Typography variant="caption" sx={{ 
              fontSize: '0.65rem', 
              color: 'text.disabled',
              fontStyle: 'italic'
            }}>
              {getExpirationTime()}
            </Typography>
          </Box>
        </MessageContent>
      </MessageBubble>
      {isCurrentUserMessage && (
        <Avatar 
          sx={{ ml: 1, width: 36, height: 36 }}
          alt={senderName === "mdzahid11@gmail.com" || senderName === "Customer Care" ? "Customer Care" : displayName}
        />
      )}
    </MessageContainer>
  );
};

export default Message; 