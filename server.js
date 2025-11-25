const express = require('express');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;

// 1. CONFIGURATION
app.set('trust proxy', 1); // Important for Render HTTPS
app.use(cors());
app.use(express.static('public')); // Serves index.html, admin.html
app.use(express.json()); 

// 2. VIDEO STREAMING FIX (The Magic Change)
// We use express.static for the uploads folder. 
// This automatically handles "Range Requests" (required for video scrubbing/loading)
// and forces the browser to display files (inline) instead of downloading them.
app.use('/f', express.static(path.join(__dirname, 'uploads'), {
    setHeaders: (res, filePath) => {
        res.set('Content-Disposition', 'inline');
    }
}));

// 3. SESSION SETUP
app.use(session({
    secret: process.env.SESSION_SECRET || 'dev-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // Set to true if you set up a custom domain
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
    limits: { fileSize: 2 * 1024 * 1024 * 1024 } // 2GB
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
    
    // Construct the URL using the server's address
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
        
        // Sort by newest
        fileData.sort((a, b) => new Date(b.created) - new Date(a.created));
        res.json(fileData);
    });
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