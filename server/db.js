import Database from "better-sqlite3";
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, 'data.db'));

db.exec(`
    
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        encryptedPrivateKey TEXT NOT NULL,
        publicKey TEXT NOT NULL,
        salt TEXT NOT NULL,
        iv TEXT NOT NULL UNIQUE 
    );

    CREATE TABLE IF NOT EXISTS invites (
        code TEXT PRIMARY KEY, 
        created_at INTEGER NOT NULL
    )
    
    
    
`)

export default db;