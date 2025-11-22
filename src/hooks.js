import { RNKRunar } from './RNKRunar.js';
import { UIManager } from './UIManager.js';

Hooks.once('init', () => {
    window.RNKRunar = RNKRunar;
    window.RNKRunarUIManager = UIManager;
    // Preload templates used by the module to avoid template load issues at runtime
    const _templates = [
        'modules/rnk-runar/templates/chat-window.hbs',
        'modules/rnk-runar/templates/group-manager.hbs',
        'modules/rnk-runar/templates/player-hub.hbs',
        'modules/rnk-runar/templates/settings-window.hbs',
        'modules/rnk-runar/templates/gm-monitor.hbs',
        'modules/rnk-runar/templates/gm-mod.hbs'
    ];
    foundry.applications.handlebars.loadTemplates(_templates).then(() => {
        console.debug('RÃºnar | Templates preloaded');
    }).catch(err => console.warn('RÃºnar | Error preloading templates', err));
    
    // Expose simplified API for easier access
    game.RNKRunar = {
        open: () => UIManager.openPlayerHub(),
        openGMPanel: () => UIManager.openGMPanel(),
        RNKRunar: RNKRunar,
        UIManager: UIManager
    };

    game.settings.register(RNKRunar.ID, "privateChats", {
        scope: "world", config: false, type: Object, default: {}
    });
    game.settings.register(RNKRunar.ID, "groupChats", {
        scope: "world", config: false, type: Object, default: {}
    });
    
    game.settings.register(RNKRunar.ID, "unreadData", {
        scope: "client", config: false, type: Object, default: { counts: {}, lastRead: {} }
    });
    
    game.settings.register(RNKRunar.ID, "favorites", {
        scope: "client", config: false, type: Array, default: []
    });
    
    game.settings.register(RNKRunar.ID, "mutedConversations", {
        scope: "client", config: false, type: Array, default: []
    });
    
    game.settings.register(RNKRunar.ID, "pinnedMessages", {
        scope: "client", config: false, type: Object, default: {}
    });
    
    game.settings.register(RNKRunar.ID, "enableDesktopNotifications", {
        name: "Enable Desktop Notifications",
        hint: "Show browser notifications for new messages when Foundry is not focused.",
        scope: "client", config: true, type: Boolean, default: false
    });
    
    game.settings.register(RNKRunar.ID, "gmOverrideEnabled", {
        name: "Enable GM Override Sound",
        hint: "When enabled, all players will hear the 'Global Notification Sound' instead of their personal one.",
        scope: "world", config: true, type: Boolean, default: false
    });
    game.settings.register(RNKRunar.ID, "gmOverrideSoundPath", {
        name: "Global Notification Sound",
        scope: "world", config: true, type: String, filePicker: "audio", default: "modules/rnk-runar/sounds/notify.wav"
    });
    game.settings.register(RNKRunar.ID, "enableSound", {
        name: "Enable My Notification Sound",
        hint: "Allows you to hear notification sounds from this module. You can disable this if you prefer no sounds.",
        scope: "client", config: true, type: Boolean, default: true
    });
    
    // UPDATED: Removed the static 'choices' array.
    game.settings.register(RNKRunar.ID, "notificationSound", {
        name: "My Notification Sound",
        hint: "Choose your personal sound for new message notifications.",
        scope: "client",
        config: true,
        type: String,
        default: "modules/rnk-runar/sounds/notify.wav"
    });
    
    game.settings.register(RNKRunar.ID, "notificationVolume", {
        name: "My Notification Volume",
        scope: "client", config: true, type: Number, range: { min: 0, max: 1, step: 0.1 }, default: 0.8
    });

    // Theme support - world setting selects a theme applied to all users
    game.settings.register(RNKRunar.ID, "globalTheme", {
        name: "RÃºnar Global Theme",
        hint: "Choose a global theme for the RÃºnar UI (server/world scope).",
        scope: "world",
        config: true,
        type: String,
        choices: {
            "none": "None",
            "ancient": "Ancient",
            "midnight": "Midnight",
            "forest": "Forest",
            "ocean": "Ocean",
            "sunrise": "Sunrise",
            "sunset": "Sunset",
            "desert": "Desert",
            "aurora": "Aurora",
            "sky": "Sky"
        },
        default: "none"
    });

    // Personal background (client) and sharing toggle
    game.settings.register(RNKRunar.ID, "personalBackground", {
        name: "My Background Image",
        hint: "Pick an image to use as your personal background for RÃºnar windows.",
        scope: "client",
        config: true,
        type: String,
        default: "",
        filePicker: "image"
    });

    game.settings.register(RNKRunar.ID, "shareBackground", {
        name: "Share My Background",
        hint: "If enabled, your selected background will be shared with all players (persisted to world settings).",
        scope: "client",
        config: true,
        type: Boolean,
        default: false
    });

    // Shared backgrounds mapping persisted to world by GM
    game.settings.register(RNKRunar.ID, "sharedBackgrounds", {
        name: "Shared Backgrounds",
        scope: "world",
        config: false,
        type: Object,
        default: {}
    });
    // Safety: sanitize item formulas on creation to help avoid actor initialization errors
    try {
        Hooks.on('preCreateItem', (itemData, options, userId) => {
            try {
                const it = itemData;
                if (it && it.system) {
                    const parts = it.system.damage?.parts;
                    if (Array.isArray(parts)) {
                        for (let i = 0; i < parts.length; i++) {
                            if (Array.isArray(parts[i]) && typeof parts[i][0] === 'string') {
                                parts[i][0] = parts[i][0].replace(/<[^>]*>/g, '').replace(/[<>]/g, '').trim();
                            }
                        }
                    }
                    const base = it.system.damage?.base?.custom?.formula;
                    if (typeof base === 'string' && /[<>]/.test(base)) {
                        let cleaned = base.replace(/<[^>]*>/g, '').replace(/&lt;|&gt;/g, '').replace(/[<>]/g, '').trim();
                        cleaned = cleaned.replace(/[^0-9dD+\-*/%()\s]+/g, '').trim();
                        if (/[0-9dD]/.test(cleaned)) it.system.damage.base.custom.formula = cleaned; else it.system.damage.base.custom.formula = '';
                    }
                }
            } catch (err) {
                // ignore
            }
        });
    } catch (err) {
        console.warn('RÃºnar | Failed to register preCreateItem hook', err);
    }
});

