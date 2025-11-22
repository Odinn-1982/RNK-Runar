import { DataManager } from './DataManager.js';
import { UIManager } from './UIManager.js';
import { Utils } from './Utils.js';
import { MODULE_ID, SOCKET_NAME } from './Constants.js';

export class SocketHandler {
    static SOCKET_NAME = SOCKET_NAME;

    static initialize() {
        game.socket.on(this.SOCKET_NAME, (data) => this._onSocketMessage(data));
    }

    static emit(type, payload, options = {}) {
        game.socket.emit(this.SOCKET_NAME, { type, payload }, options);
    }

    // FIX: Sound logic is moved here to be self-contained.
    static _playNotificationSound() {
        // Using MODULE_ID from Constants
        if (!game.settings.get(MODULE_ID, "enableSound")) return;
        
        // This sound logic was moved from RNKRunar.js
        const soundPath = game.settings.get(MODULE_ID, "gmOverrideEnabled")
            ? game.settings.get(MODULE_ID, "gmOverrideSoundPath")
            : game.settings.get(MODULE_ID, "notificationSound");
        const volume = game.settings.get(MODULE_ID, "notificationVolume");
        foundry.audio.AudioHelper.play({ src: soundPath, volume: volume, autoplay: true, loop: false }, false);
    }

