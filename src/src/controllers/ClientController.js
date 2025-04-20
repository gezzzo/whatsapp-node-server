const WhatsAppClient = require('../models/ClientModel');
const fs = require('fs');
const clients = new Map();
const path = require('path');
const { MessageMedia } = require('whatsapp-web.js');
const { saveSessionData, loadSessionData, destroySession } = require('../utils/fileUtils');


const initializeStoredSessions = () => {
    const SESSIONS_DIR = path.join(__dirname, '..', 'sessions');

    if (!fs.existsSync(SESSIONS_DIR)) {
        console.warn('No sessions directory found. Skipping session initialization.');
        return;
    }

    const sessionFiles = fs.readdirSync(SESSIONS_DIR);
    sessionFiles.forEach((file) => {
        const clientId = path.basename(file, '.json');
        const sessionData = loadSessionData(clientId);
        if (sessionData) {
     

            const client = new WhatsAppClient(clientId, sessionData.callbackUrl, true, sessionData.messageCallbackUrl, sessionData.loadMessages);
            clients.set(clientId, client);
            console.log(`Reinitialized session for client ID: ${clientId}`);
        }
    });
};

initializeStoredSessions();

const createSession = (req, res) => {
    const { clientId, callbackUrl, messageCallbackUrl } = req.body;

    if (!clientId || !callbackUrl) {
        return res.status(400).send({
            success: false,
            message: 'Both clientId and callbackUrl are required.',
        });
    }

    if (clients.has(clientId) && !clients.get(clientId).deleted) {
        return res.status(400).send({
            success: false,
            message: `Client with ID ${clientId} already exists.`,
        });
    }
    // console.log("message callback" ,messageCallbackUrl);

    if (!messageCallbackUrl) {
        const client = new WhatsAppClient(clientId, callbackUrl, false, null, false);
        clients.set(clientId, client);
        saveSessionData(clientId, { callbackUrl, deleted: false, loadMessages: false, messageCallbackUrl: null });

    } else {
        const client = new WhatsAppClient(clientId, callbackUrl, false, messageCallbackUrl, true);
        clients.set(clientId, client);
        saveSessionData(clientId, { callbackUrl, deleted: false, loadMessages: true, messageCallbackUrl });
    }



    return res.status(200).send({
        success: true,
        message: `Session for client ID ${clientId} created successfully!`,
    });
};


const getStatus = (req, res) => {
    const { clientId } = req.params;
    let client = null;

    clients.forEach((client_inner, id) => {
        if (clientId == id) {
            client = clients.get(id);
        }
    });

    if (!client) {
        return res.status(404).send(
            {
                success: false,
                message: `Client with ID ${clientId} not found`,
                status: 404,
                data: null,
            }


        );
    }

    res.status(200).send(
        {
            success: true,
            status: 200,
            data: { status: client.status },
        }

    );
};

