import { DataManager } from './DataManager.js';

export class UIManager {
    static openPrivateChatWindows = new Map();
    static openGroupChatWindows = new Map();
    static gmMonitorWindow = null; // <-- ADDED THIS PROPERTY

    static async openPlayerHub() {
        const { PlayerHubWindow } = await import('./PlayerHubWindow.js');
        const id = 'runar-player-hub';
        // Check for existing window by either w.id or w.appId to support popouts and newer Foundry versions.
        const existing = Object.values(ui.windows).find(w => w.id === id || w.appId === id);
        if (existing) {
            // If we have an existing window, bring it to the front or toggle it.
            if (typeof existing.bringToTop === 'function') existing.bringToTop();
            return existing.render(true);
        }
        new PlayerHubWindow().render(true);
    }

    static async openChatFor(userId) {
        const existingWindow = this.openPrivateChatWindows.get(userId);
        if (existingWindow?.rendered) return existingWindow.render(true);

        const chatKey = DataManager.getPrivateChatKey(game.user.id, userId);
        if (!DataManager.privateChats.has(chatKey)) {
            // Create empty chat without adding a message
            DataManager.privateChats.set(chatKey, { 
                users: [game.user.id, userId], 
                history: [] 
            });
        }

        const { RunarWindow } = await import('./RunarWindow.js');
        const window = new RunarWindow({ otherUserId: userId });
        this.openPrivateChatWindows.set(userId, window);
        return window.render(true);
    }

    static async openGroupChat(groupId) {
        const group = DataManager.groupChats.get(groupId);
        if (!group) return;
        
        // Allow GMs to view any group chat, even if they're not a member
        const isMember = group.members.includes(game.user.id);
        if (!isMember && !game.user.isGM) {
            return ui.notifications.warn(game.i18n.localize("RNR.NotMember"));
        }
        
        const existingWindow = this.openGroupChatWindows.get(groupId);
        if (existingWindow?.rendered) return existingWindow.render(true);

        const { RunarWindow } = await import('./RunarWindow.js');
        const window = new RunarWindow({ groupId: groupId });
        this.openGroupChatWindows.set(groupId, window);
        return window.render(true);
    }

    static async openGroupManager() {
        if (!game.user.isGM) return ui.notifications.error(game.i18n.localize("RNR.GMOnlyTool"));
        const { GroupManagerWindow } = await import('./GroupManagerWindow.js');
        const id = 'runar-group-manager';
        if (Object.values(ui.windows).find(w => w.id === id)) return;
        new GroupManagerWindow().render(true);
    }

    static async openGMMonitor() {
        if (!game.user.isGM) return ui.notifications.warn(game.i18n.localize("RNR.NoPermission"));
        
        // If the window already exists and is open, just bring it to the front.
        if (this.gmMonitorWindow?.rendered) {
            return this.gmMonitorWindow.bringToTop();
        }

        const { GMMonitorWindow } = await import('./GMMonitorWindow.js');
        
        // Create the new window and store its instance in our static property.
        this.gmMonitorWindow = new GMMonitorWindow();
        return this.gmMonitorWindow.render(true);
    }

    static async openSettingsWindow() {
        const { SettingsWindow } = await import('./SettingsWindow.js');
        const id = 'runar-settings-window';
        const existing = Object.values(ui.windows).find(w => w.id === id);
        if (existing) {
            return existing.bringToTop();
        }
        new SettingsWindow().render(true);
    }

    static applyTheme(theme) {
        // Remove existing runar theme classes
        const classes = Array.from(document.documentElement.classList).filter(c => c.startsWith('runar-theme-'));
        classes.forEach(c => document.documentElement.classList.remove(c));
        if (theme && theme !== 'none') document.documentElement.classList.add(`runar-theme-${theme}`);
    }

