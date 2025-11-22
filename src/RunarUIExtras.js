/* RunarUIExtras.js - Injects theme variables and sidebar button (matching CBHub pattern) */

console.debug('RunarUIExtras.js: Module loaded and executing initialization immediately');

const BUTTON_STACK_ID = 'custom-sidebar-buttons';
const BUTTON_STACK_STYLE_ID = 'custom-sidebar-button-stack-style';

function getSidebarButtonStack() {
  const tabs = document.querySelector('#sidebar-tabs') || document.querySelector('#sidebar');
  if (!tabs) return null;

  let stack = tabs.querySelector(`#${BUTTON_STACK_ID}`);
  if (!stack) {
    stack = document.createElement('div');
    stack.id = BUTTON_STACK_ID;
    stack.style.cssText = `
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      gap: 4px !important;
      padding: 4px 0 !important;
      pointer-events: auto !important;
      width: 52px !important;
      max-width: 52px !important;
    `;

    const reference = tabs.querySelector('.item[data-tab="settings"]') ?? tabs.querySelector('.tab.settings') ?? tabs.querySelector('.item') ?? tabs.lastElementChild;
    if (reference) {
      reference.insertAdjacentElement('afterend', stack);
    } else {
      tabs.append(stack);
    }
  }

  const legacy = tabs.querySelector('#RNK-sidebar-button-stack');
  if (legacy && legacy !== stack) {
    while (legacy.firstChild) stack.appendChild(legacy.firstChild);
    legacy.remove();
  }

  ['#runar-buttons', '#deck-buttons', '#crimson-blood-buttons'].forEach((selector) => {
    const container = tabs.querySelector(selector);
    if (container && container !== stack) {
      while (container.firstChild) stack.appendChild(container.firstChild);
      container.remove();
    }
  });

  ensureSidebarButtonStackStyles();
  return stack;
}

function ensureSidebarButtonStackStyles() {
  if (document.getElementById(BUTTON_STACK_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = BUTTON_STACK_STYLE_ID;
  style.textContent = `
    #${BUTTON_STACK_ID} {
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      gap: 4px !important;
      padding: 4px 0 !important;
      pointer-events: auto !important;
      width: 52px !important;
      max-width: 52px !important;
    }

    #${BUTTON_STACK_ID} > * {
      width: 48px !important;
      height: 48px !important;
      margin: 0 !important;
    }
  `;
  document.head?.appendChild(style);
}

function initializeRunarUI() {
  console.debug('RunarUIExtras: Initializing UI...');
  try {
    console.debug('Step 1: Applying CSS variables...');
    var root = document.documentElement;
    root.style.setProperty('--runar-primary-color', '#000000');
    root.style.setProperty('--runar-secondary-color', '#000000');
    root.style.setProperty('--runar-gold-color', '#DAA520');
    root.style.setProperty('--runar-text-color', '#FF3333');
    root.style.setProperty('--runar-input-bg', '#1a1a1a');
    root.style.setProperty('--runar-button-stone-bg', '#111111');
    console.debug('Step 1 done: CSS variables set');

    console.debug('Step 2: Creating sidebar button (CBHub pattern)...');
    if (!document.getElementById('runar-sidebar-button')) {
      var button = document.createElement('div');
      button.id = 'runar-sidebar-button';
      button.className = 'runar-sidebar-button';
      button.title = 'Open Runar';
      button.style.cssText = `
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: center !important;
        padding: 12px 8px !important;
        cursor: pointer !important;
        background: rgba(0, 0, 0, 0.8) !important;
    border: 1px solid #FF3333 !important;
    margin: 0 !important;
        border-radius: 4px !important;
        transition: all 0.2s ease !important;
    color: #FF3333 !important;
    min-height: 48px !important;
    width: 48px !important;
        user-select: none !important;
        pointer-events: auto !important;
        position: relative !important;
        z-index: 100 !important;
      `;
      
      button.innerHTML = `
        <i class="fas fa-comment-alt" style="font-size: 20px; margin-bottom: 4px; pointer-events: none;"></i>
        <span style="font-size: 10px; font-weight: bold; text-transform: uppercase; pointer-events: none;">Runar</span>
      `;
      
      // Add hover effects
      button.addEventListener('mouseenter', function() {
        button.style.background = 'rgba(255, 51, 51, 0.2)';
        button.style.borderColor = '#ff5555';
        button.style.color = '#ff5555';
        button.style.transform = 'scale(1.05)';
      });
      
      button.addEventListener('mouseleave', function() {
        button.style.background = 'rgba(0, 0, 0, 0.8)';
        button.style.borderColor = '#FF3333';
        button.style.color = '#FF3333';
        button.style.transform = '';
      });
      
      // Add click handler
      button.addEventListener('click', function(ev) {
        console.debug('Runar button clicked!');
        ev.preventDefault();
        ev.stopPropagation();
        
        // Visual feedback
        button.style.transform = 'scale(0.95)';
        setTimeout(function() {
          button.style.transform = '';
        }, 150);
        
        // Check if user is a GM
        const isGM = game.user.isGM;
        const windowId = isGM ? 'runar-gm-monitor' : 'runar-player-hub';
        const WindowClass = isGM ? 'GMMonitorWindow' : 'PlayerHubWindow';
        
        // Try to open the appropriate window
        try {
          if (window.ui && window.ui.windows && window.ui.windows[windowId]) {
            // Window already open, just focus it
            const existingWindow = window.ui.windows[windowId];
            existingWindow.bringToTop();
          } else {
            // Need to import and open the window
            const modulePath = isGM ? './GMMonitorWindow.js' : './PlayerHubWindow.js';
            import(modulePath).then(module => {
              const WindowConstructor = module[WindowClass];
              new WindowConstructor().render(true);
            }).catch(err => {
              console.error(`Failed to import ${WindowClass}:`, err);
              if (window.ui && ui.notifications) {
                ui.notifications.error(game.i18n.format("RNR.FailedOpenRunarHub", { role: isGM ? 'GM' : 'Player' }));
              }
            });
          }
        } catch (err) {
          console.error('Error opening Runar window:', err);
          if (window.ui && ui.notifications) {
            ui.notifications.error('Error opening Runar Hub');
          }
        }
      });
      
      const container = getSidebarButtonStack();
      if (container) {
        container.appendChild(button);
        console.debug('Step 2 done: Runar button added to shared stack');
      } else {
        console.debug('Sidebar not found, will retry on ready hook');
      }
    } else {
      console.debug('Step 2 skipped: Button already exists');
    }
    
    console.debug('RunarUIExtras: All done successfully');
  }
  catch (err) {
    console.error('RunarUIExtras error:', err);
    console.error('Stack:', err.stack);
  }
}

if (document.readyState === 'loading') {
  console.debug('RunarUIExtras: DOM still loading, waiting for DOMContentLoaded');
  document.addEventListener('DOMContentLoaded', initializeRunarUI);
} else {
  console.debug('RunarUIExtras: DOM already loaded, initializing immediately');
  initializeRunarUI();
}

Hooks.on('ready', function() {
  console.debug('RunarUIExtras: ready hook fired');
  if (!document.querySelector('#runar-sidebar-button')) {
    console.debug('RunarUIExtras: Button not yet created, initializing now');
    initializeRunarUI();
  }
});

