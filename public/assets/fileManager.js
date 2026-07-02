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

export async function getFile(fileName, onProgress) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.responseType = "arraybuffer";

        if (onProgress) {
            xhr.addEventListener("progress", (event) => {
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
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve(xhr.response);
            } else if (xhr.status === 404) {
                reject(404);
            } else {
                try {
                    const { message } = JSON.parse(new TextDecoder().decode(xhr.response));
                    reject(new Error(message || `Server error ${xhr.status}`));
                } catch {
                    reject(new Error(`Server error ${xhr.status}`));
                }
            }
        });

        xhr.addEventListener("error", (e) => {
            reject(new Error(`Connection error: ${e}`));
        });

        xhr.open("GET", "/api/file/" + encodeURIComponent(fileName));
        xhr.send();
    });
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

    const storedManifest = sessionStorage.getItem("manifest");
    if (storedManifest && storedUsername && storedUsername===storedManifestUsername) {
        return JSON.parse(storedManifest);
    }

    //try to fetch

    const manifestName = await deriveManifestName(hmacSecret);
    try {
        const fetchedManifest = await getFile(manifestName);
        if (fetchedManifest) {
            const decryptedManifest = await decrypt(manifestKey,fetchedManifest);
            const manifestJson = JSON.parse(new TextDecoder().decode(decryptedManifest));
            sessionStorage.setItem("manifest", JSON.stringify(manifestJson));
            localStorage.setItem("manifestUsername", storedUsername);
            return manifestJson;
        }
    } catch (e) {
        if (e === 404) {
            console.log("Manifest not found on server, creating a new one");
        }
    }
    

    //nothing on server, create a new one
    const newManifest = [];
    const newFile = await encrypt(manifestKey, new TextEncoder().encode(JSON.stringify(newManifest)));
    const result = await uploadFile(manifestName, newFile);
    if (result) {
        sessionStorage.setItem("manifest", JSON.stringify(newManifest));
        localStorage.setItem("manifestUsername", storedUsername);
        return newManifest;
    } else {
        //so nothing works, huh?
        console.error("Failed to create manifest on server");
    }
}

export async function updateManifest(manifest, manifestKey, hmacSecret) {
    sessionStorage.setItem("manifest", JSON.stringify(manifest));
    const manifestName = await deriveManifestName(hmacSecret);
    const encryptedManifest = await encrypt(manifestKey, new TextEncoder().encode(JSON.stringify(manifest)));
    const result = await uploadFile(manifestName, encryptedManifest);
    if (!result) {
        console.error("Failed to update manifest on server");
    }
}