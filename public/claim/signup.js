const pass = document.querySelector("#password");
const submitBtn = document.querySelector("#submit");
const visibilityBtn = document.querySelector("#visibility");
const passwordRow = document.querySelector("#password-row");
const usernameRow = document.querySelector("#username-row");
const charCount = document.querySelector("#charcount");
const nextStep = document.querySelector('#submit');
const popup = document.querySelector('#popup');
const passwordBack = document.querySelector('#password-back')

const usernameInput = document.querySelector('#username');
const submitUsername = document.querySelector('#username-submit');

const usernamePage = document.querySelector('#username-section');
const passwordPage = document.querySelector('#password-section');

let username = "";
let password = "";

const MINIMUM_PASS_LENGTH = 10;
charCount.textContent = `0/${MINIMUM_PASS_LENGTH}`

function switchPage(page) {
    if (page==="username") {
        passwordPage.classList.add("transparent");
        setTimeout(() => {
            usernamePage.classList.remove("transparent");
        },500)
    } else if (page==="password") {
        usernamePage.classList.add("transparent");
        setTimeout(() => {
            passwordPage.classList.remove("transparent");
        }, 500)
    }

}

usernameInput.addEventListener('input', () => {
    if (usernameInput.value.length > 0) {
        submitUsername.disabled = false;
    } else {
        submitUsername.disabled = true;
    }
})

usernameInput.addEventListener('keydown',(input)=>{
    if (input.key === "Enter") {
        submitUser()
    }
})

function submitUser() {
    const inputtedUsername = usernameInput.value;
    if (inputtedUsername.length > 0) {
        switchPage("password");
        username = inputtedUsername;
        pass.focus()
    }
}
submitUsername.addEventListener('click', () => {
    submitUser()
});
usernameInput.addEventListener('focus', () => {
    usernameRow.classList.add('focused')   
});
usernameInput.addEventListener('blur', () => {
    usernameRow.classList.remove('focused')   
});



visibilityBtn.addEventListener('click', () => {
    if (pass.type === "password") {
        pass.type = "text";
        visibilityBtn.classList.add("invisible")
    } else {
        pass.type = "password";
        visibilityBtn.classList.remove("invisible")
    }
})

function ispasswordValid(password) {
    return password.length >= MINIMUM_PASS_LENGTH;
}

pass.addEventListener('focus', () => {
    passwordRow.classList.add('focused')
})
pass.addEventListener('blur', () => {
    passwordRow.classList.remove('focused')
})
pass.addEventListener('input',() => {
    const passwordLength = pass.value.length;
    charCount.textContent = `${passwordLength}/${MINIMUM_PASS_LENGTH}`
    if (passwordLength >= MINIMUM_PASS_LENGTH) {
        charCount.classList.remove('invalid');
        submitBtn.disabled = false;
    } else {
        charCount.classList.add('invalid')
        submitBtn.disabled = true;
    }
    hasClickedDownload = false;
    popupDownloadLink.classList.remove("disabled")
})
pass.addEventListener('keydown',(event)=>{
    if (event.key === "Enter" && !submitBtn.disabled) {
        nextStep.click();
    }
})
nextStep.addEventListener('click',()=>{
    if (!ispasswordValid(pass.value)) return;
    password = pass.value;
    openPop();
})
passwordBack.addEventListener('click',()=>{
    switchPage("username");
})


// POPUP LOGIC
//###########################################################################

const popupDownloadLink = document.querySelector("#download");
const popupCheckbox = document.querySelector("#ackCheck");
const passwordConfirmRow = document.querySelector(".password-confirm-row");
const passConfirm = document.querySelector("#confirm-password");
const finalStep = document.querySelector('#continue');
const closePopup = document.querySelector('#back');
const passwordMatchCheckmark = document.querySelector('#password-check');
const passwordConfirmVisibility = document.querySelector("#confirm-visibility");
let hasClickedDownload = false;
let url;

const actionMessages = {
    noDownload: "Please download your key file",
    noAcknowledge: "Please acknowledge that you understand the value of your key",
    confirmPassNoMatch: "Passwords do not match",
    confirmPassEmpty: "Please confirm your password",
    success: "Confirm"
}


