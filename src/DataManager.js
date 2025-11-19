export class DataManager {
    static ID = 'ragnaroks-runar';
    static privateChats = new Map();
    static groupChats = new Map();
    static interceptedMessages = [];
    static unreadCounts = new Map(); // Track unread messages per conversation
    static lastRead = new Map(); // Track last read timestamp per conversation
    static typingUsers = new Map(); // Track who is typing in which conversation
    static favorites = new Set(); // Track favorite conversations
    static lastActivity = new Map(); // Track last activity timestamp per conversation
    static mutedConversations = new Set(); // Track muted conversations
    static pinnedMessages = new Map(); // Track pinned messages per conversation

    static _sanitizeHistory(history) {
        if (!Array.isArray(history)) return [];
        const seenIds = new Set();
        const seenSignatures = new Set();
        const sanitized = [];
        for (const msg of history) {
            if (!msg || typeof msg !== 'object') continue;
            if (!msg.id) {
                msg.id = foundry.utils.randomID();
            }
            if (seenIds.has(msg.id)) continue;
            const hasSignature = Boolean(msg.senderId) && Boolean(msg.timestamp) && typeof msg.messageContent === 'string';
            const signatureBase = hasSignature ? `${msg.senderId}|${msg.timestamp}|${msg.messageContent}` : null;
            if (signatureBase && seenSignatures.has(signatureBase)) continue;
            seenIds.add(msg.id);
            if (signatureBase) {
                seenSignatures.add(signatureBase);
            }
            sanitized.push(msg);
        }
        return sanitized;
    }

    static getPrivateChatKey(userId1, userId2) {
        return [userId1, userId2].sort().join('-');
    }

    static async loadGroupChats() {
        const groupsData = game.settings.get(this.ID, 'groupChats') || {};
        this.groupChats = new Map(Object.entries(groupsData));
        for (const [groupId, group] of this.groupChats.entries()) {
            const history = group?.history ?? group?.messages ?? [];
            group.history = this._sanitizeHistory(history);
            if (group?.messages) delete group.messages;
            this.groupChats.set(groupId, group);
        }
    }

    static async loadPrivateChats() {
        const chatsData = game.settings.get(this.ID, 'privateChats') || {};
        this.privateChats = new Map(Object.entries(chatsData));
        for (const [chatKey, chat] of this.privateChats.entries()) {
            const history = chat?.history ?? [];
            chat.history = this._sanitizeHistory(history);
            this.privateChats.set(chatKey, chat);
        }
    }

    static async saveGroupChats() {
        if (!game.user.isGM) return;
        await game.settings.set(this.ID, 'groupChats', Object.fromEntries(this.groupChats));
    }

    static async savePrivateChats() {
        if (!game.user.isGM) return;
        await game.settings.set(this.ID, 'privateChats', Object.fromEntries(this.privateChats));
    }

    static addPrivateMessage(userId1, userId2, messageData) {
        const chatKey = this.getPrivateChatKey(userId1, userId2);
        if (!this.privateChats.has(chatKey)) {
            this.privateChats.set(chatKey, { users: [userId1, userId2], history: [] });
        }
        if (messageData && Object.keys(messageData).length > 0) {
            // Ensure message has an ID
            if (!messageData.id) {
                messageData.id = foundry.utils.randomID();
            }
            
            // Check for duplicates - don't add if message with this ID already exists
            const chat = this.privateChats.get(chatKey);
            const exists = chat.history.some(msg => msg.id === messageData.id);
            if (!exists) {
                chat.history.push(messageData);
            }
            chat.history = this._sanitizeHistory(chat.history);
            // Update activity
            this.updateActivity(chatKey);
        }
    }
    
    static addGroupMessage(groupId, messageData) {
        const group = this.groupChats.get(groupId);
        if (!group) {
            console.warn(`RÚNAR | Attempted to add message to non-existent group: ${groupId}`);
            return;
        }
        if (!group.history) {
            group.history = [];
        }
        if (messageData && Object.keys(messageData).length > 0) {
            // Ensure message has an ID
            if (!messageData.id) {
                messageData.id = foundry.utils.randomID();
            }
            
            // Check for duplicates - don't add if message with this ID already exists
            const exists = group.history.some(msg => msg.id === messageData.id);
            if (!exists) {
                group.history.push(messageData);
            }
            group.history = this._sanitizeHistory(group.history);
            // Update activity
            this.updateActivity(groupId);
        }
    }

    static addInterceptedMessage(payload) {
        payload.id = foundry.utils.randomID();
        this.interceptedMessages.push(payload);
        if (this.interceptedMessages.length > 50) this.interceptedMessages.shift();
    }
    
    // Unread message tracking
    static markAsRead(conversationId) {
        this.lastRead.set(conversationId, Date.now());
        this.unreadCounts.set(conversationId, 0);
        this.saveUnreadData();
    }
    
    static incrementUnread(conversationId) {
        const current = this.unreadCounts.get(conversationId) || 0;
        this.unreadCounts.set(conversationId, current + 1);
        this.saveUnreadData();
    }
    
    static getUnreadCount(conversationId) {
        return this.unreadCounts.get(conversationId) || 0;
    }
    
    static getTotalUnread() {
        let total = 0;
        for (const count of this.unreadCounts.values()) {
            total += count;
        }
        return total;
    }
    
    static async saveUnreadData() {
        await game.settings.set(this.ID, 'unreadData', {
            counts: Object.fromEntries(this.unreadCounts),
            lastRead: Object.fromEntries(this.lastRead)
        });
    }
    
    static async loadUnreadData() {
        const data = game.settings.get(this.ID, 'unreadData') || { counts: {}, lastRead: {} };
        this.unreadCounts = new Map(Object.entries(data.counts || {}));
        this.lastRead = new Map(Object.entries(data.lastRead || {}));
    }
    
    // Message editing and deletion
    static editMessage(conversationId, messageId, newContent, isGroup = false) {
        const chat = isGroup ? this.groupChats.get(conversationId) : this.privateChats.get(conversationId);
        if (!chat) return false;
        
        const messages = chat.history || [];
        const message = messages?.find(m => m.id === messageId);
        if (!message) return false;
        
        message.messageContent = newContent;
        message.edited = true;
        message.editedAt = Date.now();
        return true;
    }
    
    static deleteMessage(conversationId, messageId, isGroup = false) {
        const chat = isGroup ? this.groupChats.get(conversationId) : this.privateChats.get(conversationId);
        if (!chat) return false;
        
        const messages = chat.history || [];
        if (!messages) return false;
        
        const index = messages.findIndex(m => m.id === messageId);
        if (index === -1) return false;
        
        messages.splice(index, 1);
        return true;
    }
    
    // Typing indicator management
    static setTyping(conversationId, userId, isTyping) {
        if (!this.typingUsers.has(conversationId)) {
            this.typingUsers.set(conversationId, new Map());
        }
        
        const conversationTyping = this.typingUsers.get(conversationId);
        const alreadyTyping = conversationTyping.has(userId);
        let changed = false;
        if (isTyping) {
            // Set timestamp; detect if this is a change in typing state
            if (!alreadyTyping) changed = true;
            conversationTyping.set(userId, Date.now());
        } else {
            if (alreadyTyping) changed = true;
            conversationTyping.delete(userId);
        }

        return changed;
    }
    
    static getTypingUsers(conversationId) {
        const conversationTyping = this.typingUsers.get(conversationId);
        if (!conversationTyping) return [];
        
        const now = Date.now();
        const typingUsers = [];
        
        // Clean up stale typing indicators (older than 5 seconds)
        for (const [userId, timestamp] of conversationTyping.entries()) {
            if (now - timestamp > 5000) {
                conversationTyping.delete(userId);
            } else {
                const user = game.users.get(userId);
                if (user) typingUsers.push(user.name);
            }
        }
        
        return typingUsers;
    }
    
    // Message reactions
    static addReaction(conversationId, messageId, emoji, userId, isGroup = false) {
        const chat = isGroup ? this.groupChats.get(conversationId) : this.privateChats.get(conversationId);
        if (!chat) return false;
        
        const messages = chat.history || [];
        const message = messages?.find(m => m.id === messageId);
        if (!message) return false;
        
        if (!message.reactions) {
            message.reactions = {};
        }
        if (!message.reactions[emoji]) {
            message.reactions[emoji] = [];
        }
        
        // Toggle reaction (remove if already present, add if not)
        const index = message.reactions[emoji].indexOf(userId);
        if (index > -1) {
            message.reactions[emoji].splice(index, 1);
            if (message.reactions[emoji].length === 0) {
                delete message.reactions[emoji];
            }
        } else {
            message.reactions[emoji].push(userId);
        }
        
        return true;
    }
    
    // Reply tracking
    static setReplyTo(messageId) {
        this._replyToMessage = messageId;
    }
    
    static getReplyTo() {
        return this._replyToMessage;
    }
    
    static clearReplyTo() {
        this._replyToMessage = null;
    }
    
    // Favorites management
    static toggleFavorite(conversationId) {
        if (this.favorites.has(conversationId)) {
            this.favorites.delete(conversationId);
        } else {
            this.favorites.add(conversationId);
        }
        this.saveFavorites();
    }
    
    static isFavorite(conversationId) {
        return this.favorites.has(conversationId);
    }
    
    static async saveFavorites() {
        await game.settings.set(this.ID, 'favorites', Array.from(this.favorites));
    }
    
    static async loadFavorites() {
        const data = game.settings.get(this.ID, 'favorites') || [];
        this.favorites = new Set(data);
    }
    
    // Activity tracking
    static updateActivity(conversationId) {
        this.lastActivity.set(conversationId, Date.now());
    }
    
    static getLastActivity(conversationId) {
        return this.lastActivity.get(conversationId) || 0;
    }
    
    // Search messages
    static searchMessages(conversationId, query, isGroup = false) {
        const chat = isGroup ? this.groupChats.get(conversationId) : this.privateChats.get(conversationId);
        if (!chat) return [];
        
        const messages = chat.history || [];
        if (!messages) return [];
        
        const lowerQuery = query.toLowerCase();
        return messages.filter(msg => 
            msg.messageContent?.toLowerCase().includes(lowerQuery) ||
            msg.senderName?.toLowerCase().includes(lowerQuery)
        );
    }
    
    // Pagination
    static getMessagesPaginated(conversationId, isGroup = false, page = 1, pageSize = 20) {
        const chat = isGroup ? this.groupChats.get(conversationId) : this.privateChats.get(conversationId);
        if (!chat) return { messages: [], totalPages: 0, currentPage: page };
        
        const allMessages = chat.history || [];
        const totalPages = Math.ceil(allMessages.length / pageSize);
        const startIndex = (page - 1) * pageSize;
        const endIndex = startIndex + pageSize;
        const messages = allMessages.slice(startIndex, endIndex);
        
        return { messages, totalPages, currentPage: page, totalMessages: allMessages.length };
    }
    
    // Mute management
    static toggleMute(conversationId) {
        if (this.mutedConversations.has(conversationId)) {
            this.mutedConversations.delete(conversationId);
        } else {
            this.mutedConversations.add(conversationId);
        }
        this.saveMutedConversations();
    }
    
    static isMuted(conversationId) {
        return this.mutedConversations.has(conversationId);
    }
    
    static async saveMutedConversations() {
        await game.settings.set(this.ID, 'mutedConversations', Array.from(this.mutedConversations));
    }
    
    static async loadMutedConversations() {
        const data = game.settings.get(this.ID, 'mutedConversations') || [];
        this.mutedConversations = new Set(data);
    }
    
    // Pinned messages
    static togglePinMessage(conversationId, messageId) {
        if (!this.pinnedMessages.has(conversationId)) {
            this.pinnedMessages.set(conversationId, new Set());
        }
        
        const pins = this.pinnedMessages.get(conversationId);
        if (pins.has(messageId)) {
            pins.delete(messageId);
        } else {
            pins.add(messageId);
        }
        this.savePinnedMessages();
    }
    
    static isPinned(conversationId, messageId) {
        const pins = this.pinnedMessages.get(conversationId);
        return pins ? pins.has(messageId) : false;
    }
    
    static getPinnedMessages(conversationId) {
        const pins = this.pinnedMessages.get(conversationId);
        return pins ? Array.from(pins) : [];
    }
    
    static async savePinnedMessages() {
        const data = {};
        for (const [convId, pins] of this.pinnedMessages.entries()) {
            data[convId] = Array.from(pins);
        }
        await game.settings.set(this.ID, 'pinnedMessages', data);
    }
    
    static async loadPinnedMessages() {
        const data = game.settings.get(this.ID, 'pinnedMessages') || {};
        this.pinnedMessages = new Map();
        for (const [convId, pins] of Object.entries(data)) {
            this.pinnedMessages.set(convId, new Set(pins));
        }
    }
    
    // Group management
    static async renameGroup(groupId, newName) {
        const group = this.groupChats.get(groupId);
        if (!group) return false;
        
        group.name = newName;
        await this.saveGroupChats();
        return true;
    }
    
    static async addGroupMember(groupId, userId) {
        const group = this.groupChats.get(groupId);
        if (!group || group.members.includes(userId)) return false;
        
        group.members.push(userId);
        await this.saveGroupChats();
        return true;
    }
    
    static async removeGroupMember(groupId, userId) {
        const group = this.groupChats.get(groupId);
        if (!group) return false;
        
        group.members = group.members.filter(id => id !== userId);
        await this.saveGroupChats();
        return true;
    }
    
    // GM Moderation Tools
    static async clearConversation(conversationId, isGroup) {
        if (!game.user.isGM) return false;
        
        if (isGroup) {
            const group = this.groupChats.get(conversationId);
            if (group) {
                group.history = [];
                await this.saveGroupChats();
                return true;
            }
        } else {
            const chat = this.privateChats.get(conversationId);
            if (chat) {
                chat.history = [];
                await this.savePrivateChats();
                return true;
            }
        }
        return false;
    }
    
    static getAllMessages() {
        if (!game.user.isGM) return [];
        
        const allMessages = [];
        
        // Collect private messages
        for (const [chatKey, chat] of this.privateChats.entries()) {
            const [userId1, userId2] = chat.users;
            const user1 = game.users.get(userId1);
            const user2 = game.users.get(userId2);
            
            chat.history.forEach(msg => {
                allMessages.push({
                    ...msg,
                    conversationId: chatKey,
                    conversationType: 'private',
                    conversationName: `${user1?.name || 'Unknown'} ↔ ${user2?.name || 'Unknown'}`
                });
            });
        }
        
        // Collect group messages
        for (const [groupId, group] of this.groupChats.entries()) {
            group.history.forEach(msg => {
                allMessages.push({
                    ...msg,
                    conversationId: groupId,
                    conversationType: 'group',
                    conversationName: group.name
                });
            });
        }
        
        // Sort by timestamp
        return allMessages.sort((a, b) => b.timestamp - a.timestamp);
    }
    
    static getMessagesByUser(userId) {
        if (!game.user.isGM) return [];
        
        return this.getAllMessages().filter(msg => msg.senderId === userId);
    }
    
    static getMessagesByConversation(conversationId, isGroup) {
        if (!game.user.isGM) return [];
        
        if (isGroup) {
            const group = this.groupChats.get(conversationId);
            return group ? group.history : [];
        } else {
            const chat = this.privateChats.get(conversationId);
            return chat ? chat.history : [];
        }
    }
    
    static exportConversationHistory(conversationId, isGroup) {
        if (!game.user.isGM) return null;
        
        const messages = this.getMessagesByConversation(conversationId, isGroup);
        if (!messages || messages.length === 0) return null;
        
        let conversationName = '';
        if (isGroup) {
            const group = this.groupChats.get(conversationId);
            conversationName = group?.name || 'Unknown Group';
        } else {
            const chat = this.privateChats.get(conversationId);
            if (chat) {
                const [userId1, userId2] = chat.users;
                const user1 = game.users.get(userId1);
                const user2 = game.users.get(userId2);
                conversationName = `${user1?.name || 'Unknown'} and ${user2?.name || 'Unknown'}`;
            }
        }
        
        const exportData = {
            conversationName,
            conversationType: isGroup ? 'group' : 'private',
            exportDate: new Date().toISOString(),
            messageCount: messages.length,
            messages: messages.map(msg => ({
                timestamp: new Date(msg.timestamp).toISOString(),
                sender: msg.senderName,
                content: msg.messageContent,
                edited: msg.edited || false
            }))
        };
        
        return JSON.stringify(exportData, null, 2);
    }
    
    // Other functions like addGroupMessage can remain.
}
