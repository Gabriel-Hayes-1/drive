import { uploadFile, getFile, deleteFileRaw, getManifest, updateManifest } from "/assets/fileManager.js";
import {
    deriveFileNames, base64ToKey, base64ToArrayBuffer,
    arrayBufferToHex, encrypt, decrypt, deriveFileKeys, arrayBufferToBase64
} from "/assets/crypto.js";

const uploadedCount = document.querySelector("#uploaded-count");
const totalCount = document.querySelector("#total-count");
const uploadProgress = document.querySelector("#upload-progress");
const uploadSection = document.querySelector("#upload-section");

async function getKeysLocalStorage() {
    const masterBits = localStorage.getItem("masterBits");
    const hmacSecret = localStorage.getItem("hmacSecret");
    const manifestKey = localStorage.getItem("manifestKey");
    const salt = localStorage.getItem("salt");

    if (!masterBits || !hmacSecret || !manifestKey || !salt) {
        throw new Error("Missing keys in localStorage");
    }
    const encoder = new TextEncoder();
    return {
        masterBits: base64ToArrayBuffer(masterBits),
        hmacSecret: base64ToArrayBuffer(hmacSecret),
        manifestKey: await base64ToKey(manifestKey),
        salt: base64ToArrayBuffer(salt)
    }
}
let keys = false;
export async function parseFiles(files, path) {
    if (!keys) {
        keys = await getKeysLocalStorage();
    }

    const encoder = new TextEncoder();
    const fileArray = Array.from(files);
    const fileCount = fileArray.length;
    totalCount.textContent = fileCount;
    const metadatas = [];

    uploadSection.classList.remove("transparent");

    let filesUploaded = 0;
    const renderProgress = (fileProgress) => {
        const total = ((filesUploaded * 100) + fileProgress) / (fileCount * 100);
        uploadProgress.style.width = `${total * 100}%`;
    };
    renderProgress(0);
    uploadedCount.textContent = filesUploaded + 1;

    let manifest = await getManifest(keys.hmacSecret, keys.manifestKey);

    for (const file of fileArray) {
        const fileId = crypto.getRandomValues(new Uint8Array(16));
        const { metadataName, contentName } = await deriveFileNames(keys.hmacSecret, fileId);

        const { metaKey, contentKey } = await deriveFileKeys(keys.masterBits, fileId, keys.salt)

        const encryptedContent = await encrypt(contentKey, await file.arrayBuffer());

        const metadata = {
            name: file.name,
            size: file.size,
            type: file.type,
            path: path, 
            lastModified: file.lastModified,
        };
        metadatas.push({
            ...metadata,
            contentName,
            contentKey,
            fileId: arrayBufferToBase64(fileId)
        });


        const stringMetadata = JSON.stringify(metadata);
        const encryptedMetadata = await encrypt(metaKey, encoder.encode(stringMetadata));

        manifest.push(arrayBufferToBase64(fileId));

        const uploadMetadata = uploadFile(metadataName, encryptedMetadata);
        const uploadContent = uploadFile(contentName, encryptedContent, ({ percent }) => {
            renderProgress(percent)
        });

        const success = await Promise.all([uploadContent, uploadMetadata]);

        if (!success) {
            console.error("Failed to upload ", file.name);
        } else {
            filesUploaded++;
            uploadedCount.textContent = filesUploaded + 1;
            renderProgress(0);
        }
    }

    updateManifest(manifest, keys.manifestKey, keys.hmacSecret);
    uploadSection.classList.add("transparent");

    return metadatas;
}

export async function getFiles() {
    if (!keys) {
        keys = await getKeysLocalStorage();
    }
    const manifest = await getManifest(keys.hmacSecret, keys.manifestKey);

    const results = await Promise.allSettled(
        manifest.map(async (base64FileId) => {
            const fileId = base64ToArrayBuffer(base64FileId);
            const { metadataName, contentName } = await deriveFileNames(keys.hmacSecret, fileId);
            const { metaKey, contentKey } = await deriveFileKeys(keys.masterBits, fileId, keys.salt);
            const encryptedMeta = await getFile(metadataName);
            const fileBytes = await decrypt(metaKey, encryptedMeta);
            const metadata = JSON.parse(new TextDecoder().decode(fileBytes));
            metadata.contentName = contentName;
            metadata.contentKey = contentKey;
            metadata.fileId = base64FileId;
            return metadata;
        })
    );

    const fileMap = new Map();
    results.filter(result => result.status === "fulfilled").forEach(result => {
        const metadata = result.value;
        fileMap.set(metadata.fileId, metadata);
    });
    const failedFiles = results.filter(result => result.status === "rejected");

    if (failedFiles.length > 0) {
        console.warn(`Failed to fetch ${failedFiles.length} files`);
    }
    return fileMap;
}

