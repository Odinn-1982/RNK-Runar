import { DataManager } from './DataManager.js';
import { UIManager } from './UIManager.js';
import { Utils } from './Utils.js';
import { SocketHandler } from './SocketHandler.js';

export class GMModWindow extends foundry.applications.api.ApplicationV2 {
    static DEFAULT_OPTIONS = {
        id: 'runar-gm-mod-window',
        classes: ['ragnaroks-runar'],
        window: {
            title: "GM Moderation Tools",
            icon: "fas fa-shield-alt",
            resizable: true,
        },
        position: {
            width: 800,
            height: 600
        },
        actions: {}
    };

    static PARTS = {
        form: {
            template: 'modules/ragnaroks-runar/templates/gm-mod.hbs'
        }
    };

    _filterUser = '';
    _filterConversation = '';
    _filterType = 'all'; // 'all', 'private', 'group'

    async _prepareContext() {
        let messages = DataManager.getAllMessages();

        // Apply filters
        if (this._filterUser) {
            messages = messages.filter(msg => 
                msg.senderId === this._filterUser || 
                msg.senderName.toLowerCase().includes(this._filterUser.toLowerCase())
            );
        }

        if (this._filterConversation) {
            messages = messages.filter(msg => 
                msg.conversationName.toLowerCase().includes(this._filterConversation.toLowerCase())
            );
        }

        if (this._filterType !== 'all') {
            messages = messages.filter(msg => msg.conversationType === this._filterType);
        }

        // Format messages for display
        messages = messages.map(msg => ({
            ...msg,
            displayTime: Utils.formatFullTimestamp(msg.timestamp),
            relativeTime: Utils.formatRelativeTime(msg.timestamp),
            contentPreview: msg.messageContent.substring(0, 100) + (msg.messageContent.length > 100 ? '...' : '')
        }));

        // Get user list for filter
        const users = Array.from(game.users).map(u => ({
            id: u.id,
            name: u.name
        }));

        // Get conversation list
        const conversations = [];
        for (const [chatKey, chat] of DataManager.privateChats.entries()) {
            const [userId1, userId2] = chat.users;
            const user1 = game.users.get(userId1);
            const user2 = game.users.get(userId2);
            conversations.push({
                id: chatKey,
                name: `${user1?.name || 'Unknown'} ↔ ${user2?.name || 'Unknown'}`,
                type: 'private'
            });
        }
        for (const [groupId, group] of DataManager.groupChats.entries()) {
            conversations.push({
                id: groupId,
                name: group.name,
                type: 'group'
            });
        }

        return {
            messages,
            users,
            conversations,
            filterUser: this._filterUser,
            filterConversation: this._filterConversation,
            filterType: this._filterType,
            totalMessages: messages.length
        };
    }

    _onRender(context, options) {
        super._onRender(context, options);

        // Filter controls
        const userFilter = this.element.querySelector('#user-filter');
        if (userFilter) {
            userFilter.addEventListener('change', (e) => {
                this._filterUser = e.target.value;
                this.render(false);
            });
        }

        const convFilter = this.element.querySelector('#conversation-filter');
        if (convFilter) {
            convFilter.addEventListener('input', (e) => {
                this._filterConversation = e.target.value;
                this.render(false);
            });
        }

        const typeFilter = this.element.querySelector('#type-filter');
        if (typeFilter) {
            typeFilter.addEventListener('change', (e) => {
                this._filterType = e.target.value;
                this.render(false);
            });
        }

        // Clear filters button
        const clearBtn = this.element.querySelector('.clear-filters-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                this._filterUser = '';
                this._filterConversation = '';
                this._filterType = 'all';
                this.render(false);
            });
        }

        // Message action buttons
        this.element.querySelectorAll('.view-conversation-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this._onViewConversation(e));
        });

        this.element.querySelectorAll('.delete-message-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this._onDeleteMessage(e));
        });

        this.element.querySelectorAll('.clear-conversation-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this._onClearConversation(e));
        });

        this.element.querySelectorAll('.export-conversation-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this._onExportConversation(e));
        });
    }

    async _onViewConversation(event) {
        const conversationId = event.currentTarget.dataset.conversationId;
        const conversationType = event.currentTarget.dataset.conversationType;

        if (conversationType === 'group') {
            UIManager.openGroupChat(conversationId);
        } else {
            // For private chats, extract one of the user IDs
            const [userId1, userId2] = conversationId.split('-');
            const otherUserId = userId1 === game.user.id ? userId2 : userId1;
            UIManager.openChatFor(otherUserId);
        }
    }

    async _onDeleteMessage(event) {
        const messageId = event.currentTarget.dataset.messageId;
        const conversationId = event.currentTarget.dataset.conversationId;
        const conversationType = event.currentTarget.dataset.conversationType;

        const confirmed = await Dialog.confirm({
            title: "Delete Message",
            content: "<p>Are you sure you want to delete this message? This action cannot be undone.</p>",
            defaultYes: false
        });

        if (!confirmed) return;

        const isGroup = conversationType === 'group';
        DataManager.deleteMessage(conversationId, messageId, isGroup);

        await (isGroup ? DataManager.saveGroupChats() : DataManager.savePrivateChats());

        // Emit socket event
        SocketHandler.emit('deleteMessage', {
            conversationId,
            messageId,
            isGroup
        });

        // Update UI
        this.render(false);
        ui.notifications.info("Message deleted");
    }

    async _onClearConversation(event) {
        const conversationId = event.currentTarget.dataset.conversationId;
        const conversationType = event.currentTarget.dataset.conversationType;
        const conversationName = event.currentTarget.dataset.conversationName;

        const confirmed = await Dialog.confirm({
            title: "Clear Conversation",
            content: `<p>Are you sure you want to clear ALL messages from <strong>${conversationName}</strong>?</p><p>This action cannot be undone.</p>`,
            defaultYes: false
        });

        if (!confirmed) return;

        const isGroup = conversationType === 'group';
        const success = await DataManager.clearConversation(conversationId, isGroup);

        if (success) {
            // Emit socket event to update all clients
            SocketHandler.emit('clearConversation', {
                conversationId,
                isGroup
            });

            // Update UI
            UIManager.updateChatWindow(conversationId, conversationType);
            this.render(false);
            ui.notifications.info("Conversation cleared");
        } else {
            ui.notifications.error("Failed to clear conversation");
        }
    }

    async _onExportConversation(event) {
        const conversationId = event.currentTarget.dataset.conversationId;
        const conversationType = event.currentTarget.dataset.conversationType;
        const conversationName = event.currentTarget.dataset.conversationName;

        const isGroup = conversationType === 'group';
        const exportData = DataManager.exportConversationHistory(conversationId, isGroup);

        if (!exportData) {
            ui.notifications.warn("No messages to export");
            return;
        }

        // Create a download
        const blob = new Blob([exportData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `runar-${conversationName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        ui.notifications.info("Conversation exported successfully");
    }
}
