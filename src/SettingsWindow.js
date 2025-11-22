const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
import { RNKRunar } from './RNKRunar.js';

export class SettingsWindow extends HandlebarsApplicationMixin(ApplicationV2) {

    static DEFAULT_OPTIONS = {
        id: 'runar-settings-window',
        classes: ['rnk-runar'],
        window: { title: "RNR.SettingsTitle", resizable: false, width: 400, height: "auto" },
        tag: 'form',
        form: {
            handler: SettingsWindow.#onFormSubmit, // Corrected reference
            closeOnSubmit: true
        }
    };

    get title() {
        return game.i18n.localize(this.options.window.title);
    }

    static PARTS = {
        form: { template: `modules/rnk-runar/templates/settings-window.hbs` }
    };

    async _prepareContext(options) {
        const sounds = [];
        const targetPath = `modules/${RNKRunar.ID}/sounds/`;
        
        try {
            const browseResult = await FilePicker.browse("data", targetPath, {
                extensions: [".wav", ".mp3", ".ogg", ".flac"]
            });

            for (const filePath of browseResult.files) {
                const fileName = filePath.split('/').pop();
                let soundName = fileName.substring(0, fileName.lastIndexOf('.')).replace(/_/g, ' ').replace(/-/g, ' ');
                soundName = soundName.charAt(0).toUpperCase() + soundName.slice(1);
                
                sounds.push({ path: filePath, name: soundName });
            }
        } catch (error) {
            console.error(`${RNKRunar.NAME} | Could not browse for sounds in ${targetPath}.`, error);
            ui.notifications.error(game.i18n.localize("RNR.ErrorLoadSounds"));
        }

        const currentSound = game.settings.get(RNKRunar.ID, "notificationSound");
        const currentTheme = game.settings.get(RNKRunar.ID, 'globalTheme') || 'none';
        const currentBackground = game.settings.get(RNKRunar.ID, 'personalBackground') || '';
        const shareBackground = game.settings.get(RNKRunar.ID, 'shareBackground') || false;
        const isGM = game.user.isGM;
        return { sounds, currentSound, currentTheme, currentBackground, shareBackground, isGM };
    }

    _onRender(context, options) {
        super._onRender(context, options);
        this.element.querySelector('[data-action="preview-sound"]')?.addEventListener('click', this._onPreviewSound.bind(this));
        this.element.querySelector('[data-action="browse-bg"]')?.addEventListener('click', this._onBrowseBackground.bind(this));
    }

    _onPreviewSound(event) {
        event.preventDefault();
        const select = this.element.querySelector('select[name="notificationSound"]');
        
        const selectedOption = select.options[select.selectedIndex];
        const soundPath = selectedOption ? selectedOption.getAttribute('value') : null;

        if (soundPath) {
            const volume = game.settings.get(RNKRunar.ID, "notificationVolume");
            foundry.audio.AudioHelper.play({ src: soundPath, volume: volume, autoplay: true, loop: false }, false);
        } else {
            ui.notifications.error(game.i18n.localize("RNR.ErrorPlaySound"));
        }
    }
    
    static async #onFormSubmit(event, form, formData) {
        const newSound = formData.object.notificationSound;
        await game.settings.set(RNKRunar.ID, "notificationSound", newSound);
        // Global theme (world scope) - if the user does not have permission, this will be rejected
        if (formData.object.globalTheme) {
            try { await game.settings.set(RNKRunar.ID, 'globalTheme', formData.object.globalTheme); }
            catch (e) { ui.notifications.warn('Unable to set global theme - you might need GM permissions.'); }
            // Broadcast theme update to other clients so the UI updates immediately
            import('./SocketHandler.js').then(({ SocketHandler }) => {
                SocketHandler.emit('themeUpdate', { theme: formData.object.globalTheme });
            });
            try { (await import('./UIManager.js')).UIManager.applyTheme(formData.object.globalTheme); } catch (e) { /* ignore */ }
        }

        // Personal background and sharing
        const bg = formData.object.personalBackground || '';
        await game.settings.set(RNKRunar.ID, 'personalBackground', bg);
        const share = Boolean(formData.object.shareBackground);
        await game.settings.set(RNKRunar.ID, 'shareBackground', share);

        // Apply background locally for current user
        try { (await import('./UIManager.js')).UIManager.updateBackgroundForUser(game.user.id, bg); } catch (e) { /* ignore */ }

        // If user opted to share, emit a socket update so GM can persist
        if (share) {
            const userId = game.user.id;
            // send socket broadcast for background update
            import('./SocketHandler.js').then(({ SocketHandler }) => {
                SocketHandler.emit('backgroundUpdate', { userId, background: bg, shared: true });
            });
        } else {
            // if previously shared, notify that sharing is disabled
            import('./SocketHandler.js').then(({ SocketHandler }) => {
                SocketHandler.emit('backgroundUpdate', { userId: game.user.id, background: null, shared: false });
            });
        }

        ui.notifications.info(game.i18n.localize("RNR.SoundUpdateSuccess"));
    }

    _onBrowseBackground(event) {
        event.preventDefault();
        const targetPath = `modules/${RNKRunar.ID}/`; // base folder
        FilePicker.browse('data', targetPath, { extensions: ['.png', '.jpg', '.jpeg', '.webp'] }).then(result => {
            if (result.files && result.files.length > 0) {
                const input = this.element.querySelector('input[name="personalBackground"]');
                input.value = result.files[0];
            }
        }).catch(error => {
            console.error(`${RNKRunar.NAME} | Could not browse for background images.`, error);
            ui.notifications.error('Could not browse for background images.');
        });
    }
}

