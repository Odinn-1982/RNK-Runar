const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
import { DataManager } from './DataManager.js';
import { UIManager } from './UIManager.js';

export class GMMonitorWindow extends HandlebarsApplicationMixin(ApplicationV2) {

    static DEFAULT_OPTIONS = {
        id: 'runar-gm-monitor',
        classes: ['rnk-runar'],
        position: { width: 600, height: 500 },
        window: { resizable: true }
    };

    get title() {
        return "RÃºnar GM Monitor";
    }

    static PARTS = {
        body: { template: `modules/rnk-runar/templates/gm-monitor.hbs` }
    };

    async _prepareContext(options) {
        const messages = DataManager.interceptedMessages.map(msg => {
            const sender = game.users.get(msg.senderId);
            
            const timestamp = new Date(msg.messageData.timestamp);
            const formattedTimestamp = timestamp.toLocaleTimeString([], {
                hour: '2-digit', minute: '2-digit', second: '2-digit'
            });

            // Handle group messages differently from private messages
            if (msg.groupId) {
                return {
                    ...msg.messageData,
                    id: msg.id,
                    senderName: sender ? sender.name : "Unknown",
                    senderImg: sender ? sender.avatar : "icons/svg/mystery-man.svg",
                    recipientName: msg.groupName,
                    recipientImg: "icons/svg/item-bag.svg", // Use a group icon
                    speakerName: msg.messageData.senderName,
                    formattedTime: formattedTimestamp,
                    isGroupMessage: true
                };
            } else {
                // Private message
                const recipient = game.users.get(msg.recipientId);
                return {
                    ...msg.messageData,
                    id: msg.id,
                    senderName: sender ? sender.name : "Unknown",
                    senderImg: sender ? sender.avatar : "icons/svg/mystery-man.svg",
                    recipientName: recipient ? recipient.name : "Unknown",
                    recipientImg: recipient ? recipient.avatar : "icons/svg/mystery-man.svg",
                    speakerName: msg.messageData.senderName,
                    formattedTime: formattedTimestamp,
                    isGroupMessage: false
                };
            }
        }).reverse();
        return { interceptedMessages: messages };
    }

    _onRender(context, options) {
        super._onRender(context, options);
        this.element.querySelector('[data-action="open-group-manager"]')?.addEventListener('click', () => {
            UIManager.openGroupManager();
        });
        this.element.querySelector('[data-action="open-settings"]')?.addEventListener('click', () => {
            UIManager.openSettingsWindow();
        });

        // Wire start chat buttons
        this.element.querySelectorAll('.start-chat-sender').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const userId = e.currentTarget.dataset.userId;
                if (userId) UIManager.openChatFor(userId);
            });
        });
        this.element.querySelectorAll('.start-chat-recipient').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const userId = e.currentTarget.dataset.userId;
                if (userId) UIManager.openChatFor(userId);
            });
        });
    }

    async close(options) {
        UIManager.gmMonitorWindow = null;
        return super.close(options);
    }
}
