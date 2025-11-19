/**
 * Utility functions for Rúnar
 */

export class Utils {
    /**
     * Format timestamp as relative time (e.g., "5m ago", "2h ago", "Yesterday")
     * @param {number} timestamp - Unix timestamp in milliseconds
     * @returns {string} Formatted relative time
     */
    static formatRelativeTime(timestamp) {
        const now = Date.now();
        const diff = now - timestamp;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (seconds < 60) {
            return "Just now";
        } else if (minutes < 60) {
            return `${minutes}m ago`;
        } else if (hours < 24) {
            return `${hours}h ago`;
        } else if (days === 1) {
            return "Yesterday";
        } else if (days < 7) {
            return `${days}d ago`;
        } else {
            // For older messages, show the date
            const date = new Date(timestamp);
            return date.toLocaleDateString();
        }
    }

    /**
     * Format timestamp as full date and time
     * @param {number} timestamp - Unix timestamp in milliseconds
     * @returns {string} Formatted date and time
     */
    static formatFullTimestamp(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleString();
    }

    /**
     * Get user initials for avatar fallback
     * @param {string} name - User name
     * @returns {string} User initials (max 2 characters)
     */
    static getUserInitials(name) {
        if (!name) return "?";
        const words = name.trim().split(/\s+/);
        if (words.length === 1) {
            return words[0].substring(0, 2).toUpperCase();
        }
        return (words[0][0] + words[words.length - 1][0]).toUpperCase();
    }

    /**
     * Parse mentions in message content (@username)
     * @param {string} content - Message content
     * @returns {Array} Array of mentioned user IDs
     */
    static parseMentions(content) {
        const mentionRegex = /@(\w+)/g;
        const mentions = [];
        let match;
        
        while ((match = mentionRegex.exec(content)) !== null) {
            const username = match[1];
            const user = game.users.find(u => u.name.toLowerCase() === username.toLowerCase());
            if (user) {
                mentions.push(user.id);
            }
        }
        
        return [...new Set(mentions)]; // Remove duplicates
    }

    /**
     * Highlight mentions in message content
     * @param {string} content - Message content
     * @returns {string} HTML with highlighted mentions
     */
    static highlightMentions(content) {
        if (!content) return content;
        
        const mentionRegex = /@(\w+)/g;
        return content.replace(mentionRegex, (match, username) => {
            const user = game.users.find(u => u.name.toLowerCase() === username.toLowerCase());
            if (user) {
                const isCurrentUser = user.id === game.user.id;
                const className = isCurrentUser ? 'mention mention-me' : 'mention';
                return `<span class="${className}" data-user-id="${user.id}">@${user.name}</span>`;
            }
            return match;
        });
    }

    /**
     * Check if a message was sent by the current user
     * @param {string} senderId - Message sender ID
     * @returns {boolean}
     */
    static isOwnMessage(senderId) {
        return senderId === game.user.id;
    }

    /**
     * Get user avatar URL or generate initials
     * @param {string} userId - User ID
     * @returns {object} {type: 'image'|'initials', value: string}
     */
    static getUserAvatar(userId) {
        const user = game.users.get(userId);
        if (!user) return { type: 'initials', value: '?' };
        
        if (user.avatar && user.avatar !== 'icons/svg/mystery-man.svg') {
            return { type: 'image', value: user.avatar };
        }
        
        return { type: 'initials', value: this.getUserInitials(user.name) };
    }

    /**
     * Sanitize HTML to prevent XSS
     * @param {string} html - Raw HTML string
     * @returns {string} Sanitized HTML
     */
    static sanitizeHTML(html) {
        const temp = document.createElement('div');
        temp.textContent = html;
        return temp.innerHTML;
    }

    /**
     * Check if user is online
     * @param {string} userId - User ID
     * @returns {boolean}
     */
    static isUserOnline(userId) {
        const user = game.users.get(userId);
        return user ? user.active : false;
    }

    /**
     * Generate a unique ID for messages
     * @returns {string}
     */
    static generateMessageId() {
        return `msg_${Date.now()}_${foundry.utils.randomID()}`;
    }

