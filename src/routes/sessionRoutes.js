const express = require('express');
const multer = require('multer');
const path = require('path');

const { createSession ,
    getStatus ,
    deleteSession ,
    getChats ,
    getChatMessages ,
    getMessagesWithMedia ,
    toggleImageLoader ,
    getMessageById,
    isRegisteredUser,
    getChatInfo,
    updateMessageCallbackUrl,
    sendMessage ,
    sendMessageToMultiple,
    toggleMessageLoader} = require('../controllers/ClientController');



    const storage = multer.diskStorage({
        destination: 'uploads/',
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname);
            const baseName = path.basename(file.originalname, ext);
            cb(null, `${baseName}-${Date.now()}${ext}`);
        },
    });




const upload = multer({ storage });

const router = express.Router();

router.post('/create-session', createSession);
router.get('/toggle-medial-loader/:clientId', toggleImageLoader);
router.post('/send-message', upload.single('media'), sendMessage);
// router.get('/get-message-by-id/:clientId/:chatID/:messageId', getMessageById);  // dose not work for now
router.post('/send-message-multiple', upload.single('media'), sendMessageToMultiple);
router.get('/toggle-message-loader/:clientId', toggleMessageLoader);
router.post('/update-message-callback-url', updateMessageCallbackUrl);



router.get('/get-status/:clientId', getStatus);

router.delete('/delete-session/:clientId', deleteSession);

router.get('/get-chats/:clientId', getChats);
router.get('/get-messages/:chatID/:clientId/:limit' , getChatMessages);




router.get('/get-chat-details/:chatID/:clientId', getChatInfo);


router.get('/get-is-user-registered/:chatID/:clientId', isRegisteredUser);

router.get('/get-messages-with-media/:chatID/:clientId/:limit', getMessagesWithMedia);

module.exports = router;
