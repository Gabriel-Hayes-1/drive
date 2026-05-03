export async function uploadFile(name, content, onProgress) {
    return new Promise((resolve) => {
        const xhr = new XMLHttpRequest();

        if (onProgress) {
            xhr.upload.addEventListener("progress", (event) => {
                if (event.lengthComputable) {
                    onProgress({
                        loaded: event.loaded,
                        total: event.total,
                        percent: Math.round((event.loaded / event.total) * 100)
                    });
                }
            });
        }

        xhr.addEventListener("load", () => {
            try {
                const uploadJson = JSON.parse(xhr.responseText);
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(true);
                } else {
                    console.error("file upload failed: ", uploadJson);
                    resolve(false);
                }
            } catch {
                console.error("failed to parse response");
                resolve(false);
            }
        });

        xhr.addEventListener("error", (e) => {
            console.error("Connection Error: ", e);
            resolve(false);
        });

        xhr.open("PUT", "/api/upload");
        xhr.setRequestHeader("Content-Type", "application/octet-stream");
        xhr.setRequestHeader("File-Name", name);
        xhr.send(content);
    });
}
window.uploadFile = uploadFile;

export async function getFile(fileName) {
    try {
        const response = await fetch("/api/file/" + encodeURIComponent(fileName));

        if (!response.ok) {
            const resJson = await response.json();
            const message = resJson.message || "Failed to fetch file";
            console.error(message);
            return;
        }

        const reader = response.body.getReader();
        const chunks = [];
        let receivedLength = 0;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            receivedLength += value.length;
        }

        let allBytes = new Uint8Array(receivedLength);
        let position = 0;
        for (let chunk of chunks) {
            allBytes.set(chunk, position);
            position += chunk.length;
        }
        
        return allBytes.buffer;
    } catch (e) {
        console.error("Error fetching file ", e);
    }
}

export async function deleteFileRaw(fileName) {
    try {
        const response = await fetch("/api/file/" + encodeURIComponent(fileName), { method: "DELETE" });
        if (!response.ok) {
            const resJson = await response.json();
            const message = resJson.message || "Failed to delete file";
            console.error(message);
            return false;
        } else {
            return true;
        }
    } catch (e) {
        console.error("Error deleting file: ",e);
        return false;
    }
}

import {deriveManifestName, decrypt, encrypt, arrayBufferToHex} from "/assets/crypto.js"

export async function getManifest(hmacSecret, manifestKey) {
    const storedUsername = localStorage.getItem("username"); //username we're logged into
    const storedManifestUsername = localStorage.getItem("manifestUsername");

    const storedManifest = localStorage.getItem("manifest");
    if (storedManifest && storedUsername && storedUsername===storedManifestUsername) {
        return JSON.parse(storedManifest);
    }

    //try to fetch
    
    const manifestName = await deriveManifestName(hmacSecret);
    const fetchedManifest = await getFile(manifestName);
    if (fetchedManifest) {
        const decryptedManifest = await decrypt(manifestKey,fetchedManifest);
        const manifestJson = JSON.parse(new TextDecoder().decode(decryptedManifest));
        localStorage.setItem("manifest", JSON.stringify(manifestJson));
        localStorage.setItem("manifestUsername", storedUsername);
        return manifestJson;
    }

    //nothing on server, create a new one
    const newManifest = [];
    const newFile = await encrypt(manifestKey, new TextEncoder().encode(JSON.stringify(newManifest)));
    const result = await uploadFile(manifestName, newFile);
    if (result) {
        localStorage.setItem("manifest", JSON.stringify(newManifest));
        localStorage.setItem("manifestUsername", storedUsername);
        return newManifest;
    } else {
        //so nothing works, huh?
        console.error("Failed to create manifest on server");
    }
}

export async function updateManifest(manifest, manifestKey, hmacSecret) {
    localStorage.setItem("manifest", JSON.stringify(manifest));
    const manifestName = await deriveManifestName(hmacSecret);
    const encryptedManifest = await encrypt(manifestKey, new TextEncoder().encode(JSON.stringify(manifest)));
    const result = await uploadFile(manifestName, encryptedManifest);
    if (!result) {
        console.error("Failed to update manifest on server");
    }
}