    /**
     * Debounce function to limit rapid function calls
     * @param {Function} func - Function to debounce
     * @param {number} wait - Wait time in milliseconds
     * @returns {Function} Debounced function
     */
    static debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
    
    /**
     * Parse and enhance rich content in messages
     * Handles: links, images, dice rolls, actor/item references
     * @param {string} content - Message content
     * @returns {string} Enhanced HTML content
     */
    static parseRichContent(content) {
        if (!content) return content;
        
        // Parse URLs into clickable links
        content = content.replace(
            /(https?:\/\/[^\s]+)/g,
            '<a href="$1" target="_blank" class="message-link">$1</a>'
        );
        
        // Parse image URLs into embedded images
        content = content.replace(
            /(https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp))/gi,
            '<img src="$1" class="message-image" alt="Image" />'
        );
        
        // Parse dice rolls [[/roll 1d20]]
        content = content.replace(
            /\[\[\/roll ([^\]]+)\]\]/g,
            '<span class="dice-roll" data-formula="$1" title="Click to roll">🎲 $1</span>'
        );
        
        // Parse actor references @Actor[id]{name}
        content = content.replace(
            /@Actor\[([^\]]+)\]\{([^\}]+)\}/g,
            '<span class="actor-ref" data-actor-id="$1" title="View actor">👤 $2</span>'
        );
        
        // Parse item references @Item[id]{name}
        content = content.replace(
            /@Item\[([^\]]+)\]\{([^\}]+)\}/g,
            '<span class="item-ref" data-item-id="$1" title="View item">📦 $2</span>'
        );
        
        return content;
    }
    
    /**
     * Format a quoted message for reply display
     * @param {Object} message - Original message object
     * @returns {string} Formatted reply HTML
     */
    static formatReplyQuote(message) {
        if (!message) return '';
        
        const shortContent = message.messageContent.length > 100 
            ? message.messageContent.substring(0, 100) + '...' 
            : message.messageContent;
            
        return `<div class="reply-quote">
            <strong>${message.senderName}</strong>: ${shortContent}
        </div>`;
    }
    
    /**
     * Show desktop notification for new message
     * @param {string} title - Notification title
     * @param {string} body - Notification body
     * @param {string} icon - Notification icon URL
     */
    static async showDesktopNotification(title, body, icon = null) {
        const MODULE_ID = 'ragnaroks-runar';
        
        // Check if enabled in settings
        if (!game.settings.get(MODULE_ID, 'enableDesktopNotifications')) return;
        
        // Check if window is already focused
        if (document.hasFocus()) return;
        
        // Request permission if not granted
        if (Notification.permission === 'default') {
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') return;
        }
        
        // Don't show if permission denied
        if (Notification.permission !== 'granted') return;
        
        // Create notification
        const notification = new Notification(title, {
            body: body,
            icon: icon || 'icons/svg/d20-black.svg',
            badge: 'icons/svg/d20-black.svg',
            tag: 'ragnaroks-runar-message',
            renotify: true
        });
        
        // Focus window on click
        notification.onclick = () => {
            window.focus();
            notification.close();
        };
        
        // Auto-close after 5 seconds
        setTimeout(() => notification.close(), 5000);
    }
    
    /**
     * Sort conversations by criteria
     * @param {Array} conversations - Array of conversation objects
     * @param {string} sortBy - 'recent', 'unread', 'alphabetical'
     * @returns {Array} Sorted conversations
     */
    static sortConversations(conversations, sortBy = 'recent') {
        const sorted = [...conversations];
        
        switch (sortBy) {
            case 'recent':
                sorted.sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0));
                break;
            case 'unread':
                sorted.sort((a, b) => (b.unreadCount || 0) - (a.unreadCount || 0));
                break;
            case 'alphabetical':
                sorted.sort((a, b) => a.name.localeCompare(b.name));
                break;
        }
        
        // Favorites always on top
        return sorted.sort((a, b) => {
            if (a.isFavorite && !b.isFavorite) return -1;
            if (!a.isFavorite && b.isFavorite) return 1;
            return 0;
        });
    }
}
