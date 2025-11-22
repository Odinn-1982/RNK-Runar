const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
import { DataManager } from './DataManager.js';
import { UIManager } from './UIManager.js';
import { SocketHandler } from './SocketHandler.js';
import { Utils } from './Utils.js';
import { MODULE_ID } from './Constants.js';

export class PlayerHubWindow extends HandlebarsApplicationMixin(ApplicationV2) {
  
  static DEFAULT_OPTIONS = {
    id: 'runar-player-hub',
    classes: ['rnk-runar', 'player-hub-app'],
    window: { title: "RNR.PlayerHubTitle", resizable: true },
    tag: 'form',
    position: { width: 600, height: 450 } // FIX: Changed height from "auto" to a fixed value
  };

  get title() {
    return game.i18n.localize(this.options.window.title);
  }

  static PARTS = {
    form: { template: 'modules/rnk-runar/templates/player-hub.hbs' }
  };

  async _prepareContext(options) {
    const conversations = [];
    const currentUser = game.user;

    const visibleGroups = Array.from(DataManager.groupChats.values()).filter(g => g.members.includes(currentUser.id));
    for (const group of visibleGroups) {
        const unreadCount = DataManager.getUnreadCount(group.id);
        conversations.push({ 
            id: group.id, 
            name: group.name, 
            type: 'group', 
            icon: 'fa-users', 
            memberCount: group.members.length,
            unreadCount: unreadCount,
            hasUnread: unreadCount > 0
        });
    }

    const visiblePrivateChats = Array.from(DataManager.privateChats.values()).filter(chat => chat.users && chat.users.includes(currentUser.id));
    for (const chat of visiblePrivateChats) {
        const otherUserId = chat.users.find(id => id !== currentUser.id);
        const otherUser = game.users.get(otherUserId);
        if (!otherUser) continue;
        const chatKey = DataManager.getPrivateChatKey(chat.users[0], chat.users[1]);
        const unreadCount = DataManager.getUnreadCount(chatKey);
        const isOnline = Utils.isUserOnline(otherUserId);
        conversations.push({
            id: chatKey,
            name: `Chat with ${otherUser.name}`,
            type: 'private',
            icon: 'fa-user',
            memberCount: 2,
            unreadCount: unreadCount,
            hasUnread: unreadCount > 0,
            isOnline: isOnline
        });
    }
    conversations.sort((a, b) => a.name.localeCompare(b.name));
    
  return {
    conversations: conversations,
    // Include all other users so that GMs are selectable regardless of whether they are currently active.
    // Show online state via isOnline.
    users: game.users
      .filter(u => u.id !== currentUser.id && (u.active || u.isGM))
      .map(u => ({
        id: u.id,
        name: u.name,
        isOnline: u.active,
        isGM: u.isGM
      })),
    isGM: game.user.isGM
  };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.element.querySelector('[data-action="openSelected"]')?.addEventListener('click', event => this.openSelected(event));
    this.element.querySelector('[data-action="createGroup"]')?.addEventListener('click', event => this.createGroup(event));
    this.element.querySelector('[data-action="openGMModTools"]')?.addEventListener('click', event => this.openGMModTools(event));

    // Apply personal background or default
    try {
      const bg = game.settings.get(MODULE_ID, 'personalBackground') || null;
      UIManager.applyBackgroundToWindow(this, bg);
    } catch (e) { /* ignore */ }
  }

  async openSelected() {
    const selectedCheckbox = this.element.querySelector('.conversation-checkbox:checked');
    if (!selectedCheckbox) return ui.notifications.warn(game.i18n.localize("RNR.PleaseSelectChatToOpen"));
    
    const id = selectedCheckbox.dataset.conversationId;
    const type = selectedCheckbox.dataset.type;

    if (type === 'group') UIManager.openGroupChat(id);
    else if (type === 'private') {
        const userIds = id.split('-');
        const otherUserId = userIds.find(uid => uid !== game.user.id);
        if (otherUserId) UIManager.openChatFor(otherUserId);
    }
    this.close();
  }

  async createGroup() {
    const form = this.element;
    const selectedUsers = Array.from(form.querySelectorAll('.user-checkbox:checked')).map(el => el.value);

    if (selectedUsers.length === 0) {
        return ui.notifications.warn(game.i18n.localize("RNR.PleaseSelectUsersToChat"));
    }

    // For single user, open private chat
    if (selectedUsers.length === 1) {
        UIManager.openChatFor(selectedUsers[0]);
        this.close();
        return;
    }

    // For multiple users, create group chat with auto-generated name
    const userNames = selectedUsers.map(id => game.users.get(id)?.name || "Unknown").join(", ");
    const name = `Group: ${userNames}`;
    
    const newGroupId = foundry.utils.randomID();
    const allMemberIds = [...new Set([game.user.id, ...selectedUsers])];
    const newGroup = { 
        id: newGroupId, 
        name: name, 
        members: allMemberIds, 
        messages: [] 
    };

    DataManager.groupChats.set(newGroupId, newGroup);

    if (game.user.isGM) await DataManager.saveGroupChats();
    
    SocketHandler.emit("groupCreate", { group: newGroup });
    
    UIManager.openGroupChat(newGroupId);
    
    this.close();
  }
  
  async openGMModTools() {
    UIManager.openGMModWindow();
    this.close();
  }
}
