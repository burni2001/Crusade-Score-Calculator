/**
 * Discord Activity Integration
 * Handles Discord SDK initialization and user authentication
 */

class DiscordIntegration {
    constructor() {
        this.discordSDK = null;
        this.auth = null;
        this.isDiscordEnvironment = false;
    }

    /**
     * Initialize Discord SDK
     * @returns {Promise<boolean>} Success status
     */
    async initialize() {
        try {
            // Check if running in Discord
            if (typeof DiscordSDK === 'undefined') {
                console.log('Not running in Discord environment');
                this.isDiscordEnvironment = false;
                return false;
            }

            this.discordSDK = new DiscordSDK(/* YOUR_CLIENT_ID */);
            await this.discordSDK.ready();

            console.log('Discord SDK initialized');
            this.isDiscordEnvironment = true;

            // Authenticate user
            await this.authenticate();

            // Setup Discord-specific features
            this.setupDiscordFeatures();

            return true;
        } catch (error) {
            console.error('Discord initialization failed:', error);
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
                client_id: /* YOUR_CLIENT_ID */,
                response_type: "code",
                state: "",
                prompt: "none",
                scope: [
                    "identify",
                    "guilds"
                ],
            });

            // Exchange code for access token
            const response = await fetch("/.proxy/api/token", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    code,
                }),
            });

            const { access_token } = await response.json();

            // Get user info
            const auth = await this.discordSDK.commands.authenticate({
                access_token,
            });

            this.auth = auth;

            console.log('Discord user authenticated:', auth.user.username);
            this.displayUserInfo(auth.user);

        } catch (error) {
            console.error('Discord authentication failed:', error);
        }
    }

    /**
     * Display user info in the UI
     */
    displayUserInfo(user) {
        // Add a Discord user badge to your UI
        const userBadge = document.createElement('div');
        userBadge.id = 'discord-user-badge';
        userBadge.innerHTML = `
            <div class="discord-badge">
                <img src="https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png" 
                     alt="${user.username}" 
                     class="discord-avatar">
                <span class="discord-username">${user.username}</span>
            </div>
        `;
        
        // Insert at top of page
        const header = document.querySelector('header') || document.body;
        header.insertBefore(userBadge, header.firstChild);
    }

    /**
     * Setup Discord-specific features
     */
    setupDiscordFeatures() {
        // Set activity status
        this.updateActivity('Calculating Crusade Scores');

        // Listen for voice channel changes
        this.discordSDK.subscribe('VOICE_STATE_UPDATE', (voiceState) => {
            console.log('Voice state updated:', voiceState);
        });

        // Listen for speaking events (optional - for future features)
        this.discordSDK.subscribe('SPEAKING_START', ({ user_id }) => {
            console.log('User started speaking:', user_id);
        });
    }

    /**
     * Update Discord activity status
     * @param {string} details - Activity details to display
     */
    updateActivity(details) {
        if (!this.isDiscordEnvironment) return;

        this.discordSDK.commands.setActivity({
            activity: {
                type: 0, // Playing
                details: details,
                state: 'In Mission Debrief',
                assets: {
                    large_image: 'crusade_logo', // Upload to Discord app assets
                    large_text: 'Crusade Score Calculator'
                }
            }
        });
    }

    /**
     * Share results to voice channel
     * @param {Object} missionData - Mission results to share
     */
    async shareToChannel(missionData) {
        if (!this.isDiscordEnvironment) return;

        const message = this.formatMissionResults(missionData);
        
        // Send message to current channel
        await this.discordSDK.commands.sendMessage({
            channel_id: this.discordSDK.channelId,
            content: message
        });
    }

    /**
     * Format mission results for Discord message
     */
    formatMissionResults(data) {
        return `
**Mission Complete: ${data.missionName}**
Difficulty: ${data.difficulty}
Score: ${data.totalScore}
MVP: ${data.mvpPlayer || 'N/A'}
        `.trim();
    }

    /**
     * Check if running in Discord
     */
    isInDiscord() {
        return this.isDiscordEnvironment;
    }
}

// Export singleton instance
const discordIntegration = new DiscordIntegration();
