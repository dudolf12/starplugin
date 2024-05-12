//META{"name":"StarPlugin","displayName":"StarPlugindev","source":"https://github.com/dudolf12/starplugin/blob/main/starplugin.plugin.js","version":"1.02","updateUrl":"https://github.com/dudolf12/starplugin/blob/main/starplugin.plugin.js","author":"dudolf","description":"adds the ability to add channels to favorites"}*//

const ZeresPluginLibrary = BdApi.Plugins.get("ZeresPluginLibrary");
if (!ZeresPluginLibrary) {
    BdApi.alert("The missing library", `The ZeresPluginLibrary library is required for StarPlugin to run. Click OK to download it.`);
    require("request").get("https://rauenzi.github.io/BDPluginLibrary/release/0PluginLibrary.plugin.js", (error, response, body) => {
        if (error) {
            console.error("Unable to download ZeresPluginLibrary:", error);
            return;
        }
        const fs = require("fs");
        const path = require("path");
        const pluginPath = path.join(BdApi.Plugins.folder, "0PluginLibrary.plugin.js");
        fs.writeFileSync(pluginPath, body);
    });
    return;
}

const XenoLib = BdApi.Plugins.get("XenoLib");
if (!XenoLib) {
    BdApi.alert("The missing library", `The 1XenoLib library is required for StarPlugin to run. Click OK to download it.`);
    require("request").get("https://raw.githubusercontent.com/1Lighty/BetterDiscordPlugins/master/Plugins/1XenoLib.plugin.js", (error, response, body) => {
        if (error) {
            console.error("Unable to download 1XenoLib:", error);
            return;
        }
        const fs = require("fs");
        const path = require("path");
        const pluginPath = path.join(BdApi.Plugins.folder, "1XenoLib.plugin.js");
        fs.writeFileSync(pluginPath, body);
    });
    return;
}

const { PluginUtilities, Utilities } = ZeresPluginLibrary;
const { ContextMenu, Webpack, Patcher } = BdApi;
const path = require("path");
const GOLD_STAR_TEXT_URL = `https://raw.githubusercontent.com/dudolf12/starplugin/main/star2_text.png`;
const GREY_STAR_TEXT_URL = `https://raw.githubusercontent.com/dudolf12/starplugin/main/star1_text.png`;
const GOLD_STAR_VOICE_URL = `https://raw.githubusercontent.com/dudolf12/starplugin/main/star2_voice.png`;
const GREY_STAR_VOICE_URL = `https://raw.githubusercontent.com/dudolf12/starplugin/main/star1_voice.png`;
const AUDIO_URL = 'https://raw.githubusercontent.com/dudolf12/starplugin/main/audio.mp3';
const TRASH_ICON_URL = 'https://raw.githubusercontent.com/dudolf12/starplugin/main/trash.png';

class StarPlugin {
    constructor() {
        this.audio = new Audio(AUDIO_URL);
        this.interval = null;
        this.activeChannels = BdApi.loadData('StarPlugin', 'starredChannels') || {};
        this.activeChannelId = null;
        this.whitelistedServers = BdApi.loadData('StarPlugin', 'whitelistedServers') || [];
        this.mutationObserver = null;
		this.markVoiceChannels = false;
		this.downloadingFiles = {};
		this.cachedImages = {};
		this.fileLocks = {};
    }
	
    async fetchFile(url) {
        try {
            const response = await fetch(url, { mode: 'no-cors' });
            if (!response.ok) {
                console.error(`Error downloading file: ${url}`);
                return null;
            }
            const blob = await response.blob();
            return blob;
        } catch (error) {
            console.error(`Error downloading file: ${url}`, error);
            return null;
        }
    }

    start() {
        this.downloadAndCacheFiles();
        this.setupMutationObserver();
		this.patchContextMenu();
        this.loadSettings();
        this.interval = setInterval(() => {
            this.checkForUnreadMessages();
        }, 1000);
    }
    
