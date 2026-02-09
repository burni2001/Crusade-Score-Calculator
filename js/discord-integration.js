/**
 * Discord Activity Integration for Crusade Score Calculator
 * Handles Discord SDK initialization, authentication, and activity features
 */

class DiscordIntegration {
    constructor() {
        this.discordSDK = null;
        this.auth = null;
        this.isDiscordEnvironment = false;
        this.clientId = '1470106608687255623';
    }

    /**
     * Initialize Discord SDK
     * @returns {Promise<boolean>} Success status
     */
    async initialize() {
        try {
            // Check if running in Discord
            if (typeof DiscordSDK === 'undefined') {
                console.log('📱 Not running in Discord environment - standard web mode');
                this.isDiscordEnvironment = false;
                return false;
            }

            console.log('🎮 Discord environment detected - initializing Activity...');
            
            this.discordSDK = new DiscordSDK(this.clientId);
            
            // Add timeout to prevent hanging
            const readyPromise = this.discordSDK.ready();
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Discord SDK timeout')), 5000)
            );
            
            await Promise.race([readyPromise, timeoutPromise]);

            console.log('✅ Discord SDK initialized');
            this.isDiscordEnvironment = true;

            // Authenticate user
            await this.authenticate();

            // Setup Discord-specific features
            this.setupDiscordFeatures();

            return true;
        } catch (error) {
            console.error('❌ Discord initialization failed:', error);
            this.isDiscordEnvironment = false;
            return false;
        }
    }

    /**
     * Authenticate Discord user
     */
    async authenticate() {
        try {
            const { code } = await this.discordSDK.commands.authorize({
                client_id: this.clientId,
                response_type: "code",
                state: "",
                prompt: "none",
                scope: [
                    "identify",
                    "guilds"
                ],
            });

            // Exchange code for access token via Discord's built-in proxy
            const response = await fetch("/api/token", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ code }),
            });

            const { access_token } = await response.json();

            // Authenticate with access token
            const auth = await this.discordSDK.commands.authenticate({
                access_token,
            });

            this.auth = auth;

            console.log('✅ Discord user authenticated:', auth.user.username);
            this.displayUserInfo(auth.user);

        } catch (error) {
            console.error('⚠️ Discord authentication failed:', error);
            // Non-critical - app still works without auth
        }
    }

    /**
     * Display user info badge in the UI
     */
    displayUserInfo(user) {
        // Add Discord user badge to header
        const userBadge = document.createElement('div');
        userBadge.id = 'discord-user-badge';
        userBadge.className = 'discord-badge';
        userBadge.innerHTML = `
            <img src="https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png" 
                 alt="${user.username}" 
                 class="discord-avatar"
                 onerror="this.style.display='none'">
            <span class="discord-username">${user.username}</span>
            <span class="discord-discriminator">#${user.discriminator}</span>
        `;
        
        // Insert into header (after the title)
        const header = document.querySelector('header');
        if (header) {
            const titleDiv = header.querySelector('.title');
            if (titleDiv && titleDiv.nextSibling) {
                header.insertBefore(userBadge, titleDiv.nextSibling);
            } else {
                header.appendChild(userBadge);
            }
        }
    }

    /**
     * Setup Discord-specific features
     */
    setupDiscordFeatures() {
        // Set initial activity status
        this.updateActivity('Reviewing Mission Data', 'In Cogitator');

        // Listen for voice channel changes (optional - for future features)
        this.discordSDK.subscribe('VOICE_STATE_UPDATE', (voiceState) => {
            console.log('🎤 Voice state updated:', voiceState);
        });

        console.log('✅ Discord features initialized');
        
        // Fix Discord iframe interactions
        setTimeout(() => this.fixDiscordInteractions(), 500);
    }

    /**
     * Update Discord activity status (shows what user is doing)
     * @param {string} details - Activity details to display
     * @param {string} state - Current state description
     */
    updateActivity(details, state = 'Calculating Scores') {
        if (!this.isDiscordEnvironment) return;

        try {
            this.discordSDK.commands.setActivity({
                activity: {
                    type: 0, // Playing
                    details: details,
                    state: state,
                    timestamps: {
                        start: Date.now()
                    }
                }
            });
        } catch (error) {
            console.warn('Failed to update Discord activity:', error);
        }
    }

    /**
     * Share mission results to Discord channel
     * @param {Object} missionData - Mission results to share
     */
    async shareToChannel(missionData) {
        if (!this.isDiscordEnvironment || !this.discordSDK.channelId) {
            console.warn('Cannot share: Not in a Discord channel');
            return false;
        }

        try {
            const message = this.formatMissionResults(missionData);
            
            // This would require additional Discord permissions
            // For now, we'll just copy to clipboard
            await navigator.clipboard.writeText(message);
            
            console.log('✅ Mission results copied to clipboard');
            return true;
        } catch (error) {
            console.error('Failed to share results:', error);
            return false;
        }
    }

    /**
     * Format mission results for sharing
     */
    formatMissionResults(data) {
        return `**╔═══════════════════════════════╗
║   MISSION DEBRIEF COMPLETE   ║
╚═══════════════════════════════╝**

**Mission:** ${data.missionName || 'Unknown'}
**Difficulty:** ${data.difficulty || 'Unknown'}
**Total Score:** ${data.totalScore || 0}

**By the Emperor, mission archived!**`;
    }

    /**
     * Check if running in Discord
     */
    isInDiscord() {
        return this.isDiscordEnvironment;
    }

    /**
     * Get current user info
     */
    getCurrentUser() {
        return this.auth?.user || null;
    }

    /**
     * Fix interaction issues in Discord iframe
     */
    fixDiscordInteractions() {
        if (!this.isDiscordEnvironment) return;
        
        console.log('🔧 Applying Discord iframe interaction fixes...');
        
        // Force all elements to be interactive
        document.body.style.pointerEvents = 'auto';
        
        // Apply to all interactive elements
        const selectors = 'button, a, input, select, textarea, .btn, .nav-btn, .modal-overlay';
        document.querySelectorAll(selectors).forEach(el => {
            el.style.pointerEvents = 'auto';
            el.style.touchAction = 'manipulation';
        });
        
        // IMPROVED: Handle onclick attributes for Discord CSP
        // Find all elements with onclick attributes and convert them to proper event listeners
        document.querySelectorAll('[onclick]').forEach(element => {
            const onclickCode = element.getAttribute('onclick');
            if (!onclickCode) return;
            
            // Remove the onclick attribute to prevent CSP errors
            element.removeAttribute('onclick');
            
            // Add a proper event listener that executes the code
            element.addEventListener('click', function(e) {
                try {
                    // Create a function from the onclick code and execute it
                    // 'this' will refer to the element, just like native onclick
                    const func = new Function('event', onclickCode);
                    func.call(this, e);
                } catch (error) {
                    console.warn('Failed to execute click handler:', error, 'Code:', onclickCode);
                }
            });
        });
        
        // Do the same for onchange attributes
        document.querySelectorAll('[onchange]').forEach(element => {
            const onchangeCode = element.getAttribute('onchange');
            if (!onchangeCode) return;
            
            element.removeAttribute('onchange');
            
            element.addEventListener('change', function(e) {
                try {
                    const func = new Function('event', onchangeCode);
                    func.call(this, e);
                } catch (error) {
                    console.warn('Failed to execute change handler:', error);
                }
            });
        });
        
        console.log('✅ Discord interaction fixes applied');
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

// Create singleton instance
const discordIntegration = new DiscordIntegration();

// Browser / Global
if (typeof window !== 'undefined') {
    window.discordIntegration = discordIntegration;
    console.log('🎮 Discord Integration module loaded');
}

// Node.js / CommonJS (for testing)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DiscordIntegration, discordIntegration };
}
