import { 
    sendNotification, 
    isPermissionGranted, 
    requestPermission,
    registerActionTypes,
    onAction
} from '@tauri-apps/plugin-notification';

class NotificationManager {
    constructor() {
        this.permissionGranted = false;
        this.init();
    }

    // Initialize notification permissions
    async init() {
        this.permissionGranted = await isPermissionGranted();
        
        if (!this.permissionGranted) {
            const permission = await requestPermission();
            this.permissionGranted = permission === 'granted';
        }

        if (this.permissionGranted) {
            console.log('Notifications enabled');
            this.setupActionTypes();
        } else {
            console.log('Notification permission denied');
        }
    }

    // Register interactive notification actions
    async setupActionTypes() {
        try {
            await registerActionTypes([
                {
                    id: 'reply',
                    title: 'Reply',
                    requiresAuthentication: false
                },
                {
                    id: 'view',
                    title: 'View Message',
                    requiresAuthentication: false
                }
            ]);

            await onAction((action) => {
                console.log('Notification action:', action);
                this.handleNotificationAction(action);
            });
        } catch (error) {
            console.log('Action types not supported on this platform');
        }
    }

    async sendBasicNotification(title, body, options = {}) {
        if (!this.permissionGranted) {
            console.log('Notifications not permitted');
            return false;
        }

        try {
            await sendNotification({
                title: title,
                body: body,
                icon: options.icon || 'icons/32x32.png',
                sound: options.sound || null,
                ...options
            });
            return true;
        } catch (error) {
            console.error('Failed to send notification:', error);
            return false;
        }
    }

    async notifyNewMessage(sender, message, options = {}) {
        const title = `New message from ${sender}`;
        const body = message.length > 100 ? 
            message.substring(0, 100) + '...' : 
            message;

        return await this.sendBasicNotification(title, body, {
            icon: 'icons/32x32.png',
            tag: `msg-${sender}`,
            ...options
        });
    }

    async notifyUserJoined(username) {
        return await this.sendBasicNotification(
            'User Joined', 
            `${username} has joined the conversation`,
            { icon: 'icons/32x32.png' }
        );
    }

    async notifyUserLeft(username) {
        return await this.sendBasicNotification(
            'User Left', 
            `${username} has left the conversation`,
            { icon: 'icons/32x32.png' }
        );
    }

    async notifyFileReceived(sender, filename) {
        return await this.sendBasicNotification(
            'File Received', 
            `${sender} sent you: ${filename}`,
            { 
                icon: 'icons/32x32.png',
                actions: [
                    { action: 'view', title: 'View File' },
                    { action: 'save', title: 'Save As...' }
                ]
            }
        );
    }

    handleNotificationAction(action) {
        switch (action.actionTypeId) {
            case 'reply':
                this.openReplyDialog(action.notification);
                break;
            case 'view':
                this.focusMessage(action.notification);
                break;
            default:
                console.log('Unknown action:', action);
        }
    }

    openReplyDialog(notification) {
        console.log('Opening reply dialog for:', notification);
        window.__TAURI__.window.getCurrent().setFocus();
    }

    focusMessage(notification) {
        console.log('Focusing message:', notification);
        window.__TAURI__.window.getCurrent().setFocus();
    }
}

export const notificationManager = new NotificationManager();