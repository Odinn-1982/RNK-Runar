/* SidebarButton.js - Adds RÃºnar button to sidebar */

import { DataManager } from './DataManager.js';

console.debug("RÃºnar Sidebar Button: Module loaded and executing initialization");

function updateBadge() {
  const button = document.getElementById("runar-sidebar-button");
  if (!button) return;
  
  const totalUnread = DataManager.getTotalUnread();
  let badge = button.querySelector('.sidebar-badge');
  
  if (totalUnread > 0) {
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'sidebar-badge';
      button.appendChild(badge);
    }
    badge.textContent = totalUnread > 99 ? '99+' : totalUnread;
    badge.style.display = 'block';
  } else if (badge) {
    badge.style.display = 'none';
  }
}

function initializeRunarButton() {
  console.debug("RÃºnar Button: Initializing...");
  console.debug("RÃºnar Button: Checking for existing button...");
  
  try {
    const existing = document.getElementById("runar-sidebar-button");
    console.debug("RÃºnar Button: Existing button found:", !!existing);
    
    if (!existing) {
      console.debug("RÃºnar Button: Creating new button...");
      const button = document.createElement("div");
      button.id = "runar-sidebar-button";
      button.className = "runar-sidebar-button";
      button.title = "Open RNK Runar";
      button.style.cssText = `
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        padding: 0 !important;
        cursor: pointer !important;
        background: rgba(0, 0, 0, 0.9) !important;
        border: 2px solid #6495ED !important;
        margin: 2px !important;
        border-radius: 4px !important;
        transition: all 0.2s ease !important;
        color: #6495ED !important;
        min-height: 36px !important;
        height: 36px !important;
        width: 36px !important;
        user-select: none !important;
        pointer-events: auto !important;
        position: relative !important;
        z-index: 100 !important;
        overflow: hidden !important;
        line-height: 0 !important;
      `;
      
      button.innerHTML = `
        <i class="fas fa-comments" style="font-size: 16px; pointer-events: none;"></i>
        <span class="sidebar-badge" style="display: none; position: absolute; top: -6px; right: -6px; background: #ff0000; color: white; border-radius: 50%; padding: 2px 4px; font-size: 9px; font-weight: bold; min-width: 16px; text-align: center;"></span>
      `;
      
      console.debug("RÃºnar Button: Button element created");
      
      // Add hover effects
      button.addEventListener('mouseenter', () => {
        button.style.background = 'rgba(100, 149, 237, 0.2)';
        button.style.borderColor = '#87CEEB';
        button.style.color = '#87CEEB';
        button.style.transform = 'scale(1.05)';
      });
      
      button.addEventListener('mouseleave', () => {
        button.style.background = 'rgba(0, 0, 0, 0.9)';
        button.style.borderColor = '#6495ED';
        button.style.color = '#6495ED';
        button.style.transform = '';
      });
      
      // Add click handler
      button.addEventListener("click", function(ev) {
        console.debug("RÃºnar button clicked!");
        ev.preventDefault();
        ev.stopPropagation();
        
        // Open the appropriate window based on user role
        if (window.RNKRunarUIManager) {
          if (game.user.isGM) {
            // Open both GM Monitor and Player Hub for GMs
            window.RNKRunarUIManager.openGMMonitor();
            window.RNKRunarUIManager.openPlayerHub();
          } else {
            window.RNKRunarUIManager.openPlayerHub();
          }
        } else {
          console.error("RNKRunarUIManager not found!");
          if (ui && ui.notifications) {
            ui.notifications.error(game.i18n.localize("RNR.RunarNotInitialized"));
          }
        }
      });
      
      console.debug("RÃºnar Button: Event listeners attached");
      
      // Update badge initially
      updateBadge();
      
      // Update badge periodically
      setInterval(updateBadge, 2000);
      
      // Find the custom button container or sidebar
      let container = document.querySelector("#custom-sidebar-buttons");
      console.debug("RÃºnar Button: Found existing container:", !!container);
      
      if (!container) {
        // Create the container if it doesn't exist, inserting after the settings item for proper layout
        const sidebar = document.querySelector('#sidebar-tabs');
        console.debug('RÃºnar Button: Found sidebar:', !!sidebar);
        
        if (sidebar) {
          container = document.createElement('div');
          container.id = 'custom-sidebar-buttons';
          // Prefer to insert after the settings button to match other modules
          const reference = sidebar.querySelector('.item[data-tab="settings"]') ?? sidebar.lastElementChild;
          if (reference) reference.insertAdjacentElement('afterend', container);
          else sidebar.appendChild(container);
          console.debug('RÃºnar Button: Created new container');
        }
      }
      
      if (container) {
        // Move existing buttons into the container if they're not already there
        const cbhubBtn = document.getElementById("cbhub-permanent-button");
        const deckBtn = document.getElementById("deck-sidebar-button");
        
        console.debug("RÃºnar Button: Found CBHub:", !!cbhubBtn);
        console.debug("RÃºnar Button: Found Deck:", !!deckBtn);
        
        if (cbhubBtn && cbhubBtn.parentElement.id !== "custom-sidebar-buttons") {
          container.appendChild(cbhubBtn);
          console.debug("RÃºnar Button: Moved CBHub to container");
        }
        if (deckBtn && deckBtn.parentElement.id !== "custom-sidebar-buttons") {
          container.appendChild(deckBtn);
          console.debug("RÃºnar Button: Moved Deck to container");
        }
        
        // Add the RÃºnar button
        container.appendChild(button);
        console.debug("RÃºnar Button: âœ“ Added to custom container successfully!");
      } else {
        console.warn("RÃºnar Button: âœ— Could not find or create sidebar container");
      }
    } else {
      console.debug("RÃºnar Button: Already exists, skipping");
    }
  } catch (err) {
    console.error("RÃºnar Button ERROR:", err);
    console.error("Stack trace:", err.stack);
  }
}

// Initialize on DOM ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeRunarButton);
} else {
  initializeRunarButton();
}

// Also initialize on Foundry ready hook
Hooks.once('ready', () => {
  console.debug("RÃºnar Button: Foundry ready, initializing button...");
  setTimeout(initializeRunarButton, 100);
});