popupDownloadLink.addEventListener('click', () => {    
    hasClickedDownload = true;
    popupDownloadLink.classList.add("disabled");
    updateContinueButton();
    setTimeout(()=>{
        popupDownloadLink.removeAttribute("href")
        popupDownloadLink.removeAttribute("download");
    },100)
})

popupCheckbox.addEventListener('change', () => {
    updateContinueButton()
})

passConfirm.addEventListener('input', () => {
    updateContinueButton()
})

passwordConfirmVisibility.addEventListener('click', () => {
    if (passConfirm.type === "password") {
        passConfirm.type = "text";
        passwordConfirmVisibility.classList.add("invisible")
    } else {
        passConfirm.type = "password";
        passwordConfirmVisibility.classList.remove("invisible")
    }
})

function updateContinueButton() {
    finalStep.disabled = true;
    if (!hasClickedDownload) {
        finalStep.textContent = actionMessages.noDownload;
    } else if (!popupCheckbox.checked) {
        finalStep.textContent = actionMessages.noAcknowledge;
    } else if (passConfirm.value === "") {
        finalStep.textContent = actionMessages.confirmPassEmpty;
    } else if (passConfirm.value !== password) {
        finalStep.textContent = actionMessages.confirmPassNoMatch;
    } else {
        finalStep.textContent = actionMessages.success;
        finalStep.disabled = false;
    }
    if (passConfirm.value === password) {
        passwordMatchCheckmark.classList.remove("transparent");
    } else {
        passwordMatchCheckmark.classList.add("transparent");
    }
}

function openPop() {
    if (url) {
        URL.revokeObjectURL(url);
    }
    const blob = new Blob([password], { type: 'text/plain' });
    url = URL.createObjectURL(blob);

    popupDownloadLink.href = url;
    //popupDownloadLink.download = "drive-password.txt";
    popupDownloadLink.classList.remove("disabled")
    updateContinueButton()
    popup.classList.remove("transparent")
}

function closePop() {
    popup.classList.add("transparent")
    
}
closePopup.addEventListener('click', () => {
    closePop()
})


finalStep.addEventListener("click",async ()=>{
    const result = await signIn(username,password);
    if (!result) {
        finalStep.textContent = "There was an issue signing you up."
    }
})


//SIGNUP PROCESS
//###########################################################################
//###########################################################################

import { generateKeypair, deriveAllKeys, 
    wrapPrivateKey, arrayBufferToBase64,
    generateUsername, login, 
    encrypt, jsonToArrayBuffer, arrayBufferToHex
} from "/assets/crypto.js";

import {
    uploadFile
} from "/assets/fileManager.js"

async function signIn(username, password) {
    const {
        salt,
        privateKey,     
        publicKey,      
        privateKeyBytes, 
        publicKeyBytes,  
    } = await generateKeypair();

    const timeStart = performance.now()
    const { authKey, hmacSecret, manifestKey } = await deriveAllKeys(password, salt);
    console.log("Computed keys in ", performance.now() - timeStart)

    const {wrappedPrivateKey, iv} = await wrapPrivateKey(privateKey, authKey);
    const hashedUsername = await generateUsername(username);


    //extract from url with scema /claim/:<code>
    const signupCode = window.location.pathname.split('/claim/')[1];

    //send server these six things
    const toSend = {
        encryptedPrivateKey: arrayBufferToBase64(wrappedPrivateKey),
        publicKey: arrayBufferToBase64(publicKeyBytes),
        salt: arrayBufferToBase64(salt),
        iv: arrayBufferToBase64(iv),
        username: hashedUsername,
        signupCode: signupCode
    }

    const result = await fetch('/api/signup', {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(toSend)
    })

    const json = await result.json();
    if (result.ok && json.success) {
        console.log("signup success! server responded with ", json);
    } else if (json) {
        console.error("signup failed! server responded with ", json);
        return false;
    } else {
        console.error("Signup failed! Server did not respond with JSON.");
        return false;
    }

    const loginResult = await login(username, password);
    if (loginResult.success) {
        // Account created and we're authed to do stuff

        location.href = "/";
    } else {
        console.error("login after signup failed with message: ", loginResult.message);
    }
}

window.signIn = signIn;