const deleteSession = async (req, res) => {
    const { clientId } = req.params;

    if (clients.has(clientId)) {
        const client = clients.get(clientId);

        if (!client.readyForAction) {
            return res.status(400).send({
                success: false,
                message: `Client is not ready For actions yet ${clientId}.`,
            });
        }

        if (client.status !== 'disconnected' && client.status !== 'auth_failure') {
            try {
                await client.destroy();
                console.log(`Client ${clientId} destroyed.`);
                clients.delete(clientId);
            } catch (error) {
                console.error(`Failed to destroy client instance for ${clientId}:`, error);
                return res.status(500).send({
                    success: false,
                    message: `Failed to destroy client instance for ${clientId}.`,
                });
            }
        }

      
    }

    try {
        await destroySession(clientId);
        return res.status(200).send({
            success: true,
            message: `Session for client ID ${clientId} deleted successfully.`,
        });
    } catch (error) {
        console.error(`Failed to delete session data for client ${clientId}:`, error);
        return res.status(500).send({
            success: false,
            message: `Failed to delete session data for client ID ${clientId}.`,
        });
    }
};
const getChats = async (req, res) => {
    const { clientId } = req.params;
    let client = null;

    clients.forEach((client_inner, id) => {
        if (clientId == id) {
            client = clients.get(id);
        }
    });

    if (!clientId) {
        return res.status(400).send(
            {
                success: false,
                message: 'clientId is required',
                status: 400,
                data: null,
            }
        );
    }

    if (!client) {
        return res.status(404).send(
            {
                success: false,
                message: `Client with ID ${clientId} not found`,
                status: 404,
                data: null,
            }
        );
    }

    if (client.status === 'ready') {
        try {
            const chats = await client.getClientChats();
            // console.log(chats);
            return res.status(200).send(

                {
                    success: true,
                    status: 200,
                    data: chats,
                }
            );
        } catch (err) {
            console.error('Error fetching chats:', err);
            return res.status(500).send(
                {
                    success: false,
                    message: 'Error fetching chats',
                    status: 500,
                }
            );
        }
    } else {
        return res.status(400).send(

            {
                success: false,
                message: 'Client status is not ready yet',
                status: 400,
            });
    }
};




const toggleMessageLoader = async (req, res) => {
    const { clientId } = req.params;
    let client = null;


    clients.forEach((client_inner, id) => {
        if (clientId == id) {
            client = clients.get(id);
        }
    });

    if (!clientId) {
        return res.status(400).send({
            success: false,
            message: 'clientId is required',
            status: 400,
            data: null,
        });
    }



    if (!client) {
        return res.status(404).send({
            success: false,
            message: `Client with ID ${clientId} not found`,
            status: 404,
            data: null,
        });
    }

    try {
        client.loadMessages = !client.loadMessages;
        if (client.messageCallbackUrl != null || !client.loadMessages) {
            const nameOfFile = path.basename(clientId, '.json');
            const sessionData = loadSessionData(nameOfFile);
            if (sessionData) {
                saveSessionData(nameOfFile, { callbackUrl: client.callback, deleted: false, loadMessages: client.loadMessages, messageCallbackUrl: client.messageCallbackUrl });
            }

            let message_status ='';
            if (client.loadImage && client.loadMessages){
                message_status = 'active_with_media';
            }else if (client.loadMessages){
                message_status = 'active';
            }else{
                message_status = 'inactive';
    
            }
    

            return res.status(200).send(
                {
                    success: true,
                    message: `updated successfully from ${!client.loadMessages} to be ${client.loadMessages}`,
                    status: 200,
                    data: {
                        message_status:message_status
                    },
                }
            );


        } else {
            res.status(400).send(
                {
                    success: false,
                    message: 'need to give me a callback for messages first then activate',
                    status: 400,
                    data: null,
                });
        }


    } catch (error) {
        console.error('Error happend:', error);
        res.status(500).send(
            {
                success: false,
                message: 'Error happend',
                status: 500,
                data: null,
            });
    }
};


const updateMessageCallbackUrl = async (req, res) => {
    const { clientId ,callbackUrl } = req.body;
    let client = null;


    clients.forEach((client_inner, id) => {
        if (clientId == id) {
            client = clients.get(id);
        }
    });

    if (!clientId) {
        return res.status(400).send({
            success: false,
            message: 'clientId is required',
            status: 400,
            data: null,
        });
    }
    if (!callbackUrl) {
        return res.status(400).send({
            success: false,
            message: 'callbackUrl is required',
            status: 400,
            data: null,
        });
    }


    if (!client) {
        return res.status(404).send({
            success: false,
            message: `Client with ID ${clientId} not found`,
            status: 404,
            data: null,
        });
    }

    try {
        client.messageCallbackUrl = callbackUrl;
            const nameOfFile = path.basename(clientId, '.json');
            const sessionData = loadSessionData(nameOfFile);
            if (sessionData) {
                saveSessionData(nameOfFile, { callbackUrl: client.callback, deleted: false, messageCallbackUrl: callbackUrl,loadMessages: client.loadMessages });
            }

            let message_status ='';
            if (client.loadImage && client.loadMessages){
                message_status = 'active_with_media';
            }else if (client.loadMessages){
                message_status = 'active';
            }else{
                message_status = 'inactive';
    
            }
    

            return res.status(200).send(
                {
                    success: true,
                    message: `callbackUrl updated successfully`,
                    status: 200,
                    data: {
                        message_status: message_status
                    },
                }
            );
       


    } catch (error) {
        console.error('Error happend:', error);
        res.status(500).send(
            {
                success: false,
                message: 'Error happend',
                status: 500,
                data: null,
            });
    }
};


