/* SidebarButton.js - Adds Rúnar button to sidebar */

import { DataManager } from './DataManager.js';

console.log("Rúnar Sidebar Button: Module loaded and executing initialization");

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
  console.log("Rúnar Button: Initializing...");
  console.log("Rúnar Button: Checking for existing button...");
  
  try {
    const existing = document.getElementById("runar-sidebar-button");
    console.log("Rúnar Button: Existing button found:", !!existing);
    
    if (!existing) {
      console.log("Rúnar Button: Creating new button...");
      const button = document.createElement("div");
      button.id = "runar-sidebar-button";
      button.className = "runar-sidebar-button";
      button.title = "Open RagNarok's Rúnar";
      button.style.cssText = `
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        padding: 0 !important;
        cursor: pointer !important;
        background: rgba(0, 0, 0, 0.9) !important;
        border: 2px solid #6495ED !important;
        margin: 0 !important;
        border-radius: 4px !important;
        transition: all 0.2s ease !important;
        color: #6495ED !important;
        min-height: 32px !important;
        height: 32px !important;
        width: 32px !important;
        user-select: none !important;
        pointer-events: auto !important;
        position: relative !important;
        z-index: 100 !important;
      `;
      
      button.innerHTML = `
        <i class="fas fa-comments" style="font-size: 14px; pointer-events: none;"></i>
        <span class="sidebar-badge" style="display: none; position: absolute; top: -6px; right: -6px; background: #ff0000; color: white; border-radius: 50%; padding: 2px 4px; font-size: 9px; font-weight: bold; min-width: 16px; text-align: center;"></span>
      `;
      
      console.log("Rúnar Button: Button element created");
      
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
        console.log("Rúnar button clicked!");
        ev.preventDefault();
        ev.stopPropagation();
        
        // Open the appropriate window based on user role
        if (window.RagnaroksRunarUIManager) {
          if (game.user.isGM) {
            // Open both GM Monitor and Player Hub for GMs
            window.RagnaroksRunarUIManager.openGMMonitor();
            window.RagnaroksRunarUIManager.openPlayerHub();
          } else {
            window.RagnaroksRunarUIManager.openPlayerHub();
          }
        } else {
          console.error("RagnaroksRunarUIManager not found!");
          if (ui && ui.notifications) {
            ui.notifications.error("Rúnar not initialized yet!");
          }
        }
      });
      
      console.log("Rúnar Button: Event listeners attached");
      
      // Update badge initially
      updateBadge();
      
      // Update badge periodically
      setInterval(updateBadge, 2000);
      
      // Find the custom button container or sidebar
      let container = document.querySelector("#custom-sidebar-buttons");
      console.log("Rúnar Button: Found existing container:", !!container);
      
      if (!container) {
        // Create the container if it doesn't exist
        const sidebar = document.querySelector("#sidebar-tabs");
        console.log("Rúnar Button: Found sidebar:", !!sidebar);
        
        if (sidebar) {
          container = document.createElement("div");
          container.id = "custom-sidebar-buttons";
          sidebar.appendChild(container);
          console.log("Rúnar Button: Created new container");
        }
      }
      
      if (container) {
        // Move existing buttons into the container if they're not already there
        const cbhubBtn = document.getElementById("cbhub-permanent-button");
        const deckBtn = document.getElementById("deck-sidebar-button");
        
        console.log("Rúnar Button: Found CBHub:", !!cbhubBtn);
        console.log("Rúnar Button: Found Deck:", !!deckBtn);
        
        if (cbhubBtn && cbhubBtn.parentElement.id !== "custom-sidebar-buttons") {
          container.appendChild(cbhubBtn);
          console.log("Rúnar Button: Moved CBHub to container");
        }
        if (deckBtn && deckBtn.parentElement.id !== "custom-sidebar-buttons") {
          container.appendChild(deckBtn);
          console.log("Rúnar Button: Moved Deck to container");
        }
        
        // Add the Rúnar button
        container.appendChild(button);
        console.log("Rúnar Button: ✓ Added to custom container successfully!");
      } else {
        console.warn("Rúnar Button: ✗ Could not find or create sidebar container");
      }
    } else {
      console.log("Rúnar Button: Already exists, skipping");
    }
  } catch (err) {
    console.error("Rúnar Button ERROR:", err);
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
  console.log("Rúnar Button: Foundry ready, initializing button...");
  setTimeout(initializeRunarButton, 100);
});