    static async _onSocketMessage(data) {
        const isIncoming = (message) => message.senderId !== game.user.id;

        switch (data.type) {
            case "privateMessage": {
                const { recipientId, message, isRelay, originalSenderId, originalRecipientId } = data.payload;
                
                // Only process if this message is for us and we didn't send it
                if (recipientId !== game.user.id) break;
                if (!isIncoming(message)) break;

                if (isRelay && game.user.isGM) {
                    // GM receiving a relay - don't add to private chats, just monitor
                    const monitorPayload = {
                        senderId: originalSenderId,
                        recipientId: originalRecipientId,
                        messageData: message
                    };
                    DataManager.addInterceptedMessage(monitorPayload);
                    UIManager.updateGMMonitor();
                } 
                else if (!isRelay) {
                    // Normal message reception
                    DataManager.addPrivateMessage(message.senderId, recipientId, message);
                    if (game.user.isGM) await DataManager.savePrivateChats();
                    
                    // If GM is the recipient, add to monitor
                    if (game.user.isGM) {
                        const monitorPayload = {
                            senderId: message.senderId,
                            recipientId: recipientId,
                            messageData: message
                        };
                        DataManager.addInterceptedMessage(monitorPayload);
                        UIManager.updateGMMonitor();
                    }
                    
                    // Increment unread count
                    const chatKey = DataManager.getPrivateChatKey(message.senderId, recipientId);
                    DataManager.incrementUnread(chatKey);
                    
                    // Play sound
                    this._playNotificationSound();
                    
                    // Desktop notification
                    const senderUser = game.users.get(message.senderId);
                    if (senderUser) {
                        Utils.showDesktopNotification(
                            `New message from ${senderUser.name}`,
                            message.messageContent.substring(0, 100),
                            senderUser.avatar
                        );
                    }
                    
                    // Open/update chat window for new message
                    UIManager.openChatWindowForNewMessage(message.senderId, 'private');
                    UIManager.updatePlayerHub();
                }
                break;
            }
            case "groupMessage": {
                const { groupId, message } = data.payload;
                const group = DataManager.groupChats.get(groupId);
                if (group?.members.includes(game.user.id) && isIncoming(message)) {
                    DataManager.addGroupMessage(groupId, message);
                    if (game.user.isGM) await DataManager.saveGroupChats();
                    
                    // Increment unread count
                    DataManager.incrementUnread(groupId);
                    
                    // Play sound
                    this._playNotificationSound();
                    
                    // Desktop notification
                    const senderUser = game.users.get(message.senderId);
                    if (senderUser && group) {
                        Utils.showDesktopNotification(
                            `${senderUser.name} in ${group.name}`,
                            message.messageContent.substring(0, 100),
                            senderUser.avatar
                        );
                    }
                    
                    // Open/update chat window for new message
                    UIManager.openChatWindowForNewMessage(groupId, 'group');
                    UIManager.updatePlayerHub();
                }
                
                // Add group messages to GM monitor
                if (game.user.isGM && isIncoming(message)) {
                    const monitorPayload = {
                        senderId: message.senderId,
                        recipientId: null,
                        groupId: groupId,
                        groupName: group?.name || 'Unknown Group',
                        messageData: message
                    };
                    DataManager.addInterceptedMessage(monitorPayload);
                    UIManager.updateGMMonitor();
                }
                break;
            }
            case "typing": {
                const { conversationId, userId, isTyping, isGroup } = data.payload;
                const changed = DataManager.setTyping(conversationId, userId, isTyping);

                // Only update UI if that typing state changed to avoid noisy updates
                if (!changed) break;
                
                // Update just the typing indicator for the open chat window if it exists.
                if (isGroup) {
                    UIManager.updateTypingIndicator(conversationId, 'group');
                } else {
                    // For private chats, extract the other user ID from the conversation key
                    const parts = conversationId.split('-');
                    const otherUserId = parts.find(id => id !== game.user.id);
                    if (otherUserId) {
                        UIManager.updateTypingIndicator(otherUserId, 'private');
                    }
                }
                break;
            }
            case "editMessage": {
                const { conversationId, messageId, newContent, isGroup } = data.payload;
                DataManager.editMessage(conversationId, messageId, newContent, isGroup);
                
                if (game.user.isGM) {
                    await (isGroup ? DataManager.saveGroupChats() : DataManager.savePrivateChats());
                }
                
                // Update the open chat window
                if (isGroup) {
                    UIManager.updateChatWindow(conversationId, 'group');
                } else {
                    const parts = conversationId.split('-');
                    const otherUserId = parts.find(id => id !== game.user.id);
                    if (otherUserId) {
                        UIManager.updateChatWindow(otherUserId, 'private');
                    }
                }
                break;
            }
            case "deleteMessage": {
                const { conversationId, messageId, isGroup } = data.payload;
                DataManager.deleteMessage(conversationId, messageId, isGroup);
                
                if (game.user.isGM) {
                    await (isGroup ? DataManager.saveGroupChats() : DataManager.savePrivateChats());
                }
                
                // Update the open chat window
                if (isGroup) {
                    UIManager.updateChatWindow(conversationId, 'group');
                } else {
                    const parts = conversationId.split('-');
                    const otherUserId = parts.find(id => id !== game.user.id);
                    if (otherUserId) {
                        UIManager.updateChatWindow(otherUserId, 'private');
                    }
                }
                break;
            }
            case "addReaction": {
                const { conversationId, messageId, emoji, userId, isGroup } = data.payload;
                DataManager.addReaction(conversationId, messageId, emoji, userId, isGroup);
                
                if (game.user.isGM) {
                    await (isGroup ? DataManager.saveGroupChats() : DataManager.savePrivateChats());
                }
                
                // Update the open chat window
                if (isGroup) {
                    UIManager.updateChatWindow(conversationId, 'group');
                } else {
                    const parts = conversationId.split('-');
                    const otherUserId = parts.find(id => id !== game.user.id);
                    if (otherUserId) {
                        UIManager.updateChatWindow(otherUserId, 'private');
                    }
                }
                break;
            }
            case "pinMessage": {
                const { conversationId, messageId, isPinned } = data.payload;
                // Note: Pin state is client-side only, so just update UI
                UIManager.updateChatWindow(conversationId, data.payload.isGroup ? 'group' : 'private');
                break;
            }
            case "renameGroup": {
                const { groupId, newName } = data.payload;
                const group = DataManager.groupChats.get(groupId);
                if (group) {
                    group.name = newName;
                    if (game.user.isGM) {
                        await DataManager.saveGroupChats();
                    }
                    UIManager.updateChatWindow(groupId, 'group');
                    UIManager.updatePlayerHub();
                }
                break;
            }
            case "addGroupMember": {
                const { groupId, userId } = data.payload;
                const group = DataManager.groupChats.get(groupId);
                if (group && !group.members.includes(userId)) {
                    group.members.push(userId);
                    if (game.user.isGM) {
                        await DataManager.saveGroupChats();
                    }
                    UIManager.updateChatWindow(groupId, 'group');
                    UIManager.updatePlayerHub();
                }
                break;
            }
            case "removeGroupMember": {
                const { groupId, userId } = data.payload;
                const group = DataManager.groupChats.get(groupId);
                if (group) {
                    group.members = group.members.filter(id => id !== userId);
                    if (game.user.isGM) {
                        await DataManager.saveGroupChats();
                    }
                    
                    // If removed user is viewing the chat, close it
                    if (userId === game.user.id) {
                        UIManager.closeChatWindow(groupId, 'group');
                    } else {
                        UIManager.updateChatWindow(groupId, 'group');
                    }
                    UIManager.updatePlayerHub();
                }
                break;
            }
            case "clearConversation": {
                const { conversationId, isGroup } = data.payload;
                
                if (isGroup) {
                    const group = DataManager.groupChats.get(conversationId);
                    if (group) {
                        group.history = [];
                        if (game.user.isGM) {
                            await DataManager.saveGroupChats();
                        }
                        UIManager.updateChatWindow(conversationId, 'group');
                    }
                } else {
                    const chat = DataManager.privateChats.get(conversationId);
                    if (chat) {
                        chat.history = [];
                        if (game.user.isGM) {
                            await DataManager.savePrivateChats();
                        }
                        // Update for both users
                        const parts = conversationId.split('-');
                        const otherUserId = parts.find(id => id !== game.user.id);
                        if (otherUserId) {
                            UIManager.updateChatWindow(otherUserId, 'private');
                        }
                    }
                }
                break;
            }
            // ... other cases remain the same
            case "groupCreate": { /* ... */ }
            case "groupDelete": { /* ... */ }
            case "backgroundUpdate": {
                const { userId, background, shared } = data.payload;
                // Store locally for immediate UI updates
                if (background) {
                    DataManager.setSharedBackground(userId, background);
                } else {
                    DataManager.setSharedBackground(userId, null);
                }
                UIManager.updateBackgroundForUser(userId, background);

                // If the GM received it, persist to world settings.
                if (game.user.isGM) {
                    await DataManager.saveSharedBackgrounds();
                }
                break;
            }
            case "themeUpdate": {
                const { theme } = data.payload;
                UIManager.applyTheme(theme);
                break;
            }
        }
    }
}

