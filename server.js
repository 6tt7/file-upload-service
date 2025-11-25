const express = require('express');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000; // Updated for Deployment

app.use(cors());

// serve the frontend
// If you moved index.html to a 'public' folder, keep using 'public'
// If index.html is in the main folder, change 'public' to __dirname
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

    // We build the URL based on the server's address
    const fileUrl = `${req.protocol}://${req.get('host')}/f/${req.file.filename}`;
    
    res.json({ message: 'Success', url: fileUrl });
});

// ROUTE 2: Serve Files (The Fix for Video Playback)
app.get('/f/:filename', (req, res) => {
    const filepath = path.join(__dirname, 'uploads', req.params.filename);
    
    // Check if file exists
    if (!fs.existsSync(filepath)) {
        return res.status(404).send('File not found');
    }

    // Force browser to display (inline) instead of download
    res.setHeader('Content-Disposition', 'inline'); 
    res.sendFile(filepath);
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});