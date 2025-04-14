import { db } from '../firebase';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  deleteDoc, 
  doc,
  Timestamp,
  writeBatch
} from 'firebase/firestore';

/**
 * Deletes seller chat messages that are older than 24 hours
 * This function can be called periodically to clean up old messages
 */
export const cleanupOldChatMessages = async () => {
  try {
    console.log('Starting seller chat messages cleanup...');
    
    // Calculate timestamp for 24 hours ago
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
    const cutoffTimestamp = Timestamp.fromDate(twentyFourHoursAgo);
    
    // Get all chats
    const chatsRef = collection(db, 'chats');
    const chatsSnapshot = await getDocs(chatsRef);
    
    let totalDeletedMessages = 0;
    
    // Process each chat conversation
    for (const chatDoc of chatsSnapshot.docs) {
      const chatId = chatDoc.id;
      const messagesRef = collection(db, 'chats', chatId, 'messages');
      
      // Query for messages older than 24 hours
      const oldMessagesQuery = query(
        messagesRef,
        where('timestamp', '<', cutoffTimestamp)
      );
      
      const oldMessagesSnapshot = await getDocs(oldMessagesQuery);
      
      if (oldMessagesSnapshot.empty) continue;
      
      // Use batched writes for better performance
      const batch = writeBatch(db);
      let batchCount = 0;
      
      for (const messageDoc of oldMessagesSnapshot.docs) {
        batch.delete(doc(db, 'chats', chatId, 'messages', messageDoc.id));
        batchCount++;
        totalDeletedMessages++;
        
        // Firestore batches are limited to 500 operations
        if (batchCount >= 450) {
          await batch.commit();
          console.log(`Committed batch with ${batchCount} deleted messages`);
          // Start a new batch
          batchCount = 0;
        }
      }
      
      // Commit any remaining operations
      if (batchCount > 0) {
        await batch.commit();
        console.log(`Committed final batch with ${batchCount} deleted messages for chat ${chatId}`);
      }
    }
    
    console.log(`Cleanup completed: ${totalDeletedMessages} messages deleted`);
    return totalDeletedMessages;
  } catch (error) {
    console.error('Error cleaning up old chat messages:', error);
    throw error;
  }
};

/**
 * Creates a background worker to periodically clean up old chat messages
 * Should be initialized at application startup
 */
export const initializeChatCleanupWorker = () => {
  const CLEANUP_INTERVAL = 3600000; // Run every hour (in milliseconds)
  
  // Run once at initialization
  setTimeout(() => {
    cleanupOldChatMessages()
      .then(count => console.log(`Initial cleanup completed: ${count} messages deleted`))
      .catch(err => console.error('Initial cleanup failed:', err));
  }, 10000); // Wait 10 seconds after initialization to start
  
  // Then run periodically 
  setInterval(() => {
    cleanupOldChatMessages()
      .catch(err => console.error('Scheduled cleanup failed:', err));
  }, CLEANUP_INTERVAL);
  
  console.log('Chat cleanup worker initialized');
}; 