const toggleImageLoader = async (req, res) => {
    const { clientId } = req.params;
    let client = null;


    clients.forEach((client_inner, id) => {
        if (clientId == id) {
            client = clients.get(id);
        }
    });

    if (!clientId) {
        return res.status(400).send({
            success: false,
            message: 'clientId is required',
            status: 400,
            data: null,
        });
    }

    if (!client) {
        return res.status(404).send({
            success: false,
            message: `Client with ID ${clientId} not found`,
            status: 404,
            data: null,
        });
    }


    try {
        client.loadImage = !client.loadImage;

        let message_status ='';
        if (client.loadImage && client.loadMessages){
            message_status = 'active_with_media';
        }else if (client.loadMessages){
            message_status = 'active';
        }else{
            message_status = 'inactive';

        }


        return res.status(200).send(
            {
                success: true,
                message: `updated successfully from ${!client.loadImage} to be ${client.loadImage}`,
                status: 200,
                data: {
                    message_status :message_status
                },
            }
        );

    } catch (error) {
        console.error('Error happend:', error);
        res.status(500).send(
            {
                success: false,
                message: 'Error happend',
                status: 500,
                data: null,
            });
    }







};


const getChatMessages = async (req, res) => {
    const { clientId, chatID, limit } = req.params;
    let client = null;
    // return res.status(200).send({clientId ,chatID });


    clients.forEach((client_inner, id) => {
        if (clientId == id) {
            client = clients.get(id);
        }
    });

    if (!clientId) {
        return res.status(400).send({
            success: false,
            message: 'clientId is required',
            status: 400,
            data: null,
        });
    }

    if (!client) {
        return res.status(404).send({
            success: false,
            message: `Client with ID ${clientId} not found`,
            status: 404,
            data: null,
        });
    }


    if (client.status === 'ready') {
        try {
            const messages = await client.getMessages(limit, chatID);
            res.status(200).json(
                {
                    success: true,
                    status: 200,
                    data: messages,
                }
            );

        } catch (error) {
            console.error('Error fetching messages:', error);
            res.status(500).send(
                {
                    success: false,
                    message: 'Error fetching messages',
                    status: 500,
                    data: null,
                });
        }
    } else {
        return res.status(400).send({
            success: false,
            message: 'Client status is not ready yet',
            status: 400,
            data: null,
        });
    }

};