    stop() {
        Patcher.unpatchAll();
        document.querySelectorAll('.star-image').forEach(el => el.remove());
        if (this.interval) clearInterval(this.interval);
        if (this.mutationObserver) {
            this.mutationObserver.disconnect();
            this.mutationObserver = null;
        }
        const Dispatcher = BdApi.findModuleByProps("dispatch", "unsubscribe");
        if (Dispatcher) {
            Dispatcher.unsubscribe("VOICE_STATE_UPDATE", this.voiceStateUpdateHandler);
        }
    }
	
    async downloadAndCacheFiles() {
        this.cachedImages["star2_text.png"] = await this.fetchAndCacheFile(GOLD_STAR_TEXT_URL);
        this.cachedImages["star1_text.png"] = await this.fetchAndCacheFile(GREY_STAR_TEXT_URL);
        this.cachedImages["star2_voice.png"] = await this.fetchAndCacheFile(GOLD_STAR_VOICE_URL);
        this.cachedImages["star1_voice.png"] = await this.fetchAndCacheFile(GREY_STAR_VOICE_URL);
		this.cachedImages["audio.mp3"] = await this.fetchAndCacheFile(AUDIO_URL);
		this.cachedImages["trash.png"] = await this.fetchAndCacheFile(TRASH_ICON_URL);
    }
	
