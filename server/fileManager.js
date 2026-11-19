import fs from 'fs';
import path from 'path';

const directory = path.resolve(import.meta.dirname, '../files');
fs.mkdirSync(directory, { recursive: true })

function getUserDir(username) {
    const userDir = path.resolve(directory, username);
    if (!fs.existsSync(userDir)) {
        console.warn("User does not exist");
        return null
    }
    return userDir;
}

export function isFileNameValid(FileName) {
    if (!FileName) return false
    const PATH_RE = /^[0-9a-fA-F]{1,255}$/
    return PATH_RE.test(FileName);
}

export function filePath(username, fileName) {
    if (!isFileNameValid(fileName)) {
        return null
    }
    const userDir = getUserDir(username);
    if (!userDir) return null;
    const full = path.resolve(userDir, fileName);
    if (!full.startsWith(userDir + path.sep)) {
        return null;
    }
    return full;
}

export function createUserDir(username) {
    const userDir = path.join(directory, username);
    fs.mkdirSync(userDir, { recursive: true }); // no-op if already exists
    return userDir;
}

export async function deleteFile(username,fileName) {
    try {
        const fullPath = filePath(username, fileName);
        if (!fullPath || !fs.existsSync(fullPath)) {
            throw new Error("File not found");
        }
        fs.unlinkSync(fullPath);
        return true;
    } catch (e) {
        console.error("Error deleting file: ", e);
        return false;
    }
}

