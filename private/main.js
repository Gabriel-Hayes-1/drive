import {getFileContent, getFiles, parseFiles, deleteFile, renameFile, addFolder, deleteFolder} from "./file.js"



//util
function formatByteSize(byteSize, decimals = 1) {
    if (byteSize === null) {
        return '';
    }
    if (!+byteSize) {
        return '0 Bytes';
    }
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;

    const i = Math.floor(Math.log(byteSize) / Math.log(k));


    return `${parseFloat((byteSize / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}


// searching
const searchInput = document.querySelector('#search');
const searchRow = document.querySelector('#search-row');
const searchIcon = document.querySelector('#search-icon');
searchInput.addEventListener('focus',()=>{
    searchRow.classList.add('focused');
    searchIcon.classList.add('focused');
})
searchInput.addEventListener('blur',()=>{
    searchRow.classList.remove('focused');
    searchIcon.classList.remove('focused');
})


//file uploading 
async function uploadFiles(filesToUpload) {
    const metadatas = await parseFiles(filesToUpload, getWorkingDir());
    for (const metadata of metadatas) {
        files.set(metadata.fileId, metadata);
    }
    redrawFileList();
}
const fileUploadInput = document.querySelector("#file-uploader");
const dropElement = document.querySelector('#dropElem');
fileUploadInput.addEventListener("change", (event) => {
    const files = event.target.files;
    uploadFiles(files);
})
document.body.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropElement.classList.remove("transparent");
})
dropElement.addEventListener("dragleave", (event) => {
    event.preventDefault();
    dropElement.classList.add("transparent");
})
dropElement.addEventListener("drop", (event) => {
    event.preventDefault();
    dropElement.classList.add("transparent");
    const files = event.dataTransfer.files;
    if (files.length > 0) {
        uploadFiles(files);
    }
})
window.addEventListener("paste", (event) => {
    const items = event.clipboardData.items;
    const pastedFiles = []
    for (const item of items) {
        if (item.kind === "file") {
            const file = item.getAsFile();
            pastedFiles.push(file);
        }
    }
    if (pastedFiles.length > 0) {
        uploadFiles(pastedFiles);
    }
})

//search
const searchBar = document.querySelector("#search");
function passesSearch(file) {
    const searchTerm = searchBar.value.toLowerCase();
    if (!searchTerm) return true;
    return file.name.toLowerCase().includes(searchTerm);
}
searchBar.addEventListener("input",()=>{
    redrawFileList()
})

//folder nav
let path = [];
const pathRow = document.querySelector("#path-row");
const rootDir = document.querySelector("#folder-root");
rootDir.addEventListener("click",()=>{
    path = [];
    redrawFileList();
    while (pathRow.children.length > 1) {
        pathRow.removeChild(pathRow.lastChild);
    }
})
function navigateToFolder(folderId, folderName) {
    path.push(folderId);
    
    const pathButton = document.createElement("button");
    pathButton.textContent = folderName;
    pathButton.classList.add("link-button");
    pathButton.addEventListener("click",()=>{
        const index = path.indexOf(folderId);
        if (index !== -1) {
            path = path.slice(0,index+1);
            redrawFileList();
            //remove path buttons
            while (pathRow.children.length > index+1) {
                pathRow.removeChild(pathRow.lastChild);
            }
            navigateToFolder(folderId, folderName);
        }
    })
    pathRow.appendChild(pathButton);
}
function fileInWorkingDir(file) {
    if (path.length === 0) {
        return !file.path || file.path === "/";
    }
    return file.path === "/"+path.join("/");
}
function getWorkingDir() {
    return "/"+path.join("/");
}
window.getWorkingDir = getWorkingDir;




//display files 
const fileTemplate = document.querySelector("#file");
const fileList = document.querySelector("#file-list");
const supportedTypes = ["image", "video", "audio", "text", "application", "folder"];
function sortFiles(files, sortBy) {
    const fileArray = files instanceof Map ? Array.from(files.values()) : [...files];
    const sortedFiles = [...fileArray];
    sortedFiles.sort((a, b) => {
        const aIsFolder = a.type === 'folder';
        const bIsFolder = b.type === 'folder';
        if (aIsFolder !== bIsFolder) {
            return aIsFolder ? -1 : 1;
        }
        if (sortBy === "name") {
            return a.name.localeCompare(b.name);
        } else if (sortBy === "date") {
            return b.lastModified - a.lastModified;
        } else if (sortBy === "size") {
            return b.size - a.size;
        } else if (sortBy === "type") {
            const [aType, aFormat] = a.type.split('/');
            const [bType, bFormat] = b.type.split('/');
            if (aType === bType) {
                return aFormat.localeCompare(bFormat);
            } else {
                return aType.localeCompare(bType);
            }
        }
        return 0;
    })
    return sortedFiles;
}
function getFolderChildrenCount(folderId) {
    let count = 0;
    for (const file of files) {
        // check if string before last slash is folderId
        const filePath = file.path || "/";
        const parentFolderId = filePath.split('/').slice(-2, -1)[0];
        if (parentFolderId === folderId) {
            count++;
        }
    }
}
window.getFolderChildrenCount = getFolderChildrenCount;
let mostRecentBlob = null;
async function displayFile(file) {
    const fileFragment = fileTemplate.content.cloneNode(true);
    const fileElement = fileFragment.firstElementChild;
    const nameElem = fileFragment.querySelector(".col-file-name");
    let oldName = file.name;
    const resizeFileNameElem = () =>{
        nameElem.style.width = (nameElem.value.length)+"ch"
    }
    nameElem.value = file.name;
    resizeFileNameElem()
    const date = new Date(file.lastModified).toLocaleString('en-US',{
        month: 'short',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
    })
    fileFragment.querySelector(".col-date-cell").textContent = date;
    let [fileType, fileFormat] = file.type.split('/')
    if (fileType === "folder") fileFormat = fileType;
    fileFragment.querySelector(".col-type-cell").textContent = fileFormat || "file";
    fileFragment.querySelector(".col-size-cell").textContent = formatByteSize(file.size);
    const fileIcon = fileFragment.querySelector(".file-icon");
    if (supportedTypes.includes(fileType)) {
        fileIcon.classList.add(`icon-${fileType}`);
    } else {
        fileIcon.classList.add("icon-generic");
    }
    
    nameElem.addEventListener('input',resizeFileNameElem);
    nameElem.addEventListener('focus',()=>nameElem.classList.add('focused'));
    nameElem.addEventListener('blur',async ()=>{
        nameElem.classList.remove('focused');
        if (nameElem.value !== oldName) {
            const renameResult = await renameFile(file.fileId, nameElem.value);
            if (!renameResult) {
                nameElem.value = oldName;
                resizeFileNameElem();
                console.error("Failed to rename file");
            } else {
                oldName = nameElem.value;
                file.name = nameElem.value;
            }
        }
    })
    nameElem.addEventListener('keydown',(e)=>{
        if(e.key === "Enter") nameElem.blur();
    })

    if (file.type === "folder") {
        fileFragment.querySelector(".btn-download").classList.add("hidden")
    } else {
        fileFragment.querySelector(".btn-download").addEventListener("click", async () => {
            let blob;
            if (mostRecentBlob && mostRecentBlob.fileId === file.fileId) {
                blob = mostRecentBlob.blob;
            } else {
                blob = await getFileContent(file);
                mostRecentBlob = {
                    fileId: file.fileId,
                    blob
                }
            }
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = file.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
    }
    fileFragment.querySelector(".btn-delete").addEventListener("click", async () => {
        // ADD SOME CONFIRMATION HERE
        let success;
        if (file.type === "folder") {
            if (0=== 0) {
                success = await deleteFolder(file.fileId);
            }
        } else {
            success = await deleteFile(file.fileId);
        }
        if (success) {
            fileElement.remove();
        }
    })
    fileElement.addEventListener("click",async (e)=>{
        if (e.target.closest("button, input")) return;
        if (file.type === "folder") {
            navigateToFolder(file.fileId, file.name);
            redrawFileList();
        } else {
            //get blob
            let blob; 
            if (mostRecentBlob && mostRecentBlob.fileId === file.fileId) {
                blob = mostRecentBlob.blob;
            } else {
                blob = await getFileContent(file);
                mostRecentBlob = {
                    fileId: file.fileId,
                    blob
                }
            }
            const url = URL.createObjectURL(blob);
            const previewElement = createPreviewElement(file.type, url);
            if (previewElement) {
                openFilePreview(previewElement, file.name);
            }

        }
    })


    fileList.appendChild(fileFragment);
}
const files = await getFiles();
function redrawFileList() {
    fileList.innerHTML = ''
    
    const sortedFiles = sortFiles(files, "name");
    for (const file of sortedFiles) {
        if (passesSearch(file) && fileInWorkingDir(file)) {
            displayFile(file);
        }
    }
}
redrawFileList()

//adding folders 

const createFolder = document.querySelector("#create-folder");
createFolder.addEventListener("click", async () => {
    const result = await addFolder("New Folder", getWorkingDir());
    if (result) {
        files.set(result.fileId, result);
        redrawFileList();
    } else {
        console.error("Failed to create folder");
    }
})


//file previews
function createPreviewElement(type, url) {
    let previewElement;
    if (type.startsWith("image/")) {
        previewElement = document.createElement("img");
        previewElement.src = url;
    } else if (type.startsWith("video/")) {
        previewElement = document.createElement("video");
        previewElement.src = url;
        previewElement.controls = true;
    } else if (type.startsWith("audio/")) {
        previewElement = document.createElement("audio");
        previewElement.src = url;
        previewElement.controls = true;
    } else if (type.startsWith("text/")) {
        previewElement = document.createElement("iframe");
        previewElement.src = url;
    }
    return previewElement;
}
const previewWrapper = document.querySelector("#preview-wrapper");
const filePreview = document.querySelector("#file-preview");
const filePreviewName = document.querySelector("#preview-name");
const previewClose = document.querySelector("#close-preview");
function openFilePreview(previewElement, name) {
    previewWrapper.classList.remove("transparent");
    filePreview.innerHTML = '';
    filePreview.appendChild(previewElement);
    filePreviewName.textContent = name;
}
previewClose.addEventListener("click",()=>{
    previewWrapper.classList.add("transparent");
})
previewWrapper.addEventListener("click",(e)=>{
    if (e.target === previewWrapper) {
        previewWrapper.classList.add("transparent");
    }
});
document.addEventListener('keydown',(e)=>{
    if (e.key === "Escape") {
        if (!previewWrapper.classList.contains("transparent")) {
            previewWrapper.classList.add("transparent");
        }
    }
})



//log out
const logout = document.querySelector("#logout");
logout.addEventListener("click", async ()=>{
    const logoutResult = await fetch("/api/logout",{
        method: "POST"
    })
    const logoutJson = await logoutResult.json();
    if (logoutResult.status === 200) {
        location.href = "/access"
    } else {
        console.warn("couldnt log out: ", logoutJson)
        //notify user somehow
    }
})