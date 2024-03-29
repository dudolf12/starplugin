//META{"name":"StarPlugin","displayName":"StarPlugin","source":"https://github.com/dudolf12/starplugin/blob/main/starplugin.plugin.js","version":"0.9.9","updateUrl":"https://github.com/dudolf12/starplugin/blob/main/starplugin.plugin.js","author":"dudolf","description":"adds the ability to add channels to favorites"}*//

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

const { WebpackModules, Patcher, Utilities } = ZeresPluginLibrary;
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
        this.lastContextMenuUpdate = 0;
		this.contextMenuListener = this.addContextMenuOption.bind(this);
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
        this.addContextMenuOption();
		this.setupMutationObserver();
		this.downloadAndCacheFiles();
		this.loadSettings();
        this.interval = setInterval(() => {
            this.checkForUnreadMessages();
        }, 1000);
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

    stop() {
        document.querySelectorAll('.star-image').forEach(el => el.remove());
        window.removeEventListener("contextmenu", this.contextMenuListener);
        clearInterval(this.interval);
        if (this.mutationObserver) {
            this.mutationObserver.disconnect();
        }
    }
	
    setupMutationObserver() {
        const targetSelector = 'div.scroller_f0f183.scrollerBase_dc3aa9';
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
        if (!this.isCurrentServerWhitelisted()) return;
        let channels = document.querySelectorAll('[data-list-item-id^="channels___"]');
        channels.forEach(channel => {
            const iconContainer = channel.querySelector('.iconContainer__3f9b0');
            if (!iconContainer) return;
            if (iconContainer.querySelector('img.star-image')) return;
            const channelId = channel.getAttribute('data-list-item-id').replace('channels___', '');
            const isTextChannel = this.determineChannelType(channel);
            if (!isTextChannel && !this.markVoiceChannels) return;
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
            console.error(`File ${filename} is not cached. Initiating file download again...`);
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
                if (channelName) {;
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
        const ChannelStore = BdApi.findModuleByProps("getChannel");
        const channel = ChannelStore.getChannel(channelId);
        if (!channel) {
            console.error(`Cannot find channel for ID: ${channelId}`);
        }
        return channel ? channel.name : null;
    }

    showNotification(channelName) {
        if (!("Notification" in window)) {
            console.error("This browser does not support system notifications.");
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
            console.error("This browser does not support system notifications.");
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
        const notification = new Notification("Voice channel update", {
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
        const notification = new Notification("new message", {
            body: `You have a new message on the channel ${channelName}.`,
            silent: true
        });
        notification.onclick = () => {
            window.focus();
            const channel = BdApi.findModuleByProps("getChannel").getChannel(this.activeChannelId);
            const serverId = channel.guild_id;
            const serverIcon = document.querySelector(`div[data-list-item-id="guildsnav___${serverId}"]`);
            if (serverIcon) {
                serverIcon.click();
                setTimeout(() => {
                    const channelLink = document.querySelector(`a[data-list-item-id="channels___${this.activeChannelId}"]`);
                    if (channelLink) {
                        channelLink.click();
                    }
                }, 200);
            }
        };
    }

    isCurrentServerWhitelisted() {
        const serverName = this.getCurrentServerName();
        return this.whitelistedServers.includes(serverName);
    }

    getCurrentServerName() {
        const serverNameElement = document.querySelector('.lineClamp1__0ec05.name_c08dbc');
        return serverNameElement ? serverNameElement.textContent : null;
    }

    addToWhitelist(serverName) {
        serverName = serverName.trim();
        if (!this.whitelistedServers.includes(serverName)) {
            this.whitelistedServers.push(serverName);
            BdApi.saveData('StarPlugin', 'whitelistedServers', this.whitelistedServers);
        }
    }

    removeFromWhitelist(serverName) {
        serverName = serverName.trim();
        const index = this.whitelistedServers.indexOf(serverName);
        if (index !== -1) {
            this.whitelistedServers.splice(index, 1);
            BdApi.saveData('StarPlugin', 'whitelistedServers', this.whitelistedServers);
        }
    }

    addContextMenuOption() {
        window.addEventListener("contextmenu", (event) => {
            const target = event.target.closest('[role="treeitem"]');
            if (target && target.getAttribute('data-list-item-id').includes('guildsnav___')) {
                const observer = new MutationObserver((mutations, obs) => {
                    for (let mutation of mutations) {
                        for (let node of mutation.addedNodes) {
                            if (node instanceof HTMLElement && node.matches('.layerContainer_d5a653 .theme-dark.layer_ec16dd')) {
                                this.addWhitelistButtonToContextMenu(target.getAttribute('aria-label'));
                                obs.disconnect();
                                return;
                            }
                        }
                    }
                });
                observer.observe(document, {
                    childList: true,
                    subtree: true
                });
            }
        }, true);
    }

    addWhitelistButtonToContextMenu(serverName) {
        serverName = serverName.trim();
        const now = Date.now();
        if (now - this.lastContextMenuUpdate < 500) return; 
        this.lastContextMenuUpdate = now;
        const contextMenu = document.querySelector('div[role="menu"]');
        if (!contextMenu) {
            return;
        }
        const existingMenuItem = contextMenu.querySelector('.starplugin-whitelist-button');
        if (existingMenuItem) {
            existingMenuItem.remove();
        }
        const menuItem = document.createElement('div');
        menuItem.classList.add('item__183e8', 'labelContainer_bc2861', 'colorDefault__0b482', 'starplugin-whitelist-button');
        menuItem.role = "menuitem";
        menuItem.tabIndex = -1;
        menuItem.setAttribute('data-menu-item', 'true');
        if (this.whitelistedServers.includes(serverName)) {
            menuItem.innerHTML = '<div class="label-3CEiKJ">Whitelist Remove</div>';
            menuItem.addEventListener('click', () => {
                this.removeFromWhitelist(serverName);
                this.addWhitelistButtonToContextMenu(serverName);
            });
        } else {
            menuItem.innerHTML = '<div class="label-3CEiKJ">Whitelist Add</div>';
            menuItem.addEventListener('click', () => {
                this.addToWhitelist(serverName);
                this.addWhitelistButtonToContextMenu(serverName);
            });
        }
        contextMenu.insertBefore(menuItem, contextMenu.firstChild);
    }
	
    getSettingsPanel() {
        const panel = document.createElement("div");
        panel.style.padding = "10px";
        const markVoiceChannelsCheckbox = document.createElement("input");
        markVoiceChannelsCheckbox.type = "checkbox";
        markVoiceChannelsCheckbox.checked = this.markVoiceChannels;
        markVoiceChannelsCheckbox.disabled = true;
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
module.exports = StarPlugin;
