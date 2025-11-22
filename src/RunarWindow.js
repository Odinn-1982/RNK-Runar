const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
import { DataManager } from './DataManager.js';
import { UIManager } from './UIManager.js';
import { SocketHandler } from './SocketHandler.js';
import { Utils } from './Utils.js';
import { MODULE_ID } from './Constants.js';

export class RunarWindow extends HandlebarsApplicationMixin(ApplicationV2) {

    constructor(options = {}) {
        super(options);
    this._preservedInputValue = ''; // Store the input value between renders
    this._typingTimeout = null;
    this._lastTypingEmit = 0;
    this._searchQuery = '';
    this._shouldScrollToBottom = true;
    this._boundSubmitHandler = this._handleFormSubmit.bind(this);
    this._boundRootKeydown = this._handleRootKeydown.bind(this);
    // Guard flags to prevent recursive/full-render storms
    this._isRendering = false;
    this._renderScheduled = false;
    }

    get id() {
        const base = 'runar-window';
        if (this.options.groupId) return `${base}-group-${this.options.groupId}`;
        if (this.options.otherUserId) return `${base}-private-${this.options.otherUserId}`;
        return `${base}-${foundry.utils.randomID()}`;
    }

    get title() {
        if (this.options.groupId) {
            const group = DataManager.groupChats.get(this.options.groupId);
            return group ? game.i18n.format("RNR.GroupChat", {name: group.name}) : game.i18n.localize("RNR.GroupChatDefault");
        }
        if (this.options.otherUserId) {
            const otherUser = game.users.get(this.options.otherUserId);
            return otherUser ? game.i18n.format("RNR.ChatWith", {name: otherUser.name}) : game.i18n.localize("RNR.PrivateChat");
        }
        return game.i18n.localize("RNR.AppName");
    }

    static DEFAULT_OPTIONS = {
        classes: ['rnk-runar', 'rnk-runar-chat-window'],
        position: { width: 400, height: 450 },
        window: { 
            resizable: true
        },
        // Opt-in to Foundry popout support so the header popout control appears and popOut state is honored.
        popOut: true,
        tag: 'form',
        form: { closeOnSubmit: false }
    };

    static PARTS = {
        form: { template: `modules/rnk-runar/templates/chat-window.hbs` }
    };

