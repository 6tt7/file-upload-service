const express = require('express');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const session = require('express-session');
const archiver = require('archiver'); // NEW: For Zipping

const app = express();
const PORT = process.env.PORT || 3000;

// 1. CONFIGURATION
app.set('trust proxy', 1);
app.use(cors());
app.use(express.static('public'));
app.use(express.json()); 

// 2. VIDEO STREAMING & VIEWING
app.use('/f', express.static(path.join(__dirname, 'uploads'), {
    setHeaders: (res, filePath) => {
        res.set('Content-Disposition', 'inline'); // Force view in browser
    }
}));

// 3. SESSION SETUP
app.use(session({
    secret: process.env.SESSION_SECRET || 'dev-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } 
}));

// 4. STORAGE ENGINE
function generateShortId() {
    return Math.random().toString(36).substring(2, 6);
}

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
    limits: { fileSize: 2 * 1024 * 1024 * 1024 } 
});

// 5. AUTH MIDDLEWARE
const requireAuth = (req, res, next) => {
    if (req.session.isAdmin) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
};

// ================= ROUTES =================

// Public: Upload
app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).send('No file uploaded.');
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const fileUrl = `${protocol}://${req.get('host')}/f/${req.file.filename}`;
    res.json({ message: 'Success', url: fileUrl });
});

// Admin: Login
app.post('/api/login', (req, res) => {
    const { password } = req.body;
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123'; 
    if (password === adminPassword) {
        req.session.isAdmin = true;
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false, message: 'Invalid Password' });
    }
});

// Admin: Check Auth
app.get('/api/check-auth', (req, res) => {
    res.json({ isAdmin: !!req.session.isAdmin });
});

// Admin: Logout
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// Admin: List Files
app.get('/api/admin/files', requireAuth, (req, res) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) return res.json([]);

    fs.readdir(uploadDir, (err, files) => {
        if (err) return res.status(500).json({ error: 'Failed to list files' });
        
        const fileData = files.map(file => {
            const stats = fs.statSync(path.join(uploadDir, file));
            const protocol = req.headers['x-forwarded-proto'] || req.protocol;
            return {
                name: file,
                size: stats.size,
                created: stats.birthtime,
                url: `${protocol}://${req.get('host')}/f/${file}`
            };
        });
        
        fileData.sort((a, b) => new Date(b.created) - new Date(a.created));
        res.json(fileData);
    });
});

// NEW: Admin Download Single File
app.get('/api/download/:filename', requireAuth, (req, res) => {
    const filepath = path.join(__dirname, 'uploads', req.params.filename);
    if (fs.existsSync(filepath)) {
        res.download(filepath); // This forces the browser to download
    } else {
        res.status(404).send('File not found');
    }
});

// NEW: Admin Download ALL (Zip)
app.get('/api/admin/download-all', requireAuth, (req, res) => {
    const uploadDir = path.join(__dirname, 'uploads');
    
    // Create a zip stream
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    res.attachment('all-files.zip'); // Tell browser this is a zip file
    archive.pipe(res); // Send zip data directly to browser
    
    // Add all files in 'uploads' to the zip
    archive.directory(uploadDir, false);
    
    archive.finalize();
});

// Admin: Delete File
app.delete('/api/admin/files/:filename', requireAuth, (req, res) => {
    const filepath = path.join(__dirname, 'uploads', req.params.filename);
    if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'File not found' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});