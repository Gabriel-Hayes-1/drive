import fs from 'fs';
import path from 'path';

const directory = path.resolve(import.meta.dirname, '../files');
fs.mkdirSync(directory, { recursive: true })

function getUserDir(username) {
    const userDir = path.join(directory, username);
    if (!fs.existsSync(userDir)) {
        console.warn("User does not exist");
        return null
    }
    return userDir;
}

export function filePath(username, fileName) {
    const userDir = getUserDir(username);
    if (!userDir) return null;
    return path.join(userDir, fileName);
}

export function createUserDir(username) {
    const userDir = getUserDir(username);
    if (userDir) {
        return userDir;
    } else {
        const newUserDir = path.join(directory, username);
        fs.mkdirSync(newUserDir);
        return newUserDir;
    }
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

