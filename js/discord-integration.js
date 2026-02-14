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
     * Detect if running inside a Discord Activity iframe using multiple signals.
     * The Discord SDK global may not be available due to CSP restrictions,
     * so we check URL parameters, hostname, and iframe context as well.
     * @returns {boolean}
     */
    _detectDiscordEnvironment() {
        if (typeof window === 'undefined') return false;

        // Signal 1: Discord SDK global exists (loaded successfully)
        if (typeof DiscordSDK !== 'undefined') return true;

        // Signal 2: Discord Activity iframe query parameters
        try {
            const params = new URLSearchParams(window.location.search);
            if (params.has('frame_id') && params.has('instance_id')) return true;
        } catch (_) { /* ignore */ }

        // Signal 3: Discord Activity proxy hostname
        try {
            if (window.location.hostname.endsWith('.discordsays.com')) return true;
        } catch (_) { /* ignore */ }

        // Signal 4: Cross-origin iframe (Discord Activities are always cross-origin)
        try {
            if (window.self !== window.top) {
                // Accessing parent will throw SecurityError if cross-origin
                void window.top.location.href;
            }
        } catch (_) {
            return true;
        }

        return false;
    }

    /**
     * Initialize Discord SDK
     * @returns {Promise<boolean>} Success status
     */
    async initialize() {
        try {
            // Check if running in Discord using multiple signals
            if (!this._detectDiscordEnvironment()) {
                console.log('📱 Not running in Discord environment - standard web mode');
                this.isDiscordEnvironment = false;
                return false;
            }

            console.log('🎮 Discord environment detected - initializing Activity...');
            this.isDiscordEnvironment = true;

            // Try to initialize the SDK if it loaded successfully
            if (typeof DiscordSDK !== 'undefined') {
                this.discordSDK = new DiscordSDK(this.clientId);

                // Add timeout to prevent hanging
                const readyPromise = this.discordSDK.ready();
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Discord SDK timeout')), 5000)
                );

                await Promise.race([readyPromise, timeoutPromise]);

                console.log('✅ Discord SDK initialized');

                // Authenticate user
                await this.authenticate();

                // Setup Discord-specific features
                this.setupDiscordFeatures();
            } else {
                console.warn('⚠️ Discord SDK not loaded (blocked by CSP) - running in limited Discord mode');
                // Still apply interaction fixes even without full SDK
                setTimeout(() => this.fixDiscordInteractions(), 500);
            }

            return true;
        } catch (error) {
            console.error('❌ Discord SDK initialization failed:', error);
            // Still mark as Discord environment even if SDK init fails
            // (detection was positive, only SDK features are unavailable)
            console.log('🎮 Running in Discord without SDK features');
            setTimeout(() => this.fixDiscordInteractions(), 500);
            return true;
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
                    "identify"
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

        const avatar = document.createElement('img');
        avatar.src = `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`;
        avatar.alt = user.username;
        avatar.className = 'discord-avatar';
        avatar.addEventListener('error', function() { this.style.display = 'none'; });

        const username = document.createElement('span');
        username.className = 'discord-username';
        username.textContent = user.username;

        const discriminator = document.createElement('span');
        discriminator.className = 'discord-discriminator';
        discriminator.textContent = '#' + user.discriminator;

        userBadge.appendChild(avatar);
        userBadge.appendChild(username);
        userBadge.appendChild(discriminator);

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
                    type: 4, // Custom
                    name: "Crusade Score Calculator",
                    emoji: {
                        name: "⚙️"
                    },
                    details: "Using",
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

        // Force all elements to be interactive in Discord iframe
        document.body.style.pointerEvents = 'auto';

        const selectors = 'button, a, input, select, textarea, .btn, .nav-btn, .modal-overlay, .event-item, .cycle-header, .dropdown, .gear-btn';
        document.querySelectorAll(selectors).forEach(el => {
            el.style.pointerEvents = 'auto';
            el.style.touchAction = 'manipulation';
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
