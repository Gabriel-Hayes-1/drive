import express from 'express';
import session from 'express-session';
import rateLimit from 'express-rate-limit';
import http from 'http';
import path from 'path';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import dotenv from 'dotenv';
import db from './db.js';
import {filePath, createUserDir, deleteFile} from './fileManager.js';
import fs from 'fs';

const MAX_FILE_SIZE = 1024 * 1024 * 1024; // 1GB
const CODE_EXPIRE_TIME = 24 * 7 //in hours

dotenv.config({quiet: true})

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const server = http.createServer(app)

app.set('trust-proxy',1);

const nonceStore = new Map();
function removeExpiredNonces() {
    const now = Date.now();
    for (const [username, { expiry }] of nonceStore.entries()) {
        if (now > expiry) {
            nonceStore.delete(username);
        }
    }
}

const port = process.argv[2] || 3000;

app.use(cookieParser());
app.use(express.json());

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {httpOnly:true, secure: process.env.NODE_ENV === 'production' }
}))



function requireAuth(req, res, next) {
    if (req.session?.userId) return next();

    const acceptsHtml = req.headers['accept']?.includes('text/html');
    if (acceptsHtml) return res.redirect('/access');

    res.status(401).json({ message: 'Unauthorized' });
}

const signupLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.NODE_ENV === 'production' ? 10 : 10000,
    message: {message: "Too many attempts, please try again later."}
})

function isValidSignupCode(code) {
    const stmt = db.prepare("SELECT * FROM invites WHERE code = ?");
    const invite = stmt.get(code);

    if (invite) {
        const created_at = invite?.created_at;
        const now = Date.now();
        const diff = now - created_at;
        const diffInHours = diff / (1000 * 60 * 60);
        if (diffInHours > CODE_EXPIRE_TIME) {
            const deleteStmt = db.prepare("DELETE FROM invites WHERE code = ?");
            deleteStmt.run(code);
            return false;
        } else {
            return true;
        }
    } else {
        return false;
    }
}

app.post('/api/redeem', signupLimiter, (req,res) => {
    const {inviteCode} = req.body

    if (!inviteCode) {
        res.status(400).json({message: "invite code is required"});
        return;
    }

    if (isValidSignupCode(inviteCode)) {
        res.json({redirect:`${inviteCode}`});
    } else {
        res.status(400).json({message: "invalid or expired invite code" });
    }
})

app.get('/claim/:inviteCode', (req, res, next) => {
    const { inviteCode } = req.params;

    if (path.extname(inviteCode)) return next();

    signupLimiter(req, res, () => {
        if (!isValidSignupCode(inviteCode)) return res.redirect('/claim');
        res.sendFile(path.join(__dirname, '../public/claim/signup.html'));
    });
});

app.post('/api/signup', signupLimiter, (req,res) => {
    const { encryptedPrivateKey, publicKey, salt, iv, username, signupCode } = req.body;

    if (!Object.values({encryptedPrivateKey, publicKey, salt, iv, username, signupCode}).every(v => v)) return res.status(400).json({ message: "Not all required fields provided" });

    if (!isValidSignupCode(signupCode)) return res.status(400).json({message: "invalid or expired invite code" });

    //check if db contains username already 
    const existingUser = db.prepare("SELECT * FROM users WHERE id = ?").get(username);
    if (existingUser) return res.status(400).json({message: "user already exists"});

    //username becomes username and store in db
    try {
        db.prepare("INSERT INTO users (id, encryptedPrivateKey, publicKey, salt, iv) VALUES (?, ?, ?, ?, ?)")
            .run(username, encryptedPrivateKey, publicKey, salt, iv);

        if (env.NODE_ENV!=="development") {
            db.prepare("DELETE FROM invites WHERE code = ?").run(signupCode);
        }

        createUserDir(username);

        res.json({ success: true });
    } catch (e) {
        if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            res.status(400).json({ message: "Invalid_" });
        }
    }
})


const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    message: {
        message: "too many requests, please wait"
    }
})

app.post('/api/login', loginLimiter, (req,res)=>{
    const {username} = req.body;
    
    if (!username) {
        res.status(400).json({message: "username is required"});
        return;
    }

    const stmt = db.prepare("SELECT * FROM users WHERE id = ?");
    const user = stmt.get(username);
    
    if (!user) {
        res.status(400).json({message: "invalid username or password"});
        return;
    }

    const {encryptedPrivateKey, salt, iv} = user

    const nonce = crypto.randomBytes(16).toString('base64');
    const expiry = Date.now() + 5 * 60 * 1000; 
    nonceStore.set(username, {nonce, expiry});
    removeExpiredNonces(); 

    res.json({encryptedPrivateKey, salt, iv, nonce});
    
})