const getMessagesWithMedia = async (req, res) => {
    const { clientId, chatID, limit } = req.params;
    let client = null;


    clients.forEach((client_inner, id) => {
        if (clientId == id) {
            client = clients.get(id);
        }
    });

    if (!clientId) {
        return res.status(400).send({
            success: false,
            message: 'clientId is required',
            status: 400,
            data: null,
        });
    }

    if (!client) {
        return res.status(404).send({
            success: false,
            message: `Client with ID ${clientId} not found`,
            status: 404,
            data: null,
        });
    }



    if (client.status === 'ready') {
        try {
            const messages = await client.getMessagesWithMedia(limit, chatID);
            res.status(200).json(
                {
                    success: true,
                    status: 200,
                    data: messages,
                });


        } catch (error) {
            console.error('Error fetching messages:', error);
            res.status(500).send(
                {
                    success: false,
                    message: 'Error fetching messages',
                    status: 500,
                    data: null,
                });
        }
    } else {
        return res.status(400).send({
            success: false,
            message: 'Client status is not ready yet',
            status: 400,
            data: null,
        });
    }

};
const getMessageById = async (req, res) => {
    const { clientId, chatID, messageId } = req.params;
    let client = null;


    clients.forEach((client_inner, id) => {
        if (clientId == id) {
            client = clients.get(id);
        }
    });

    if (!clientId) {
        return res.status(400).send({
            success: false,
            message: 'clientId is required',
            status: 400,
            data: null,
        });
    }

    if (!client) {
        return res.status(404).send({
            success: false,
            message: `Client with ID ${clientId} not found`,
            status: 404,
            data: null,
        });
    }



    if (client.status === 'ready') {
        try {
            const response = await client.getMessageById(messageId, chatID);
            if (response.status == 200) {
                res.status(200).json(


                    {
                        success: response.success,
                        message: response.message,
                        status: response.status,
                        data: response.data
                    }
                );
            } else {
                res.status(response.status).json(

                    {
                        success: response.success,
                        message: response.message,
                        status: response.status,
                    }
                );
            }

        } catch (error) {
            console.error('Error fetching messages:', error);
            res.status(500).send(
                {
                    success: false,
                    message: 'clientId, phoneNumber, and message are required',
                    status: 400,
                }
            );
        }
    } else {
        return res.status(400).send({
            success: false,
            message: 'Client status is not ready yet',
            status: 400,
            data: null,
        });
    }

};


const sendMessage = async (req, res) => {
    const { clientId, phoneNumber, message , messageId } = req.body;
    const mediaFile = req.file;

    if (!clientId || !phoneNumber || (!message && !mediaFile)) {
        return res.status(400).send(
            {
                success: false,
                message: 'clientId, phoneNumber, and message are required',
                status: 400,
            }
        );
    }

    let client = null;


    clients.forEach((client_inner, id) => {
        if (clientId == id) {
            client = clients.get(id);
        }
    });

    if (!clientId) {
        return res.status(400).send({
            success: false,
            message: 'clientId is required',
            status: 400,
            data: null,
        });
    }

    if (!client) {
        return res.status(404).send({
            success: false,
            message: `Client with ID ${clientId} not found`,
            status: 404,
            data: null,
        });
    }


    if (client.status === 'ready') {
        try {
            let response;
//// not working //////////////////////////

            if(messageId){

//// not working //////////////////////////
                const savedMessage = await this.client.getMessageById(this.savedMessageId);
              

                if (mediaFile) {
                    const mediaPath = path.join(__dirname, '..', '..', mediaFile.path);
                    const media = MessageMedia.fromFilePath(mediaPath);
                    await savedMessage.reply(media, { caption: message });
    
                    console.log("Replied to saved message with media.");
                    fs.unlinkSync(mediaPath); 
                } else {
                    await savedMessage.reply(message);
                    console.log("Replied to saved message with text.");
                }



            }else{
                if (mediaFile) {

                    const mediaPath = path.join(__dirname, '..', '..', mediaFile.path);
                    const media = MessageMedia.fromFilePath(mediaPath);
                    response = await client.client.sendMessage(`${phoneNumber}@c.us`, media, { caption: message });
                    fs.unlinkSync(mediaPath);
                } else {
                    response = await client.client.sendMessage(`${phoneNumber}@c.us`, message);
                }
    
            }

          
            // console.log('Message sent:', response);
            res.status(200).send(
                {
                    success: true,
                    message: 'Message sent successfully!',
                    status: 200,
                }
            );
        } catch (err) {
            // console.error('Error sending message:', err);
            res.status(500).send(

                {
                    success: false,
                    message: 'Failed to send message',
                    status: 500,
                    data: null,
                }
            );
        }
    } else {
        return res.status(400).send({
            success: false,
            message: 'Client status is not ready yet',
            status: 400,
            data: null,
        });
    }
};