    async _prepareContext(options) {
        const context = { currentUser: game.user, isGM: game.user.isGM };
        if (context.isGM) {
            context.speakers = [
                { id: game.user.id, name: game.user.name, isActor: false },
                ...game.actors.filter(a => a.isOwner).map(a => ({ id: a.id, name: a.name, isActor: true }))
            ];
        }
        
        const conversationId = this.options.groupId || DataManager.getPrivateChatKey(game.user.id, this.options.otherUserId);
        context.isFavorite = DataManager.isFavorite(conversationId);
        context.isMuted = DataManager.isMuted(conversationId);
        context.isGroup = !!this.options.groupId;
        
        if (this.options.otherUserId) {
            const chatKey = DataManager.getPrivateChatKey(game.user.id, this.options.otherUserId);
            const chat = DataManager.privateChats.get(chatKey);
            let messages = chat ? chat.history : [];
            
            // Apply search filter if active
            if (this._searchQuery) {
                messages = DataManager.searchMessages(chatKey, this._searchQuery, false);
                context.searchActive = true;
                context.searchResults = messages;
            }
            
            // Mark as read when opening
            DataManager.markAsRead(chatKey);
            // Add relative timestamps and avatar info to messages
            messages.forEach(msg => {
                msg.relativeTime = Utils.formatRelativeTime(msg.timestamp);
                msg.fullTime = Utils.formatFullTimestamp(msg.timestamp);
                msg.isOwn = Utils.isOwnMessage(msg.senderId);
                // Highlight mentions and parse rich content
                msg.messageContent = Utils.parseRichContent(Utils.highlightMentions(msg.messageContent));
                // Check if pinned
                msg.isPinned = DataManager.isPinned(chatKey, msg.id);
                // Add reply context if this is a reply
                if (msg.replyToId) {
                    const replyToMsg = messages.find(m => m.id === msg.replyToId);
                    if (replyToMsg) {
                        msg.replyTo = Utils.formatReplyQuote(replyToMsg);
                    }
                }
                // Add edit timestamp if edited
                if (msg.edited) {
                    msg.editedTime = Utils.formatFullTimestamp(msg.editedAt);
                }
                // Format reactions
                if (msg.reactions) {
                    msg.reactions = Object.entries(msg.reactions).map(([emoji, users]) => ({
                        emoji,
                        count: users.length,
                        users: users.map(id => game.users.get(id)?.name).filter(Boolean).join(', '),
                        isOwnReaction: users.includes(game.user.id)
                    }));
                }
                const avatar = Utils.getUserAvatar(msg.senderId);
                if (avatar.type === 'initials') {
                    msg.avatarInitials = avatar.value;
                    msg.useInitials = true;
                } else {
                    msg.senderImg = avatar.value;
                    msg.useInitials = false;
                }
            });
            // Get typing users
            const typingNames = DataManager.getTypingUsers(chatKey);
            const typingText = typingNames.length > 0 ? 
                `${typingNames.join(', ')} ${typingNames.length === 1 ? 'is' : 'are'} typing...` : null;
            // Get reply preview if replying
            const replyToId = DataManager.getReplyTo();
            let replyingTo = null;
            if (replyToId) {
                const replyMsg = messages.find(m => m.id === replyToId);
                if (replyMsg) {
                    replyingTo = Utils.formatReplyQuote(replyMsg);
                }
            }
            Object.assign(context, {
                isGroup: false,
                otherUser: game.users.get(this.options.otherUserId),
                messages: messages,
                typingUsers: typingText,
                replyingTo: replyingTo
            });
        } else if (this.options.groupId) {
            const group = DataManager.groupChats.get(this.options.groupId);
            let messages = group ? group.messages : [];
            
            // Apply search filter if active
            if (this._searchQuery) {
                messages = DataManager.searchMessages(this.options.groupId, this._searchQuery, true);
                context.searchActive = true;
                context.searchResults = messages;
            }
            
            // Mark as read when opening
            DataManager.markAsRead(this.options.groupId);
            // Add relative timestamps and avatar info to messages
            messages.forEach(msg => {
                msg.relativeTime = Utils.formatRelativeTime(msg.timestamp);
                msg.fullTime = Utils.formatFullTimestamp(msg.timestamp);
                msg.isOwn = Utils.isOwnMessage(msg.senderId);
                // Highlight mentions and parse rich content
                msg.messageContent = Utils.parseRichContent(Utils.highlightMentions(msg.messageContent));
                // Check if pinned
                msg.isPinned = DataManager.isPinned(this.options.groupId, msg.id);
                // Add reply context if this is a reply
                if (msg.replyToId) {
                    const replyToMsg = messages.find(m => m.id === msg.replyToId);
                    if (replyToMsg) {
                        msg.replyTo = Utils.formatReplyQuote(replyToMsg);
                    }
                }
                // Add edit timestamp if edited
                if (msg.edited) {
                    msg.editedTime = Utils.formatFullTimestamp(msg.editedAt);
                }
                // Format reactions
                if (msg.reactions) {
                    msg.reactions = Object.entries(msg.reactions).map(([emoji, users]) => ({
                        emoji,
                        count: users.length,
                        users: users.map(id => game.users.get(id)?.name).filter(Boolean).join(', '),
                        isOwnReaction: users.includes(game.user.id)
                    }));
                }
                const avatar = Utils.getUserAvatar(msg.senderId);
                if (avatar.type === 'initials') {
                    msg.avatarInitials = avatar.value;
                    msg.useInitials = true;
                } else {
                    msg.senderImg = avatar.value;
                    msg.useInitials = false;
                }
            });
            // Get typing users
            const typingNames = DataManager.getTypingUsers(this.options.groupId);
            const typingText = typingNames.length > 0 ? 
                `${typingNames.join(', ')} ${typingNames.length === 1 ? 'is' : 'are'} typing...` : null;
            // Get reply preview if replying
            const replyToId = DataManager.getReplyTo();
            let replyingTo = null;
            if (replyToId) {
                const replyMsg = messages.find(m => m.id === replyToId);
                if (replyMsg) {
                    replyingTo = Utils.formatReplyQuote(replyMsg);
                }
            }
            Object.assign(context, {
                isGroup: true,
                group: group,
                messages: messages,
                typingUsers: typingText,
                replyingTo: replyingTo
            });
        }
        return context;
    }