    static updateBackgroundForUser(userId, path) {
        // Update internal mapping
        if (!userId) return;
        if (path) DataManager.setSharedBackground(userId, path);
        else DataManager.setSharedBackground(userId, null);

        // Apply to open private chat windows
        for (const [user, win] of this.openPrivateChatWindows.entries()) {
            if (win && win.rendered) {
                // if this window is a chat with userId, apply background
                if (user === userId) {
                    this.applyBackgroundToWindow(win, path);
                }
            }
        }

        // Apply to open group windows where this user is a member
        for (const [groupId, win] of this.openGroupChatWindows.entries()) {
            const group = DataManager.groupChats.get(groupId);
            if (group && group.members && group.members.includes(userId)) {
                this.applyBackgroundToWindow(win, path);
            }
        }

        // Apply to player hub if open
        const playerHub = Object.values(ui.windows).find(w => w.id === 'runar-player-hub');
        if (playerHub && playerHub.rendered) {
            try { this.applyBackgroundToWindow(playerHub, path); } catch (e) { /* ignore */ }
        }

        // Apply to GM Monitor (if present) - apply some style or badges
        if (this.gmMonitorWindow?.rendered) {
            try { this.gmMonitorWindow.render(false); } catch (e) { /* ignore */ }
        }
    }

    static applyBackgroundToWindow(win, path) {
        if (!win?.element) return;
        const container = win.element.querySelector('.runar-chat-flex-container');
        if (!container) return;
        if (path) {
            const overlay = 'linear-gradient(rgba(0,0,0,0.25), rgba(0,0,0,0.25))';
            container.style.backgroundImage = `${overlay}, url('${path}')`;
            container.style.backgroundSize = 'cover';
            container.style.backgroundRepeat = 'no-repeat';
            container.style.backgroundPosition = 'center';
            // Add subtle overlay for text contrast
            container.style.setProperty('--runar-bg-overlay', 'rgba(0,0,0,0.25)');
            container.style.position = 'relative';
        } else {
            container.style.backgroundImage = '';
            container.style.removeProperty('background-size');
            container.style.removeProperty('background-repeat');
            container.style.removeProperty('background-position');
            container.style.removeProperty('--runar-bg-overlay');
        }
    }
    
    static async openGMModWindow() {
        if (!game.user.isGM) {
            ui.notifications.warn(game.i18n.localize("RNR.OnlyGMsAccessModeration"));
            return;
        }
        
        const { GMModWindow } = await import('./GMModWindow.js');
        const id = 'runar-gm-mod-window';
        const existing = Object.values(ui.windows).find(w => w.id === id);
        if (existing) {
            return existing.bringToTop();
        }
        new GMModWindow().render(true);
    }
    
    static updateChatWindow(id, type) {
        // Only update if the window is already open - don't reopen closed windows
        if (type === 'private') {
            const existingWindow = this.openPrivateChatWindows.get(id);
            if (existingWindow?.rendered) {
                existingWindow.render(false);
            }
        } else {
            const existingWindow = this.openGroupChatWindows.get(id);
            if (existingWindow?.rendered) {
                existingWindow.render(false);
            }
        }
    }

    static updateTypingIndicator(id, type) {
        // Update only the typing indicator in an open window, avoiding a full re-render.
        if (type === 'private') {
            const existingWindow = this.openPrivateChatWindows.get(id);
            if (existingWindow?.rendered && typeof existingWindow.updateTypingIndicator === 'function') {
                existingWindow.updateTypingIndicator();
                return;
            }
        } else {
            const existingWindow = this.openGroupChatWindows.get(id);
            if (existingWindow?.rendered && typeof existingWindow.updateTypingIndicator === 'function') {
                existingWindow.updateTypingIndicator();
                return;
            }
        }
        // Fallback: if not open or method not available, don't force a re-render for typing events.
    }
    
    static openChatWindowForNewMessage(id, type) {
        // Open the chat window when a new message arrives (if not already open)
        if (type === 'private') {
            this.openChatFor(id);
        } else {
            this.openGroupChat(id);
        }
    }

    static closeChatWindow(id, type) {
        const window = (type === 'private') 
            ? this.openPrivateChatWindows.get(id) 
            : this.openGroupChatWindows.get(id);
        if (window) window.close();
    }
    
    static updateGroupManager() {
        const groupManager = Object.values(ui.windows).find(w => w.id === 'runar-group-manager');
        if (groupManager) groupManager.render(true);
    }

    static updateGMMonitor() {
        // Now, we check our stored reference directly. Much more reliable!
        if (this.gmMonitorWindow?.rendered) {
            console.debug("RÚNAR | Forcing GM Monitor update via direct reference.");
            this.gmMonitorWindow.render(true);
        }
    }
}