const getClientData = async (req, res) => {
    const { clientId } = req.params;

    const client = clients.get(clientId);

    if (!client) {
        return res.status(404).send({
            success: false,
            message: `Client with ID ${clientId} not found.`,
        });
    }

    console.log(`Fetched client data for ${clientId}:`, client);

    try {
        // Retrieve session data for the client
        const sessionData = await loadSessionData(clientId);
        console.log(`Session data for ${clientId}:`, sessionData);

        // Gather the client data
        const clientData = {
            id: clientId,
            status: client.status,
            isConnected: client.isConnected, // Assuming this is a property
            isRegistered: client.isRegisteredUser || false, // Check registration status
            session: sessionData || null, // Session data (can be null if not found)
            accountInfo: {
                name: client.accountName || 'Unknown',
                phoneNumber: client.phoneNumber || 'N/A',
                email: client.email || 'N/A',
            }, // Example of adding account-related info
        };

        return res.status(200).send({
            success: true,
            message: `Client data retrieved successfully.`,
            data: clientData,
        });
    } catch (error) {
        console.error(`Failed to retrieve client data for ${clientId}:`, error);
        return res.status(500).send({
            success: false,
            message: `An error occurred while retrieving client data.`,
        });
    }
};


const sendMessageToMultiple = async (req, res) => {
    const { clientId, phoneNumbers, message } = req.body;
    const mediaFile = req.file;

    if (!clientId || !phoneNumbers || phoneNumbers.length === 0 || (!message && !mediaFile)) {
        return res.status(400).send('clientId, phoneNumbers, and message are required');
    }

    let client = null;

    clients.forEach((client_inner, id) => {
        if (clientId == id) {
            client = clients.get(id);
        }
    });

    if (!clientId) {
        return res.status(400).send({
            success: false,
            message: 'clientId is required',
            status: 400,
            data: null,
        });
    }

    if (!client) {
        return res.status(404).send({
            success: false,
            message: `Client with ID ${clientId} not found`,
            status: 404,
            data: null,
        });
    }

    if (client.status !== 'ready') {
        return res.status(400).send(
            {
                success: false,
                message: 'Client status is not ready yet',
                status: 400,
                data: null,
            });
    }

    try {
        for (const phoneNumber of phoneNumbers) {
            try {
                let response;

                if (mediaFile) {
                    const mediaPath = path.join(__dirname, mediaFile.path);
                    const media = MessageMedia.fromFilePath(mediaPath);
                    response = await client.client.sendMessage(`${phoneNumber}@c.us`, media, { caption: message });
                    fs.unlinkSync(mediaPath);
                } else {
                    response = await client.client.sendMessage(`${phoneNumber}@c.us`, message);
                }

                // console.log(`Message sent to ${phoneNumber}:`, response);
            } catch (err) {
                console.error(`Error sending message to ${phoneNumber}:`, err);
            }

            await new Promise(resolve => setTimeout(resolve, 20000));
        }

        res.status(200).send(
            {
                success: true,
                message: 'Messages sent successfully!',
                status: 200,
                data: null,
            }
        );
    } catch (err) {
        // console.error('Error sending messages:', err);
        res.status(500).send(

            {
                success: false,
                message: 'Failed to send messages',
                status: 500,
                data: null,
            });
    }
};





module.exports = {
    createSession,
    getStatus,
    deleteSession,
    getChats,
    getChatMessages,
    getMessagesWithMedia,
    toggleImageLoader,
    getMessageById,
    sendMessage,
    sendMessageToMultiple,
    getClientData,
    toggleMessageLoader,
    updateMessageCallbackUrl
};


