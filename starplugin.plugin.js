//META{"name":"StarPlugin","displayName":"StarPlugin","source":"add","version":"0.8","updateUrl":"fsd","author":"dudolf","description":"dodaje możliwość dodawania kanałów do ulubionych"}*//

const ZeresPluginLibrary = BdApi.Plugins.get("ZeresPluginLibrary");
if (!ZeresPluginLibrary) {
    BdApi.alert("Brakująca biblioteka", `Biblioteka ZeresPluginLibrary jest wymagana do działania StarPlugin. Kliknij OK, aby ją pobrać.`);
    require("request").get("https://rauenzi.github.io/BDPluginLibrary/release/0PluginLibrary.plugin.js", (error, response, body) => {
        if (error) {
            console.error("Nie można pobrać biblioteki ZeresPluginLibrary:", error);
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
const GOLD_STAR_URL = `https://github.com/dabrodawid/starplugin/blob/main/star2.png?raw=true`;
const GREY_STAR_URL = `https://github.com/dabrodawid/starplugin/blob/main/star1.png?raw=true`;
const AUDIO_URL = 'https://github.com/dabrodawid/starplugin/raw/main/audio.mp3';

class StarPlugin {
    constructor() {
        this.audio = new Audio(AUDIO_URL);
        this.interval = null;
        this.activeChannels = BdApi.loadData('StarPlugin', 'starredChannels') || {};
        this.activeChannelId = null;
        this.whitelistedServers = BdApi.loadData('StarPlugin', 'whitelistedServers') || [];
        this.lastContextMenuUpdate = 0;
    }

    start() {
        this.addStarToChannels();
        this.addContextMenuOption();
        this.interval = setInterval(() => {
            this.addStarToChannels();
            this.checkForUnreadMessages();
        }, 1000);
    }

    stop() {
        clearInterval(this.interval);
        const stars = document.querySelectorAll('.star-image');
        stars.forEach(star => star.remove());
        window.removeEventListener("contextmenu", this.contextMenuHandler);
    }

    addStarToChannels() {
        if (!this.isCurrentServerWhitelisted()) return;
        const channels = document.querySelectorAll('a[role="link"][aria-label*="(kanał tekstowy)"]');
        channels.forEach(channel => {
            const iconContainer = channel.querySelector('.iconContainer-21RCa3');
            const channelId = channel.getAttribute('data-list-item-id').replace('channels___', '');
            if (iconContainer && !iconContainer.querySelector('img.star-image')) {
                const starImage = document.createElement('img');
                starImage.className = 'star-image';
                if (this.activeChannels[channelId]) {
                    starImage.src = GOLD_STAR_URL;
                } else {
                    starImage.src = GREY_STAR_URL;
                }
                starImage.style.width = '24px';
                starImage.style.height = '24px';
				starImage.style.boxSizing = 'border-box';
                starImage.addEventListener('click', () => {
                    if (starImage.src.includes('star1')) {
                        starImage.src = GOLD_STAR_URL;
                        this.activeChannels[channelId] = { read: true };
                    } else {
                        starImage.src = GREY_STAR_URL;
                        delete this.activeChannels[channelId];
                    }
                    BdApi.saveData('StarPlugin', 'starredChannels', this.activeChannels);
                });
                iconContainer.innerHTML = '';
                iconContainer.appendChild(starImage);
            }
        });
    }

    checkForUnreadMessages() {
        const UnreadStore = BdApi.findModuleByProps("getUnreadCount");
        Object.keys(this.activeChannels).forEach(channelId => {
            const unreadCount = UnreadStore.getUnreadCount(channelId);
            if (unreadCount > 0 && this.activeChannels[channelId].read) {
                this.audio.play();
                this.activeChannelId = channelId;
                const channelName = this.getChannelNameById(channelId);
                this.showNotification(channelName);
                this.activeChannels[channelId].read = false;
                BdApi.saveData('StarPlugin', 'starredChannels', this.activeChannels);
            } else if (unreadCount === 0) {
                this.activeChannels[channelId].read = true;
                BdApi.saveData('StarPlugin', 'starredChannels', this.activeChannels);
            }
        });
    }
	
    getChannelNameById(channelId) {
        const channel = BdApi.findModuleByProps("getChannel").getChannel(channelId);
        return channel ? channel.name : null;
    }

    showNotification(channelName) {
        if (!("Notification" in window)) {
            console.error("Ta przeglądarka nie obsługuje powiadomień systemowych.");
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

    createNotification(channelName) {
        const notification = new Notification("Nowa wiadomość", {
            body: `Masz nową wiadomość na kanale ${channelName}.`,
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
        const serverNameElement = document.querySelector('.lineClamp1-1voJi7.text-md-semibold-2VMhBr.name-3Uvkvr');
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
                setTimeout(() => {
                    this.addWhitelistButtonToContextMenu(target.getAttribute('aria-label'));
                }, 5);
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
        menuItem.classList.add('item-5ApiZt', 'labelContainer-35-WEd', 'colorDefault-2_rLdz', 'starplugin-whitelist-button');
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
}

module.exports = StarPlugin;