    /**
     * Update only the typing indicator element in the DOM without re-rendering the whole window.
     */
    updateTypingIndicator() {
        const conversationId = this.options.groupId || DataManager.getPrivateChatKey(game.user.id, this.options.otherUserId);
        const typingNames = DataManager.getTypingUsers(conversationId);
        const typingText = typingNames.length > 0 ? `${typingNames.join(', ')} ${typingNames.length === 1 ? 'is' : 'are'} typing...` : null;
        const typingEl = this.element?.querySelector('.typing-indicator');

        if (!typingText) {
            if (typingEl) {
                typingEl.style.display = 'none';
            }
            return;
        }

        const content = `<i class="fas fa-ellipsis-h"></i> ${Utils.sanitizeHTML(typingText)}`;
        if (typingEl) {
            typingEl.style.display = '';
            typingEl.innerHTML = content;
        } else {
            // If the element isn't present (no typing previously), insert it at the end of message list.
            const messageList = this.element?.querySelector('.message-list');
            if (messageList) {
                const div = document.createElement('div');
                div.className = 'typing-indicator';
                div.innerHTML = content;
                messageList.appendChild(div);
            }
        }
    }

    _onRender(context, options) {
        super._onRender(context, options);
        // Scroll to bottom with smooth animation
        this.#scrollToBottom(this._shouldScrollToBottom);

        this.element.removeEventListener('submit', this._boundSubmitHandler);
        this.element.addEventListener('submit', this._boundSubmitHandler);
        
        // Search functionality
        const searchInput = this.element.querySelector('.message-search');
        if (searchInput) {
            searchInput.value = this._searchQuery;
            searchInput.addEventListener('input', Utils.debounce((e) => {
                this._searchQuery = e.target.value.trim();
                this._shouldScrollToBottom = false;
                this.render(true);
            }, 300));
        }
        
        // Favorite toggle button
        const favoriteBtn = this.element.querySelector('.favorite-toggle-btn');
        if (favoriteBtn) {
            favoriteBtn.addEventListener('click', () => this._onToggleFavorite());
        }

        // Add keyboard shortcuts
        const textarea = this.element.querySelector('textarea[name="message"]');
        if (textarea) {
            // Enter to send (Shift+Enter for new line)
            textarea.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    const formData = new foundry.applications.ux.FormDataExtended(this.element);
                    this._onSubmit(event, this.element, formData.object);
                }
                // Escape to close window
                if (event.key === 'Escape') {
                    event.preventDefault();
                    this.close();
                }
            });
            
            // Typing indicator
            textarea.addEventListener('input', () => {
                this._onTyping();
            });
            
            // Focus the textarea on render
            textarea.focus();
        }

        // Apply personalized or shared background for this window
        try {
            let bgPath = null;
            if (this.options.otherUserId) {
                const shared = DataManager.getSharedBackground(this.options.otherUserId);
                if (shared) bgPath = shared;
                else bgPath = game.settings.get(MODULE_ID, 'personalBackground') || null;
            } else if (this.options.groupId) {
                // For group chats, choose global or none for now
                bgPath = null;
            } else {
                bgPath = game.settings.get(MODULE_ID, 'personalBackground') || null;
            }
            UIManager.applyBackgroundToWindow(this, bgPath);
        } catch (e) { /* ignore */ }

        // Edit and delete button handlers
        this.element.querySelectorAll('.message-edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this._onEditMessage(e));
        });
        
        this.element.querySelectorAll('.message-delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this._onDeleteMessage(e));
        });
        
        // Reply button handlers
        this.element.querySelectorAll('.message-reply-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this._onReplyMessage(e));
        });
        
        // React button handlers
        this.element.querySelectorAll('.message-react-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this._onReactMessage(e));
        });
        
        // Reaction click handlers (toggle own reaction)
        this.element.querySelectorAll('.reaction-item').forEach(item => {
            item.addEventListener('click', (e) => this._onClickReaction(e));
        });
        
        // Pin button handlers
        this.element.querySelectorAll('.message-pin-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this._onPinMessage(e));
        });
        
        // Mute toggle button
        const muteToggleBtn = this.element.querySelector('.mute-toggle-btn');
        if (muteToggleBtn) {
            muteToggleBtn.addEventListener('click', () => this._onToggleMute());
        }
        
        // Manage group button
        const manageGroupBtn = this.element.querySelector('.manage-group-btn');
        if (manageGroupBtn) {
            manageGroupBtn.addEventListener('click', () => this._onManageGroup());
        }
        
        // Cancel reply button
        const cancelReplyBtn = this.element.querySelector('.cancel-reply-btn');
        if (cancelReplyBtn) {
            cancelReplyBtn.addEventListener('click', () => this._onCancelReply());
        }
        
        // Rich content click handlers
        this.element.querySelectorAll('.dice-roll').forEach(roll => {
            roll.addEventListener('click', (e) => this._onClickDiceRoll(e));
        });
        
        this.element.querySelectorAll('.actor-ref').forEach(ref => {
            ref.addEventListener('click', (e) => this._onClickActorRef(e));
        });
        
        this.element.querySelectorAll('.item-ref').forEach(ref => {
            ref.addEventListener('click', (e) => this._onClickItemRef(e));
        });

        // Escape to close window (global)
        this.element.removeEventListener('keydown', this._boundRootKeydown);
        this.element.addEventListener('keydown', this._boundRootKeydown);
        
        // Reset scroll flag
        this._shouldScrollToBottom = true;

        // Ensure popout button is visible if a module toggles it hidden (such as AutoAnimations). This forces
        // the popout control to be visible for Runar windows.
        try {
            const popoutBtn = this.element.querySelector('.popout-module-button');
            if (popoutBtn) popoutBtn.removeAttribute('hidden');
        } catch (e) {
            // Silent: querySelector might fail if element structure changes; not critical.
        }
    }

    /**
     * @override
     * By overriding render(), we can execute code after every single update.
     */
    async render(force, options) {
        // Prevent re-entrant renders: if a render is already in progress, mark a scheduled
        // render and return immediately to avoid deep recursion or render storms.
        if (this._isRendering) {
            this._renderScheduled = true;
            return this;
        }

        this._isRendering = true;
        try {
            // Preserve the current input value before rendering
            const messageInput = this.element?.querySelector('textarea[name="message"]');
            if (messageInput) {
                this._preservedInputValue = messageInput.value;
            }

            await super.render(force, options);

            // Restore the preserved input value after rendering
            const newMessageInput = this.element.querySelector('textarea[name="message"]');
            if (newMessageInput && this._preservedInputValue) {
                newMessageInput.value = this._preservedInputValue;
            }

            // Call the scroll helper every time new content is rendered.
            this.#scrollToBottom(this._shouldScrollToBottom);
            return this;
        } finally {
            this._isRendering = false;
            if (this._renderScheduled) {
                this._renderScheduled = false;
                // Schedule one final render on next tick to reconcile any missed updates.
                setTimeout(() => this.render(true), 0);
            }
        }
    }

    _handleFormSubmit(event) {
        event.preventDefault();
        const formData = new foundry.applications.ux.FormDataExtended(this.element);
        this._onSubmit(event, this.element, formData.object);
    }

    _handleRootKeydown(event) {
        if (event.key === 'Escape' && event.target.tagName !== 'TEXTAREA') {
            this.close();
        }
    }

    /** A dedicated helper method to scroll the message list to the bottom. */
    #scrollToBottom(smooth = true) {
        const messageList = this.element.querySelector('.message-list');
        if (messageList) {
            if (smooth) {
                messageList.scrollTo({
                    top: messageList.scrollHeight,
                    behavior: 'smooth'
                });
            } else {
                messageList.scrollTop = messageList.scrollHeight;
            }
        }
    }
  
    async _onSubmit(event, form, formData) {
        const message = formData.message;
        if (!message?.trim()) return;

        let speakerData = null;
        if (game.user.isGM) {
            const speakerId = formData.speaker;
            if (speakerId !== game.user.id) {
                const actor = game.actors.get(speakerId);
                if (actor) speakerData = { name: actor.name, img: actor.img };
            }
        }
        
        const senderId = game.user.id;
        const messageData = { 
            id: foundry.utils.randomID(), // Generate ID first
            senderId: senderId, 
            senderName: speakerData ? speakerData.name : (game.user.name),
            senderImg: speakerData ? speakerData.img : game.user.avatar,
            messageContent: message, 
            timestamp: Date.now(),
            mentions: Utils.parseMentions(message) // Parse @mentions
        };
        
        // Add reply reference if replying
        const replyToId = DataManager.getReplyTo();
        if (replyToId) {
            messageData.replyToId = replyToId;
            DataManager.clearReplyTo();
        }

        // Stop typing indicator
        this._stopTyping();

        if (this.options.otherUserId) {
            const recipientId = this.options.otherUserId;
            DataManager.addPrivateMessage(senderId, recipientId, messageData);
            SocketHandler.emit("privateMessage", { recipientId, message: messageData }, { recipients: [recipientId] });

            const recipientUser = game.users.get(recipientId);
            if (!game.user.isGM && recipientUser && !recipientUser.isGM) {
                const gm = game.users.find(u => u.isGM && u.active);
                if (gm) {
                    SocketHandler.emit("privateMessage", {
                        recipientId: gm.id, message: messageData, isRelay: true,
                        originalSenderId: senderId, originalRecipientId: recipientId
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
            
            // Update UI
            UIManager.updateChatWindow(recipientId, 'private');
            UIManager.updatePlayerHub();
        } 
        else if (this.options.groupId) {
            const groupId = this.options.groupId;
            const group = DataManager.groupChats.get(groupId);
            if (!group) return;

            DataManager.addGroupMessage(groupId, messageData);
            const recipients = group.members.filter(id => id !== game.user.id);
            if (recipients.length > 0) {
                SocketHandler.emit("groupMessage", { groupId, message: messageData }, { recipients });
            }
            
            // Add to GM monitor if user is GM
            if (game.user.isGM) {
                const monitorPayload = {
                    senderId: senderId,
                    recipientId: null,
                    groupId: groupId,
                    groupName: group.name,
                    messageData: messageData
                };
                DataManager.addInterceptedMessage(monitorPayload);
                UIManager.updateGMMonitor();
                await DataManager.saveGroupChats();
            }
            
            // Update UI
            UIManager.updateChatWindow(groupId, 'group');
            UIManager.updatePlayerHub();
        }

        const messageInput = form.querySelector('textarea[name="message"]');
        if (messageInput) {
            messageInput.value = '';
            this._preservedInputValue = ''; // Clear the preserved value
            messageInput.focus();
        }
    }
    
    _onTyping() {
        const conversationId = this.options.groupId || DataManager.getPrivateChatKey(game.user.id, this.options.otherUserId);
        
        // Clear existing timeout
        if (this._typingTimeout) {
            clearTimeout(this._typingTimeout);
        }
        
        // Send typing indicator only when typing state changes or periodically (throttle)
        const now = Date.now();
    const changed = DataManager.setTyping(conversationId, game.user.id, true);
        if (changed || now - this._lastTypingEmit > 1000) {
            SocketHandler.emit("typing", { 
                conversationId, 
                userId: game.user.id, 
                isTyping: true,
                isGroup: !!this.options.groupId
            });
            this._lastTypingEmit = now;
        }

    // Update our own typing indicator immediately to show 'You are typing...' locally.
    try { this.updateTypingIndicator(); } catch (e) { /* ignore */ }
        
        // Auto-stop typing after 3 seconds
        this._typingTimeout = setTimeout(() => {
            this._stopTyping();
        }, 3000);
    }
    
    _stopTyping() {
        if (this._typingTimeout) {
            clearTimeout(this._typingTimeout);
            this._typingTimeout = null;
        }
        
        const conversationId = this.options.groupId || DataManager.getPrivateChatKey(game.user.id, this.options.otherUserId);
    const changed = DataManager.setTyping(conversationId, game.user.id, false);
        if (changed) {
            SocketHandler.emit("typing", { 
                conversationId, 
                userId: game.user.id, 
                isTyping: false,
                isGroup: !!this.options.groupId
            });
        }
        // Update our own typing indicator immediately to reflect we stopped typing.
        try { this.updateTypingIndicator(); } catch (e) { /* ignore */ }
    }
    
    async _onEditMessage(event) {
        const messageId = event.currentTarget.dataset.messageId;
        const messageElement = this.element.querySelector(`.message-content[data-message-id="${messageId}"]`);
        if (!messageElement) return;
        
        const currentText = messageElement.textContent.trim();
        const newText = await Dialog.prompt({
            title: "Edit Message",
            content: `<textarea rows="3" style="width: 100%;">${Utils.sanitizeHTML(currentText)}</textarea>`,
            callback: (html) => html.querySelector('textarea').value
        });
        
        if (!newText || newText === currentText) return;
        
        const conversationId = this.options.groupId || DataManager.getPrivateChatKey(game.user.id, this.options.otherUserId);
        const isGroup = !!this.options.groupId;
        
        // Update locally
        DataManager.editMessage(conversationId, messageId, newText, isGroup);
        
        // Emit to other users
        const recipients = isGroup ? 
            DataManager.groupChats.get(conversationId).members.filter(id => id !== game.user.id) :
            [this.options.otherUserId];
            
        SocketHandler.emit("editMessage", { 
            conversationId, 
            messageId, 
            newContent: newText,
            isGroup 
        }, { recipients });
        
        // Save and refresh
        if (game.user.isGM) {
            await (isGroup ? DataManager.saveGroupChats() : DataManager.savePrivateChats());
        }
        UIManager.updateChatWindow(isGroup ? conversationId : this.options.otherUserId, isGroup ? 'group' : 'private');
    }
    
    async _onDeleteMessage(event) {
        const messageId = event.currentTarget.dataset.messageId;
        
        const confirmed = await Dialog.confirm({
            title: "Delete Message",
            content: "<p>Are you sure you want to delete this message?</p>",
        });
        
        if (!confirmed) return;
        
        const conversationId = this.options.groupId || DataManager.getPrivateChatKey(game.user.id, this.options.otherUserId);
        const isGroup = !!this.options.groupId;
        
        // Delete locally
        DataManager.deleteMessage(conversationId, messageId, isGroup);
        
        // Emit to other users
        const recipients = isGroup ? 
            DataManager.groupChats.get(conversationId).members.filter(id => id !== game.user.id) :
            [this.options.otherUserId];
            
        SocketHandler.emit("deleteMessage", { 
            conversationId, 
            messageId,
            isGroup 
        }, { recipients });
        
        // Save and refresh
        if (game.user.isGM) {
            await (isGroup ? DataManager.saveGroupChats() : DataManager.savePrivateChats());
        }
        UIManager.updateChatWindow(isGroup ? conversationId : this.options.otherUserId, isGroup ? 'group' : 'private');
    }
    
    async _onReplyMessage(event) {
        const messageId = event.currentTarget.dataset.messageId;
        DataManager.setReplyTo(messageId);
        const isGroup = !!this.options.groupId;
        const id = isGroup ? this.options.groupId : this.options.otherUserId;
        UIManager.updateChatWindow(id, isGroup ? 'group' : 'private');
    }
    
    _onCancelReply() {
        DataManager.clearReplyTo();
        const isGroup = !!this.options.groupId;
        const id = isGroup ? this.options.groupId : this.options.otherUserId;
        UIManager.updateChatWindow(id, isGroup ? 'group' : 'private');
    }
    
    async _onReactMessage(event) {
        const messageId = event.currentTarget.dataset.messageId;
        
        // Show emoji picker dialog
        const emoji = await Dialog.prompt({
            title: "Add Reaction",
            content: `<div style="font-size: 2em; display: flex; gap: 10px; flex-wrap: wrap; justify-content: center;">
                <button type="button" class="emoji-btn" data-emoji="ðŸ‘">ðŸ‘</button>
                <button type="button" class="emoji-btn" data-emoji="â¤ï¸">â¤ï¸</button>
                <button type="button" class="emoji-btn" data-emoji="ðŸ˜‚">ðŸ˜‚</button>
                <button type="button" class="emoji-btn" data-emoji="ðŸ˜®">ðŸ˜®</button>
                <button type="button" class="emoji-btn" data-emoji="ðŸ˜¢">ðŸ˜¢</button>
                <button type="button" class="emoji-btn" data-emoji="ðŸŽ‰">ðŸŽ‰</button>
                <button type="button" class="emoji-btn" data-emoji="ðŸ”¥">ðŸ”¥</button>
                <button type="button" class="emoji-btn" data-emoji="â­">â­</button>
            </div>`,
            callback: (html) => {
                return new Promise((resolve) => {
                    html.querySelectorAll('.emoji-btn').forEach(btn => {
                        btn.addEventListener('click', () => {
                            resolve(btn.dataset.emoji);
                        });
                    });
                });
            },
            rejectClose: false
        });
        
        if (!emoji) return;
        
        this._addReaction(messageId, emoji);
    }
    
    async _onClickReaction(event) {
        const emoji = event.currentTarget.dataset.emoji;
        const messageId = event.currentTarget.closest('.chat-message').dataset.messageId;
        this._addReaction(messageId, emoji);
    }
    
    async _addReaction(messageId, emoji) {
        const conversationId = this.options.groupId || DataManager.getPrivateChatKey(game.user.id, this.options.otherUserId);
        const isGroup = !!this.options.groupId;
        
        // Add/toggle reaction locally
        DataManager.addReaction(conversationId, messageId, emoji, game.user.id, isGroup);
        
        // Emit to other users
        const recipients = isGroup ? 
            DataManager.groupChats.get(conversationId).members.filter(id => id !== game.user.id) :
            [this.options.otherUserId];
            
        SocketHandler.emit("addReaction", { 
            conversationId, 
            messageId, 
            emoji,
            userId: game.user.id,
            isGroup 
        }, { recipients });
        
        // Save and refresh
        if (game.user.isGM) {
            await (isGroup ? DataManager.saveGroupChats() : DataManager.savePrivateChats());
        }
        UIManager.updateChatWindow(isGroup ? conversationId : this.options.otherUserId, isGroup ? 'group' : 'private');
    }
    
    async _onClickDiceRoll(event) {
        const formula = event.currentTarget.dataset.formula;
        if (!formula) return;
        
        try {
            const roll = new Roll(formula);
            await roll.evaluate();
            await roll.toMessage({
                speaker: ChatMessage.getSpeaker({ user: game.user }),
                flavor: `Rolled from RÃºnar chat`
            });
        } catch (error) {
            ui.notifications.error(game.i18n.format("RNR.InvalidDiceFormula", { formula }));
        }
    }
    
    async _onClickActorRef(event) {
        const actorId = event.currentTarget.dataset.actorId;
        const actor = game.actors.get(actorId);
        if (actor) {
            actor.sheet.render(true);
        } else {
            ui.notifications.warn(game.i18n.localize("RNR.ActorNotFound"));
        }
    }
    
    async _onClickItemRef(event) {
        const itemId = event.currentTarget.dataset.itemId;
        const item = game.items.get(itemId);
        if (item) {
            item.sheet.render(true);
        } else {
            ui.notifications.warn(game.i18n.localize("RNR.ItemNotFound"));
        }
    }
    
    _onToggleFavorite() {
        const conversationId = this.options.groupId || DataManager.getPrivateChatKey(game.user.id, this.options.otherUserId);
        DataManager.toggleFavorite(conversationId);
        const isGroup = !!this.options.groupId;
        const id = isGroup ? this.options.groupId : this.options.otherUserId;
        UIManager.updateChatWindow(id, isGroup ? 'group' : 'private');

        // Update player hub to reflect favorite status
        UIManager.updatePlayerHub();
    }
    
    async _onPinMessage(event) {
        const messageId = event.currentTarget.closest('.chat-message-item').dataset.messageId;
        const conversationId = this.options.groupId || this.options.otherUserId;
        
        DataManager.togglePinMessage(conversationId, messageId);
        
        // Socket emit for sync
        SocketHandler.emit('pinMessage', {
            conversationId,
            messageId,
            isPinned: DataManager.isPinned(conversationId, messageId),
            isGroup: !!this.options.groupId
        });
        
        // Update UI
        const id = this.options.groupId || this.options.otherUserId;
        UIManager.updateChatWindow(id, this.options.groupId ? 'group' : 'private');
    }
    
    async _onToggleMute() {
        const conversationId = this.options.groupId || this.options.otherUserId;
        
        DataManager.toggleMute(conversationId);
        
        const isMuted = DataManager.isMuted(conversationId);
        ui.notifications.info(isMuted ? game.i18n.localize("RNR.ChatMuted") : game.i18n.localize("RNR.ChatUnmuted"));
        
        // Update UI
        this.render(false);
    }
    
    async _onManageGroup() {
        if (!this.options.groupId) return;
        
        const group = DataManager.getGroupChat(this.options.groupId);
        if (!group) return;
        
        // Create a dialog for group management
        const content = `
            <form class="runar-group-manager">
                <div class="form-group">
                    <label for="group-name">Group Name:</label>
                    <input type="text" id="group-name" name="name" value="${group.name}" />
                </div>
                <div class="form-group">
                    <label>Members:</label>
                    <ul class="member-list">
                        ${group.members.map(userId => {
                            const user = game.users.get(userId);
                            return `<li>
                                ${user?.name || 'Unknown User'}
                                ${userId !== game.user.id && game.user.isGM ? 
                                    `<button type="button" class="remove-member" data-user-id="${userId}">Remove</button>` 
                                    : ''}
                            </li>`;
                        }).join('')}
                    </ul>
                </div>
                ${game.user.isGM ? `
                    <div class="form-group">
                        <label for="add-member">Add Member:</label>
                        <select id="add-member" name="addMember">
                            <option value="">-- Select User --</option>
                            ${game.users.filter(u => !group.members.includes(u.id)).map(u => 
                                `<option value="${u.id}">${u.name}</option>`
                            ).join('')}
                        </select>
                    </div>
                ` : ''}
            </form>
        `;
        const dialog = new Dialog({
            title: "Manage Group Chat",
            content,
            buttons: {
                save: {
                    icon: '<i class="fas fa-save"></i>',
                    label: "Save",
                    callback: async (html) => {
                        // Ensure html is jQuery (Foundry may pass HTMLElement)
                        html = $(html);
                        const newName = html.find('#group-name').val().trim();
                        const addMemberId = html.find('#add-member').val();
                        
                        // Rename if changed
                        if (newName && newName !== group.name) {
                            await DataManager.renameGroup(this.options.groupId, newName);
                            SocketHandler.emit('renameGroup', {
                                groupId: this.options.groupId,
                                newName
                            });
                        }
                        
                        // Add member if selected
                        if (addMemberId && game.user.isGM) {
                            await DataManager.addGroupMember(this.options.groupId, addMemberId);
                            SocketHandler.emit('addGroupMember', {
                                groupId: this.options.groupId,
                                userId: addMemberId
                            });
                        }
                        
                        // Update UI
                        UIManager.updateChatWindow(this.options.groupId, 'group');
                        ui.notifications.info(game.i18n.localize("RNR.GroupUpdated"));
                    }
                },
                cancel: {
                    icon: '<i class="fas fa-times"></i>',
                    label: "Cancel"
                }
            },
            default: "save",
            render: (html) => {
                // Ensure html is jQuery
                html = $(html);
                // Handle remove member buttons
                html.find('.remove-member').on('click', async (e) => {
                    const userId = e.currentTarget.dataset.userId;
                    const confirmed = await Dialog.confirm({
                        title: "Remove Member",
                        content: "<p>Are you sure you want to remove this member?</p>"
                    });
                    
                    if (confirmed) {
                        await DataManager.removeGroupMember(this.options.groupId, userId);
                        SocketHandler.emit('removeGroupMember', {
                            groupId: this.options.groupId,
                            userId
                        });
                        
                        // Close and reopen dialog with updated data
                        dialog.close();
                        this._onManageGroup();
                    }
                });
            }
        }, {classes: ['rnk-runar']});
        
        dialog.render(true);
    }
    
    close(options) {
        this._stopTyping();
        DataManager.clearReplyTo();
        
        // Clean up window tracking in UIManager
        if (this.options.otherUserId) {
            const UIManager = window.RNKRunarUIManager;
            if (UIManager?.openPrivateChatWindows) {
                UIManager.openPrivateChatWindows.delete(this.options.otherUserId);
            }
        } else if (this.options.groupId) {
            const UIManager = window.RNKRunarUIManager;
            if (UIManager?.openGroupChatWindows) {
                UIManager.openGroupChatWindows.delete(this.options.groupId);
            }
        }
        
        return super.close(options);
    }
}

