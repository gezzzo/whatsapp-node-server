const express = require('express');
const sessionRoutes = require('./src/routes/sessionRoutes');
const path = require('path');
const multer = require('multer');

const app = express();
const PORT = 3000;
const fs = require('fs');

const MEDIA_DIR = path.join(__dirname, 'media');
if (!fs.existsSync(MEDIA_DIR)) {
    fs.mkdirSync(MEDIA_DIR);
}

const storage = multer.diskStorage({
    destination: 'uploads/',
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const baseName = path.basename(file.originalname, ext);
        cb(null, `${baseName}-${Date.now()}${ext}`);
    },
});

const upload = multer({ storage });



const checkPasskey = (req, res, next) => {
    const passkey = req.header('x-passkey'); 
    if (!passkey || passkey != 'dr-gezo-1-2000-2-2025-darsh') { 
        return res.status(403).json({ message: 'Forbidden: Invalid passkey' });
    }
    next(); 
};



app.get('/', (req, res) => {
    res.status(200).json({ message: 'Welcome' });
});


app.use('/media', express.static(MEDIA_DIR));

app.use(checkPasskey);
app.use(express.json());
app.use('/api/client', sessionRoutes);

app.listen(PORT|process.env.PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