app.post('/api/nonce', async (req,res)=>{
    const {username, signedNonce} = req.body;

    if (!username || !signedNonce) {
        res.status(400).json({message: "Username and signedNonce are required"});
    }

    const nonceData = nonceStore.get(username);
    
    if (!nonceData) {
        res.status(400).json({message: "Invalid username or nonce"});
    }

    const {nonce, expiry} = nonceData;

    if (Date.now() > expiry) {
        nonceStore.delete(username);
        res.status(400).json({message: "Nonce expired"});
    }

    const stmt = db.prepare("SELECT * FROM users WHERE id = ?");
    const user = stmt.get(username);
    
    if (!user) {
        res.status(400).json({message: "Invalid username or nonce"});
    }
    
    const publicKeyBytes = Buffer.from(user.publicKey, 'base64');
    const signedNonceBytes = Buffer.from(signedNonce, 'base64');
    const nonceBytes = Buffer.from(nonce, 'base64');

    const publicKey = await crypto.subtle.importKey(
        "spki",
        publicKeyBytes,
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["verify"]
    )

    const isValid = await crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        publicKey,
        signedNonceBytes,
        nonceBytes
    )

    if (isValid) {
        req.session.userId = username;
        nonceStore.delete(username);
        res.json({success: true});
    } else {
        res.status(400).json({message: "Invalid signature"});
    }
})

app.post('/api/logout', (req,res)=>{
    req.session.destroy(err => {
        if (err) {
            res.status(500).json({message: "Could not log out"});
        } else {
            res.json({success: true});
        }
    })
})

app.put('/api/upload', requireAuth, (req,res) => {
    const userId = req.session.userId;

    const contentSize = parseInt(req.headers['content-length']);
    if (isNaN(contentSize) || contentSize > MAX_FILE_SIZE) {
        return res.status(413).json({message: "File size limit exceeded"});
    }

    const name = req.headers['file-name'];
    if (!name) return res.status(400).json({message: "File-Name header is required"});

    const fileStream = fs.createWriteStream(filePath(userId, name));
    let bytesReceived = 0;

    req.on('data', chunk => {
        bytesReceived += chunk.length;
        if (bytesReceived > MAX_FILE_SIZE) {
            fileStream.destroy();
            req.destroy(new Error("File size limit exceeded"));
            res.status(413).json({message: "file size limit exceeded"});

            deleteFile(userId, name).catch(e => console.error("Error deleting file after size limit exceeded:", e));
        }
    })

    req.pipe(fileStream);

    fileStream.on('finish', () => {
        res.json({message: "File uploaded successfully"});
    })

    req.on('error', err => {
        if (!res.headersSent) {
            res.status(500).json({message: "File upload failed"});
        }
    })
})

app.post('/api/file/batch', requireAuth, async (req,res) => {
    const userId = req.session.userId;
    const files = req.body.files;
    if (!files || !Array.isArray(files)) return res.status(400).json({message: "Files array is required"});
    const fileNum = files.length;
    if (fileNum > 100) return res.status(400).json({message: "Too many files in batch, max is 100"});
    
    let totalBuffer = Buffer.alloc(4);
    totalBuffer.writeInt32BE(fileNum);
    for (const name of files) {
        if (typeof name !== 'string' || name.length > 255) {
            return res.status(400).json({message: "Invalid file name in batch"});
        }
        
        let dataLength;
        let fileData;
        const path = filePath(userId, name);
        if (!fs.existsSync(path)) {
            dataLength = -1;
        } else {
            fileData = fs.readFileSync(path);
            dataLength = fileData.length;
            if (dataLength > 32767) {
                return res.status(400).json({message: `File ${name} exceeds max size of 32KB`, name});
            }

        }
        const header = Buffer.alloc(2);
        header.writeInt16BE(dataLength);
        let finalPacket;
        if (fileData) {
            finalPacket = Buffer.concat([header, fileData]);
        } else {
            finalPacket = header;
        }
        totalBuffer = Buffer.concat([totalBuffer, finalPacket]);
    }
    res.setHeader('Content-Type', 'application/octet-stream');
    res.send(totalBuffer);
})


app.get('/api/file/:file', requireAuth, (req,res) => {
    const userId = req.session.userId;
    const file = req.params.file;

    if (!file) return res.status(400).json({message: "FilePath is required"});

    const path = filePath(userId, file);
    if (!fs.existsSync(path)) return res.status(404).json({message: "File not found"});
    
    //pipe the file contents 
    const readStream = fs.createReadStream(path);

    readStream.pipe(res);


    readStream.on('error', err => {
        console.error("Error reading file:", err);
        if (!res.headersSent) {
            res.status(500).json({message: "Could not retrieve file"});
        }
    })
});


app.delete('/api/file/:file', requireAuth, async (req,res) => {
    const userId = req.session.userId;
    const file = req.params.file;
    
    if (!file) return res.status(400).json({message: "FilePath is required"});

    const deleteResult = await deleteFile(userId, file);
    if (deleteResult) {
        res.json({message: "File deleted successfully"});
    } else {
        res.status(404).json({message: "File not found"});
    }
})

app.use('/access', express.static(path.join(__dirname, '../public/access')));
app.use('/claim', express.static(path.join(__dirname, '../public/claim')));
app.use('/assets', express.static(path.join(__dirname, '../public/assets')));


app.get('/', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '../private/index.html'));
});

app.use(requireAuth, (req, res, next) => {
    express.static(path.join(__dirname, '../private'))(req, res, next);
});

app.use((req, res) => res.status(404).send('Not found'));


server.listen(port, () => {
    console.log(`Server running on port ${port}`);
})
