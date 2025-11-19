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
            return ui.notifications.warn("You are not a member of this group chat.");
        }
        
        const existingWindow = this.openGroupChatWindows.get(groupId);
        if (existingWindow?.rendered) return existingWindow.render(true);

        const { RunarWindow } = await import('./RunarWindow.js');
        const window = new RunarWindow({ groupId: groupId });
        this.openGroupChatWindows.set(groupId, window);
        return window.render(true);
    }

    static async openGroupManager() {
        if (!game.user.isGM) return ui.notifications.error("This is a GM-only tool.");
        const { GroupManagerWindow } = await import('./GroupManagerWindow.js');
        const id = 'runar-group-manager';
        if (Object.values(ui.windows).find(w => w.id === id)) return;
        new GroupManagerWindow().render(true);
    }

    static async openGMMonitor() {
        if (!game.user.isGM) return ui.notifications.warn("You do not have permission.");
        
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
    
    static async openGMModWindow() {
        if (!game.user.isGM) {
            ui.notifications.warn("Only GMs can access moderation tools");
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
            console.log("RÚNAR | Forcing GM Monitor update via direct reference.");
            this.gmMonitorWindow.render(true);
        }
    }
}