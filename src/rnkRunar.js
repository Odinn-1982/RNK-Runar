import { DataManager } from './DataManager.js';
import { SocketHandler } from './SocketHandler.js';
import { UIManager } from './UIManager.js';

export class RNKRunar {
    static ID = 'rnk-runar';
    static NAME = "RNK Runar";
    // REMOVED the static SOUNDS object.

    static initialize() {
        DataManager.loadGroupChats();
        DataManager.loadPrivateChats();
        DataManager.loadUnreadData();
        DataManager.loadFavorites();
        DataManager.loadMutedConversations();
        DataManager.loadPinnedMessages();
        DataManager.loadSharedBackgrounds();
        // Apply any persisted shared backgrounds to open windows
        for (const [uid, path] of DataManager.sharedBackgrounds.entries()) {
            if (path) UIManager.updateBackgroundForUser(uid, path);
        }
        SocketHandler.initialize();
        console.debug(`${this.NAME} | Initialized and ready.`);
    }
    
    static async sendMessage(recipientId, messageContent, speakerData = null) {
        const senderId = game.user.id;
        const messageData = { 
            senderId: senderId, 
            senderName: speakerData ? speakerData.name : game.user.name,
            senderImg: speakerData ? speakerData.img : game.user.avatar,
            messageContent: messageContent, 
            timestamp: Date.now(),
            id: foundry.utils.randomID()
        };
        
        // Add message to local storage
        DataManager.addPrivateMessage(senderId, recipientId, messageData);
        
        // Send to recipient
        SocketHandler.emit("privateMessage", { recipientId, message: messageData }, { recipients: [recipientId] });

        const recipientUser = game.users.get(recipientId);
        
        // If both are non-GMs, relay to active GM for monitoring
        if (!game.user.isGM && recipientUser && !recipientUser.isGM) {
            const gm = game.users.find(u => u.isGM && u.active);
            if (gm) {
                SocketHandler.emit("privateMessage", {
                    recipientId: gm.id,
                    message: messageData,
                    isRelay: true,
                    originalSenderId: senderId,
                    originalRecipientId: recipientId
                }, { recipients: [gm.id] });
            }
        }
        
        // If sender is GM, add to monitor immediately
        if (game.user.isGM) {
            const monitorPayload = {
                senderId: senderId,
                recipientId: recipientId,
                messageData: messageData
            };
            DataManager.addInterceptedMessage(monitorPayload);
            UIManager.updateGMMonitor();
            await DataManager.savePrivateChats();
        }
        
        // Update local UI
        UIManager.updateChatWindow(recipientId, 'private');
        UIManager.updatePlayerHub();
    }
}