    async fetchAndCacheFile(url) {
        if (this.fileLocks[url]) {
            console.log(`file is downloading ${url}. Waiting...`);
            await this.fileLocks[url];
        }
        try {
            this.fileLocks[url] = new Promise(async (resolve, reject) => {
                const response = await fetch(url);
                const blob = await response.blob();
                const reader = new FileReader();
                reader.onloadend = () => {
                    resolve(reader.result);
                };
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
            const result = await this.fileLocks[url];
            return result;
        } catch (error) {
            console.error(`Error downloading file: ${url}`, error);
            return null;
        } finally {
            delete this.fileLocks[url];
        }
    }
	
    setupMutationObserver() {
        const targetSelector = 'div.scroller__1f498.scrollerBase_f742b2';
        const targetNode = document.querySelector(targetSelector);
        if (!targetNode) {
            setTimeout(() => this.setupMutationObserver(), 1000);
            return;
        } else {
        }
        const config = { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] };
        const callback = (mutationsList, observer) => {
            for(let mutation of mutationsList) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    this.addStarToChannels();
                }
            }
        };
        const observer = new MutationObserver(callback);
        this.mutationObserver = observer;
        observer.observe(document.body, config);
    }
	
    determineChannelType(channel) {
        const ariaLabel = channel.getAttribute('aria-label');
        if (ariaLabel) {
            const userCountMatch = ariaLabel.match(/, (\d+)/);
            if (userCountMatch && userCountMatch[1]) {
                const userCount = parseInt(userCountMatch[1], 10);
                if (!isNaN(userCount)) {
                    return false;
                }
            } else {
            }
        } else {
        }
        return true;
    }

    addStarToChannels() {
        if (!this.isCurrentServerWhitelisted()) {
            return;
        }
    
        let channels = document.querySelectorAll('[data-list-item-id^="channels___"]');
        channels.forEach(channel => {
            const iconContainer = channel.querySelector('.iconContainer__6a580');
            if (!iconContainer) {
                return;
            }
            if (iconContainer.querySelector('img.star-image')) {
                return;
            }
            const channelId = channel.getAttribute('data-list-item-id').replace('channels___', '');
            const isTextChannel = this.determineChannelType(channel);
            if (!isTextChannel && !this.markVoiceChannels) {
                return;
            }
    
            const starImage = document.createElement('img');
            starImage.className = 'star-image';
            
            if (this.activeChannels[channelId]) {
                starImage.src = isTextChannel ? this.updateStarImageSrc(GOLD_STAR_TEXT_URL) : this.updateStarImageSrc(GOLD_STAR_VOICE_URL);
            } else {
                starImage.src = isTextChannel ? this.updateStarImageSrc(GREY_STAR_TEXT_URL) : this.updateStarImageSrc(GREY_STAR_VOICE_URL);
            }
    
            starImage.style.width = '24px';
            starImage.style.height = '24px';
            starImage.style.boxSizing = 'border-box';
            starImage.addEventListener('click', () => {
                if (starImage.src === this.updateStarImageSrc(GOLD_STAR_TEXT_URL) || starImage.src === this.updateStarImageSrc(GOLD_STAR_VOICE_URL)) {
                    starImage.src = isTextChannel ? this.updateStarImageSrc(GREY_STAR_TEXT_URL) : this.updateStarImageSrc(GREY_STAR_VOICE_URL);
                    delete this.activeChannels[channelId];
                } else {
                    starImage.src = isTextChannel ? this.updateStarImageSrc(GOLD_STAR_TEXT_URL) : this.updateStarImageSrc(GOLD_STAR_VOICE_URL);
                    this.activeChannels[channelId] = { read: true, text: isTextChannel.toString() };
                }
                BdApi.saveData('StarPlugin', 'starredChannels', this.activeChannels);
            });
    
            iconContainer.innerHTML = '';
            iconContainer.appendChild(starImage);
        });
    }
	
    getFilenameFromUrl(url) {
        return url.split('/').pop().split('?')[0];
    }
	
    getMimeTypeFromUrl(url) {
        const extension = url.split('.').pop().toLowerCase();
        switch (extension) {
            case 'png':
                return 'image/png';
            case 'jpg':
            case 'jpeg':
                return 'image/jpeg';
            case 'mp3':
                return 'audio/mpeg';
            default:
                return 'application/octet-stream';
        }
    }

    updateStarImageSrc(url) {
        const filename = this.getFilenameFromUrl(url);
        if (this.cachedImages[filename]) {
            return this.cachedImages[filename];
        } else {
            console.error(`file ${filename} is not stored. download attempt...`);
            this.downloadAndCacheFiles();
            return url;
        }
    }

    checkForUnreadMessages() {
        const UnreadStore = BdApi.findModuleByProps("getUnreadCount");
        const VoiceStateStore = BdApi.findModuleByProps("getVoiceStates");
        const Dispatcher = BdApi.findModuleByProps("dispatch", "subscribe");
        if (!UnreadStore || !VoiceStateStore || !Dispatcher) {
            return;
        }
        Dispatcher.subscribe("VOICE_STATE_UPDATE", (data) => {
            const channelId = data.voiceState.channelId;
            if (this.activeChannels[channelId] && this.activeChannels[channelId].text === "false") {
                this.AUDIO_URL.play();
                const channelName = this.getChannelNameById(channelId);
                if (channelName) {
                    this.showVoiceChannelNotification(channelName);
                } else {
                }
            }
        });
        Object.keys(this.activeChannels).forEach(channelId => {
            const channelData = this.activeChannels[channelId];
            if (channelData.text === "true" || channelData.text === true) {
                const unreadCount = UnreadStore.getUnreadCount(channelId);
                if (unreadCount > 0 && channelData.read) {
                    this.audio.play();
                    this.activeChannelId = channelId;
                    const channelName = this.getChannelNameById(channelId);
                    this.showNotification(channelName);
                    channelData.read = false;
                    BdApi.saveData('StarPlugin', 'starredChannels', this.activeChannels);
                } else if (unreadCount === 0) {
                    channelData.read = true;
                    BdApi.saveData('StarPlugin', 'starredChannels', this.activeChannels);
                }
            }
        });
    }
    
    getChannelNameById(channelId) {
        const ChannelStore = BdApi.Webpack.getStore("ChannelStore");
        if (!ChannelStore) {
            return null;
        }
        const channel = ChannelStore.getChannel(channelId);
        if (!channel) {
            return null;
        }
        return channel.name;
    }

    showNotification(channelName) {
        if (!("Notification" in window)) {
            return;
        }
        if (Notification.permission === "granted") {
            this.createNotification(channelName);
        } else if (Notification.permission !== "denied") {
            Notification.requestPermission().then(permission => {
                if (permission === "granted") {
                    this.createNotification(channelName);
                }
            });
        }
    }
	
    showVoiceChannelNotification(channelName) {
        if (!("Notification" in window)) {
            return;
        }
        if (Notification.permission === "granted") {
            this.createVoiceChannelNotification(channelName);
        } else if (Notification.permission !== "denied") {
            Notification.requestPermission().then(permission => {
                if (permission === "granted") {
                    this.createVoiceChannelNotification(channelName);
                } else {
                }
            });
        }
    }
    
    createVoiceChannelNotification(channelName) {
        const notification = new Notification("Aktualizacja kanału głosowego", {
            body: `Someone has join the voice channel: ${channelName}`,
            silent: true
        });
        notification.onclick = () => {
            window.focus();
            const channel = BdApi.findModuleByProps("getChannel").getChannel(this.activeChannelId);
            if (!channel) {
                return;
            }
            const serverId = channel.guild_id;
            const serverIcon = document.querySelector(`div[data-list-item-id="guildsnav___${serverId}"]`);
            if (!serverIcon) {
                return;
            }
            serverIcon.click();
            setTimeout(() => {
                const channelLink = document.querySelector(`a[data-list-item-id="channels___${this.activeChannelId}"]`);
                if (channelLink) {
                    channelLink.click();
                } else {
                }
            }, 200);
        };
    }

    createNotification(channelName) {
        const notification = new Notification("Nowa wiadomość", {
            body: `You have a new message on the channel: ${channelName}`,
            silent: true
        });
        notification.onclick = () => {
            window.focus();
            const ChannelStore = BdApi.Webpack.getStore("ChannelStore");
            if (!ChannelStore) {
                return;
            }
            const channel = ChannelStore.getChannel(this.activeChannelId);
            if (!channel) {
                return;
            }
            const serverId = channel.guild_id;
            const serverIcon = document.querySelector(`div[data-list-item-id="guildsnav___${serverId}"]`);
            if (!serverIcon) {
                return;
            }
            serverIcon.click();
            setTimeout(() => {
                const channelLink = document.querySelector(`a[data-list-item-id="channels___${this.activeChannelId}"]`);
                if (channelLink) {
                    channelLink.click();
                } else {
                }
            }, 200);
        };
    }

    isCurrentServerWhitelisted() {
        const serverName = this.getCurrentServerName();
        return this.whitelistedServers.includes(serverName);
    }

    getCurrentServerName() {
        const serverId = BdApi.findModuleByProps("getLastSelectedGuildId").getLastSelectedGuildId();
        if (!serverId) {
            return null;
        }
        const serverName = this.getGuildNameById(serverId);
        return serverName;
    }
	
    getGuildNameById(serverid) {
        if (!serverid) {
            return null;
        }
        const trimmedGuildId = serverid.trim();
        const GuildStore = BdApi.Webpack.getStore("GuildStore");
        if (!GuildStore) {
            return null;
        }
        const guild = GuildStore.getGuild(trimmedGuildId);
        if (guild) {
            return guild.name;
        } else {
            return null;
        }
    }
	
    patchContextMenu() {
        BdApi.ContextMenu.patch("guild-context", (retVal, props) => {
            const serverId = props.guildId || (props.guild && props.guild.id);
            if (!serverId) {
                return;
            }
            const guildName = this.getGuildNameById(serverId); 
            if (!guildName) {
                return;
            }
            const isWhitelisted = this.whitelistedServers.includes(guildName);
            const label = isWhitelisted ? "Whitelist Remove" : "Whitelist Add";
            const action = isWhitelisted ? () => this.removeFromWhitelist(guildName) : () => this.addToWhitelist(guildName);
            const menuItem = BdApi.ContextMenu.buildItem({
                type: "text",
                label: label,
                action: () => {
                    action();
                }
            });
    
            retVal.props.children.push(menuItem);
        });
    }
	
    addToWhitelist(serverName) {
        if (!this.whitelistedServers.includes(serverName)) {
            this.whitelistedServers.push(serverName);
            BdApi.saveData('StarPlugin', 'whitelistedServers', this.whitelistedServers);
        } else {
        }
    }
    
    removeFromWhitelist(serverName) {
        const index = this.whitelistedServers.indexOf(serverName);
        if (index !== -1) {
            this.whitelistedServers.splice(index, 1);
            BdApi.saveData('StarPlugin', 'whitelistedServers', this.whitelistedServers);
        } else {
        }
    }
	
    getSettingsPanel() {
        const panel = document.createElement("div");
        panel.style.padding = "10px";
        const markVoiceChannelsCheckbox = document.createElement("input");
        markVoiceChannelsCheckbox.type = "checkbox";
        markVoiceChannelsCheckbox.checked = this.markVoiceChannels;
        markVoiceChannelsCheckbox.disabled = true;
        markVoiceChannelsCheckbox.onchange = (e) => {
            this.markVoiceChannels = e.target.checked;
            this.saveSettings();
			this.loadSettings();
        };
        const label = document.createElement("label");
        label.style.color = "white";
        label.style.marginBottom = "30px";
        
        const labelText = document.createElement("span");
        labelText.style.textDecoration = "line-through";
        labelText.style.textDecorationColor = "black";
        labelText.textContent = " Mark voice channels ";
        
        label.appendChild(markVoiceChannelsCheckbox);
        label.appendChild(labelText);
        label.appendChild(document.createElement("span")).textContent = "Coming Soon";
        panel.appendChild(label);
        const serverListTitle = document.createElement("h3");
        serverListTitle.textContent = "Whitelisted Servers:";
        serverListTitle.style.color = "white";
		serverListTitle.style.marginTop = "20px";
        serverListTitle.style.marginBottom = "20px";
        panel.appendChild(serverListTitle);
    
        this.whitelistedServers.forEach(serverName => {
            const serverItem = document.createElement("div");
            serverItem.textContent = serverName;
            serverItem.style.color = "white";
            serverItem.style.display = "flex";
            serverItem.style.alignItems = "center";
            serverItem.style.justifyContent = "space-between";
            serverItem.style.marginBottom = "10px";
    
            const trashIcon = document.createElement("img");
            trashIcon.src = TRASH_ICON_URL;
            trashIcon.style.cursor = "pointer";
            trashIcon.style.marginLeft = "10px";
            trashIcon.style.width = "24px";
            trashIcon.style.height = "24px";
            trashIcon.addEventListener("click", () => {
                this.removeFromWhitelist(serverName);
                panel.removeChild(serverItem);
            });
            trashIcon.addEventListener("mouseover", () => {
                serverItem.style.color = "red";
            });
            trashIcon.addEventListener("mouseout", () => {
                serverItem.style.color = "white";
            });
    
            serverItem.appendChild(trashIcon);
            panel.appendChild(serverItem);
        });
        const channelListTitle = document.createElement("h3");
        channelListTitle.textContent = "Active Channels:";
        channelListTitle.style.color = "white";
        channelListTitle.style.marginBottom = "20px";
        panel.appendChild(channelListTitle);
    
        Object.keys(this.activeChannels).forEach(channelId => {
            const channelItem = document.createElement("div");
            channelItem.textContent = this.getChannelNameById(channelId);
            channelItem.style.color = "white";
            channelItem.style.display = "flex";
            channelItem.style.alignItems = "center";
            channelItem.style.justifyContent = "space-between";
            channelItem.style.marginBottom = "10px";
    
            const trashIcon = document.createElement("img");
            trashIcon.src = TRASH_ICON_URL;
            trashIcon.style.cursor = "pointer";
            trashIcon.style.marginLeft = "10px";
            trashIcon.style.width = "24px";
            trashIcon.style.height = "24px";
            trashIcon.addEventListener("click", () => {
                delete this.activeChannels[channelId];
                BdApi.saveData('StarPlugin', 'starredChannels', this.activeChannels);
                panel.removeChild(channelItem);
            });
            trashIcon.addEventListener("mouseover", () => {
                channelItem.style.color = "red";
            });
            trashIcon.addEventListener("mouseout", () => {
                channelItem.style.color = "white";
            });
    
            channelItem.appendChild(trashIcon);
            panel.appendChild(channelItem);
        });
    
        return panel;
    }

    loadSettings() {
        const settings = BdApi.loadData('StarPlugin', 'settings');
        if (settings) {
            this.markVoiceChannels = settings.markVoiceChannels;
        }
    }

    saveSettings() {
        BdApi.saveData('StarPlugin', 'settings', {
            markVoiceChannels: this.markVoiceChannels
        });
    }
}
window.myPluginInstance = new StarPlugin();
module.exports = StarPlugin;
