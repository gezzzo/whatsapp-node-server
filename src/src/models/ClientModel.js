const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Constants
const MEDIA_DIR = path.join(__dirname, '..', '..', 'media');
if (!fs.existsSync(MEDIA_DIR)) {
    fs.mkdirSync(MEDIA_DIR);
}

class WhatsAppClient {
    constructor(clientId, callback, locally, message_callback_url, loadMessages) {
        this.attemptToReloadLocally = locally;
        this.clientId = clientId;
        this.callback = callback;
        this.chatObjs = [];
        this.deleted = false;
        this.loadImage = false;
        this.status = 'pending';
        this.messageCallbackUrl = message_callback_url;
        this.loadMessages = loadMessages;
        this.readyForAction = false;
        this.processedMessages = new Set();
        this.reconnectionAttempts = 0;
        this.maxReconnectionAttempts = 5;

        const sessionFile = path.join(MEDIA_DIR, `${this.clientId}-session.json`);


        if (fs.existsSync(sessionFile)) {
            const session = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
            this.client = new Client({
                authStrategy: new LocalAuth({
                    clientId: clientId,
                    session: session,
                }),
                puppeteer: {
                    headless: true,
                    args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-extensions',
                        '--disable-gpu',
                    ],
                },
                restartOnAuthFail: true,
            });
        } else {
            this.client = new Client({
                authStrategy: new LocalAuth({
                    clientId: clientId,
                }),
                puppeteer: {
                    headless: true,
                    args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-extensions',
                        '--disable-gpu',
                    ],
                },
                restartOnAuthFail: true,
            });
        }

        this.initialize();
        this.registerListeners();
    }

    initialize() {
        this.client
            .initialize()
            .then(() => {
                console.log(`Client ${this.clientId} initialized.`);
                this.reconnectionAttempts = 0;
                if (this.status != 'need_delete') {
                    this.status = 'initialized';
                    this.sendWebhook(`${this.clientId} has been initialized successfully.`, null);
                }
            })
            .catch((err) => {
                console.error(`Failed to initialize client ${this.clientId}:`, err);
                this.attemptReconnection();
            });
    }

    attemptReconnection() {
        if (this.reconnectionAttempts >= this.maxReconnectionAttempts) {
            console.error(`Max reconnection attempts reached for client ${this.clientId}. Giving up.`);
            this.status = 'reconnection_failed';
            this.sendWebhook(`${this.clientId} failed to reconnect after multiple attempts.`, null);
            return;
        }

        this.reconnectionAttempts++;
        console.log(`Reconnection attempt ${this.reconnectionAttempts} for client ${this.clientId}.`);

        const delay = Math.pow(2, this.reconnectionAttempts) * 1000;

        setTimeout(() => {
            this.initialize();
        }, delay);
    }


    registerListeners() {
        const qrListener = (qr) => {

            if (!this.attemptToReloadLocally) {
                console.log(`Scan this QR code for ${this.clientId}: ${qr}`);
                this.status = 'need_register';
                this.sendWebhook(`${this.clientId} need register`, qr);
            } else {
                this.status = 'need_delete';
                this.sendWebhook(`${this.clientId} has a problem and need delete`, null);
            }
            this.readyForAction = true;

        };
        this.client.on('qr', qrListener);

        this.client.on('ready', () => {
            console.log(`${this.clientId} is ready!`);
            this.status = 'ready';
            this.readyForAction = true;
            this.sendWebhook(`${this.clientId} is ready!`, null);
            this.client.removeListener('qr', qrListener);
            fs.writeFileSync(sessionFile, JSON.stringify(this.client.pupPage.session), 'utf8');
        });

        this.client.on('disconnected', (reason) => {
            console.error(`Client ${this.clientId} disconnected. Reason: ${reason}`);
            this.status = 'disconnected';

            this.sendWebhook(`${this.clientId} disconnected! Reason: ${reason}`, null);

            // this.attemptReconnection();
        });



        //     this.client.on('authenticated', () => {
        //     console.log(`QR Code scanned for ${this.clientId}. User is authenticated.`);
        //     this.status = 'authenticated';
        //     this.sendWebhook(`${this.clientId} has been authenticated.`, null);
        // });



        this.client.on('auth_failure', (err) => {
            this.status = 'auth_failure';
            console.error(`Auth failure for ${this.clientId}:`, err);
            this.sendWebhook(`${this.clientId} encountered an auth failure: ${err}`, null);
            // this.attemptReconnection();
        });

        this.client.on('message_create', async (message) => {
            if (this.messageCallbackUrl != null && this.loadMessages) {
                this.handelMessage(message);
            }
        });
    }





    async handelMessage(message) {
        console.log(`New message for ${this.clientId}:`, message.body);

        const isFromMe = message.fromMe;
        const isReply = message.hasQuotedMsg;
        const hasMedia = message.hasMedia;

        const timestamp = message.timestamp;
        const date = new Date(timestamp * 1000);
        console.log(`Message timestamp (UTC): ${date.toUTCString()}`);
        console.log(`Message timestamp (Local): ${date.toLocaleString()}`);

        console.log(`Message Details:`);
        console.log(`- From Me: ${isFromMe}`);
        console.log(`- Is Reply: ${isReply}`);
        console.log(`- Has Media: ${hasMedia}`);


        let mediaUrl = null;

        if (message.hasMedia && this.loadImage) {
            try {
                const media = await message.downloadMedia();
                if (media) {
                    const fileExtension = media.mimetype.split('/')[1];
                    const filename = `${message.id._serialized}.${fileExtension}`;
                    const filePath = path.join(MEDIA_DIR, filename);

                    fs.writeFileSync(filePath, Buffer.from(media.data, 'base64'));
                    mediaUrl = `/media/${filename}`;



                    const data = {
                        clientId: this.clientId,
                        body: message.body,
                        mediaUrl: mediaUrl
                    };

                    try {
                        const response = await axios.post(this.messageCallbackUrl, data);


                    } catch (error) {
                        if (error.response) {
                            console.error('Error response data:', error.response.data);
                            console.error('Error status code:', error.response.status);
                        } else if (error.request) {
                            console.error('No response received:', error.request);
                        } else {
                            console.error('Error setting up the request:', error.message);
                        }
                    }



                } else {
                    console.log('No media found in the message.');
                }
            } catch (error) {
                console.error('Error downloading media:', error);
            }

        } else {

            const timestamp = message.timestamp;
            const date = new Date(timestamp * 1000);
            console.log(`Message timestamp (UTC): ${date.toUTCString()}`);
            console.log(`Message timestamp (Local): ${date.toLocaleString()}`);

            const isPrivateMessage = message.from.endsWith('@c.us') || message.to.endsWith('@c.us');
            const isGroupMessage = message.from.endsWith('@g.us') || message.to.endsWith('@g.us');
            const isStatus = message.isStatus || false;

            const fromNumber = message.from.split('@')[0];
            const toNumber = message.to.split('@')[0];


            const data = {
                
                messageId: message.id._serialized,
                clientId: this.clientId,
                body: message.body,
                mediaUrl: mediaUrl,
                fromMe: isFromMe,
                isReply: isReply,
                hasMedia: hasMedia,
                from: fromNumber,
                to: toNumber,
                timestamp: message.timestamp,
                timestampUTC: date.toUTCString(),
                timestampLocal: date.toLocaleString(),
                isPrivateMessage: isPrivateMessage,
                isGroupMessage: isGroupMessage,
                isStatus: isStatus
            };
            try {
                const response = await axios.post(this.messageCallbackUrl, data);


            } catch (error) {
                if (error.response) {
                    console.error('Error response data:', error.response.data);
                    console.error('Error status code:', error.response.status);
                } else if (error.request) {
                    console.error('No response received:', error.request);
                } else {
                    console.error('Error setting up the request:', error.message);
                }
            }

        }




    }


    async sendWebhook(message = 'No message provided', qr = 'No QR code provided') {


        let message_status = '';
        if (this.loadImage && this.loadMessages) {
            message_status = 'active_with_media';
        } else if (this.loadMessages) {
            message_status = 'active';
        } else {
            message_status = 'inactive';

        }
        const data = {
            message_status: message_status,
            clientId: this.clientId,
            status: this.status,
            message: message,
            qr: qr
        };

        try {
            const response = await axios.post(this.callback, data);
            console.log('webhook sending success');


        } catch (error) {
            if (error.response) {
                // Server responded with a status code outside the 2xx range
                console.error('Error response data:', error.response.data);
                console.error('Error status code:', error.response.status);
            } else if (error.request) {
                // Request was made but no response received
                console.error('No response received:', error.request);
            } else {
                // Something went wrong in setting up the request
                console.error('Error setting up the request:', error.message);
            }
        }
    }



    getStatus() {
        return this.status;
    }


    logout() {
        this.client.removeAllListeners();
        this.client.destroy().then(() => {
            // destroySession(this.clientId);
            return 1;
        }).catch(err => {
            console.error(`Failed to log out client ${this.clientId}:`, err);
            return 0;
        });
    }

    destroy() {
        return this.logout();
    }



    async getClientChats() {
        try {
            const fetchedChats = await this.client.getChats();
            this.chatObjs = fetchedChats;
            
            
            
            const chatList = await Promise.all(
                fetchedChats.map(async chat => {
                    let lastMessageData = null;

                    if (chat.lastMessage) {
                        const lastMessage = chat.lastMessage;
                        const date = new Date(lastMessage.timestamp * 1000); 
            
                        lastMessageData = {
                            messageId: lastMessage.id._serialized,
                            body: lastMessage.body || '',
                            fromMe: lastMessage.fromMe,
                            hasMedia: lastMessage.hasMedia,
                            from: lastMessage.from,
                            to: lastMessage.to,
                            timestamp: lastMessage.timestamp,
                            timestampUTC: date.toUTCString(),
                            timestampLocal: date.toLocaleString(),
                        };
                    }
            
                    return {
                        id: chat.id._serialized,
                        name: chat.name || 'Unnamed Chat',
                        isGroup: chat.isGroup,
                        lastMessageData: lastMessageData || null,
                    };
                })
            );
            return chatList;
        } catch (err) {
            console.error('Error fetching chats:', err);
            return 'Failed to fetch chats';
        }
    }




    async getMessageById(messageId, chatId) {
        try {
            if (this.chatObjs.length < 1) {
                const fetchedChats = await this.client.getChats();
                this.chatObjs = fetchedChats;
            }

            const chat = this.chatObjs.find(c => c.id._serialized === chatId);
            if (!chat) {
                return { status: 400, message: 'Chat not found!', data: null };
            }

            const message = await chat.fetchMessages({ id: messageId, limit: 1 }).then(messages => messages[0]);
            if (!message) {
                return { status: 400, message: 'Message not found!', data: null };
            }

            let mediaUrl = null;

            if (message.hasMedia) {
                try {
                    const media = await message.downloadMedia();
                    if (media) {
                        const fileExtension = media.mimetype.split('/')[1];
                        const filename = `${message.id._serialized}.${fileExtension}`;
                        const filePath = path.join(MEDIA_DIR, filename);
                        fs.writeFileSync(filePath, Buffer.from(media.data, 'base64'));
                        mediaUrl = `/media/${filename}`;
                    }
                } catch (mediaError) {
                    console.error('Error downloading media:', mediaError);
                    return { status: '400', message: 'Failed to download media', data: null };
                }
            }

            return {
                status: 200,
                message: 'loaded successsfully',
                data: {
                    id: message.id._serialized,
                    body: message.body,
                    from: message.from,
                    timestamp: message.timestamp,
                    hasMedia: message.hasMedia,
                    mediaUrl: mediaUrl,
                },
            };
        } catch (err) {
            console.error('Error fetching message by ID:', err);
            return { status: 500, message: err.message || 'Failed to fetch message' };
        }
    }


    async getMessagesWithMedia(limit, chatId) {
        try {


            if (this.chatObjs.length < 1) {
                const fetchedChats = await this.client.getChats();
                this.chatObjs = fetchedChats;
            }
            const chat = this.chatObjs.find(c => c.id._serialized == chatId);

            if (!chat) {
                return 'Chat not found!';
            }
            const messages = await chat.fetchMessages({ limit: limit });
            const messageList = await Promise.all(messages.map(async (message) => {
                let mediaUrl = null;
                if (message.hasMedia) {
                    const media = await message.downloadMedia();
                    if (media) {

                        const fileExtension = media.mimetype.split('/')[1];
                        const filename = `${message.id._serialized}.${fileExtension}`;
                        const filePath = path.join(MEDIA_DIR, filename);
                        fs.writeFileSync(filePath, Buffer.from(media.data, 'base64'));


                        mediaUrl = `/media/${filename}`;
                    }
                }


                const isFromMe = message.fromMe;
                const isReply = message.hasQuotedMsg;
                const hasMedia = message.hasMedia;
        

                const timestamp = message.timestamp;
                const date = new Date(timestamp * 1000);
                console.log(`Message timestamp (UTC): ${date.toUTCString()}`);
                console.log(`Message timestamp (Local): ${date.toLocaleString()}`);
    
                const isPrivateMessage = message.from.endsWith('@c.us') || message.to.endsWith('@c.us');
                const isGroupMessage = message.from.endsWith('@g.us') || message.to.endsWith('@g.us');
                const isStatus = message.isStatus || false;
    
                const fromNumber = message.from.split('@')[0];
                const toNumber = message.to.split('@')[0];
    
    
                const data = {
                    
                    messageId: message.id._serialized,
                    clientId: this.clientId,
                    body: message.body,
                    mediaUrl: mediaUrl,
                    fromMe: isFromMe,
                    isReply: isReply,
                    hasMedia: hasMedia,
                    from: fromNumber,
                    to: toNumber,
                    timestamp: message.timestamp,
                    timestampUTC: date.toUTCString(),
                    timestampLocal: date.toLocaleString(),
                    isPrivateMessage: isPrivateMessage,
                    isGroupMessage: isGroupMessage,
                    isStatus: isStatus
                };

                return data;
            }));

            return messageList;
        } catch (err) {
            console.error('Error fetching chats or messages:', err);
            return 'Failed to fetch chats or messages';
        }
    }



    async getMessages(limit, chatId) {
        try {
            if (this.chatObjs.length < 1) {
                const fetchedChats = await this.client.getChats();
                this.chatObjs = fetchedChats;
            }
            const chat = this.chatObjs.find(c => c.id._serialized == chatId);

            if (!chat) {
                return 'Chat not found!';
            }
            const messages = await chat.fetchMessages({ limit: limit });
            const messageList = await Promise.all(messages.map(async (message) => {
                return {
                    id: message.id._serialized,
                    body: message.body,
                    from: message.from,
                    timestamp: message.timestamp,
                    hasMedia: message.hasMedia,
                    mediaUrl: null,
                };
            }));

            return messageList;
        } catch (err) {
            console.error('Error fetching chats or messages:', err);
            return 'Failed to fetch chats or messages';
        }
    }






}

module.exports = WhatsAppClient;