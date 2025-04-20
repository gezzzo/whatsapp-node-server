const express = require('express');
const { sendMessage ,sendListMessages ,getChatMessages ,getChats} = require('../controllers/MessageController');
const router = express.Router();

router.post('/send-message', sendMessage);

router.post('/send-list-messages', sendListMessages);
router.delete('/get-chat-messages/:chatId', getChatMessages);
router.get('/get-chats/:clientId' , getChats);
module.exports = router;