Hooks.once('ready', () => {
    RNKRunar.initialize();

    // Apply global theme on ready via UIManager
    const globalTheme = game.settings.get(RNKRunar.ID, 'globalTheme') || 'none';
    if (globalTheme && globalTheme !== 'none') {
        try { (async () => { const { UIManager } = await import('./UIManager.js'); UIManager.applyTheme(globalTheme); })(); } catch (e) { /* ignore */ }
    }

    // Apply our own background for this user if any
    const bg = game.settings.get(RNKRunar.ID, 'personalBackground');
    if (bg) {
        window.RNKRunarPersonalBackground = bg;
    }
});

Hooks.on("renderPlayerList", (playerList, html) => {
    // This hook's content remains the same
    const playerListElement = html[0].querySelector('#player-list');
    if (!playerListElement) return;

    let controls = html[0].querySelector('#runar-controls');
    if (!controls) {
        controls = document.createElement('div');
        controls.id = 'runar-controls';
        Object.assign(controls.style, { display: 'flex', justifyContent: 'flex-end', gap: '5px', marginBottom: '5px' });
        playerListElement.before(controls);
    }

    if (game.user.isGM) {
        if (!controls.querySelector('.runar-group-manager-btn')) {
            const groupButton = document.createElement('button');
            groupButton.innerHTML = '<i class="fas fa-users-cog"></i>';
            groupButton.title = "Manage All Chats";
            groupButton.addEventListener("click", () => UIManager.openGroupManager());
            controls.append(groupButton);
        }
        if (!controls.querySelector('.gm-monitor-btn')) {
            const monitorButton = document.createElement('button');
            monitorButton.innerHTML = '<i class="fas fa-shield-alt"></i>';
            monitorButton.title = "GM Monitor";
            monitorButton.addEventListener("click", () => UIManager.openGMMonitor());
            controls.append(monitorButton);
        }
    } else {
        if (!controls.querySelector('.runar-player-hub-btn')) {
            const hubButton = document.createElement('button');
            hubButton.innerHTML = '<i class="fas fa-comments"></i>';
            hubButton.title = "My Chats";
            hubButton.addEventListener("click", () => UIManager.openPlayerHub());
            controls.append(hubButton);
        }
    }

    if (!controls.querySelector('.runar-settings-btn')) {
        const settingsButton = document.createElement('button');
        settingsButton.innerHTML = '<i class="fas fa-cog"></i>';
        settingsButton.title = "Settings";
        settingsButton.addEventListener("click", () => UIManager.openSettingsWindow());
        controls.append(settingsButton);
    }
});

