const express = require('express');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// 1. TRUST PROXY (Fixes the http/https issue on Render)
app.set('trust proxy', 1);

app.use(cors());

// Serve frontend files
app.use(express.static('public'));

// Helper: Generate 4-char ID
function generateShortId() {
    return Math.random().toString(36).substring(2, 6);
}

// Storage Engine
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = './uploads';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir);
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        let shortId = generateShortId();
        while (fs.existsSync(path.join('./uploads', shortId + ext))) {
            shortId = generateShortId();
        }
        cb(null, shortId + ext);
    }
});

const upload = multer({ 
    storage: storage, 
    limits: { fileSize: 2 * 1024 * 1024 * 1024 } // 2GB limit
});

// ROUTE 1: Upload File
app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).send('No file uploaded.');

    // FIX: Detect if we are on HTTPS (Render) or HTTP (Localhost)
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const fileUrl = `${protocol}://${req.get('host')}/f/${req.file.filename}`;
    
    res.json({ message: 'Success', url: fileUrl });
});

// ROUTE 2: Serve Files (Video Playback Fix)
app.get('/f/:filename', (req, res) => {
    const filepath = path.join(__dirname, 'uploads', req.params.filename);
    
    if (!fs.existsSync(filepath)) {
        return res.status(404).send('File not found');
    }

    // Force inline display
    res.setHeader('Content-Disposition', 'inline'); 
    res.sendFile(filepath);
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});