async function getFileEntry(fileId) {
    if (!keys) {
        keys = await getKeysLocalStorage();
    }
    const manifest = await getManifest(keys.hmacSecret, keys.manifestKey);
    const fileIndex = manifest.findIndex(id => id === fileId);
    if (fileIndex === -1) {
        console.warn("File not found in manifest");
        console.warn(manifest, fileId)
        return false;
    }
    
    let { metadataName, contentName } = await deriveFileNames(keys.hmacSecret, base64ToArrayBuffer(fileId));

    const { metaKey, contentKey } = await deriveFileKeys(keys.masterBits, base64ToArrayBuffer(fileId), keys.salt);
    return { metaName: metadataName, contentName, metaKey, contentKey, manifest, fileIndex };
}

function getParentDirFileId(metadata, manifest) {
    const parentPath = metadata.path;
    if (parentPath == "/") return null
    const parentDirId = parentPath.split("/").filter(Boolean).slice(-1)[0];
    return parentDirId;
}


export async function deleteFile(fileId) {
    const { metaName, contentName, manifest, fileIndex } = await getFileEntry(fileId);



    const contentPromise = deleteFileRaw(contentName);
    const metaPromise = deleteFileRaw(metaName);

    const results = await Promise.allSettled([contentPromise,metaPromise]);
    const allFulfilled = results.every(result => result.status === 'fulfilled');
    if (allFulfilled) {
        manifest.splice(fileIndex, 1);
        await updateManifest(manifest, keys.manifestKey, keys.hmacSecret);
        return true;
    } else {
        console.error("Failed to delete file: ", results);
        return false;
    }
}

export async function renameFile(fileId, newName) {
    const { metaName, metaKey} = await getFileEntry(fileId);
    
    const encryptedMeta = await getFile(metaName);
    const fileBytes = await decrypt(metaKey, encryptedMeta);
    const metadata = JSON.parse(new TextDecoder().decode(fileBytes));
    metadata.name = newName;
    
    const stringMetadata = JSON.stringify(metadata);
    const encryptedMetadata = await encrypt(metaKey, new TextEncoder().encode(stringMetadata));
    
    const uploadResult = await uploadFile(metaName, encryptedMetadata);
    if (!uploadResult) {
        console.error("Failed to upload renamed metadata");
        return false;
    }
    return true;
}

export async function addFolder(folderName, path) {
    if (!keys) {
        keys = await getKeysLocalStorage();
    }

    const fileId = crypto.getRandomValues(new Uint8Array(16));
    const { metadataName } = await deriveFileNames(keys.hmacSecret, fileId);
    const { metaKey } = await deriveFileKeys(keys.masterBits, fileId, keys.salt);
    const manifest = await getManifest(keys.hmacSecret, keys.manifestKey);



    const metadata = {
        name: folderName,
        size: null,
        type: "folder",
        lastModified: Date.now(),
        content:"none",
        path: path,
    }


    const stringMetadata = JSON.stringify(metadata);
    const encryptedMetadata = await encrypt(metaKey, new TextEncoder().encode(stringMetadata));

    metadata.fileId = arrayBufferToBase64(fileId); // Dont send fileId to server
    
    const uploadResult = await uploadFile(metadataName, encryptedMetadata);
    if (!uploadResult) {
        console.error("Failed to upload folder metadata");
    } else {
        //ADD TO MANIFEST
        console.log("Adding to manifest. Folder path: ", path)
        manifest.push(arrayBufferToBase64(fileId));
        await updateManifest(manifest, keys.manifestKey, keys.hmacSecret);
        return metadata;
    }
}

export async function deleteFolder(folderId) {

    const {metaName, manifest, fileIndex} = await getFileEntry(folderId);

    const result = await deleteFileRaw(metaName);

    if (result) {
        manifest.splice(fileIndex, 1);
        await updateManifest(manifest, keys.manifestKey, keys.hmacSecret);
        return true;
    } else {
        console.error("Failed to delete folder");
        return false;
    }
}

export async function getFileContent(metadata) {
    const encryptedContent = await getFile(metadata.contentName);
    const decryptedContent = await decrypt(metadata.contentKey, encryptedContent);
    return new Blob([decryptedContent], { type: metadata.type });
}


