const pass = document.querySelector("#password");
const user = document.querySelector("#username");
const submitBtn = document.querySelector("#submit");
const visibilityBtn = document.querySelector("#visibility");
const passwordRow = document.querySelector("#password-row");
const usernameRow = document.querySelector("#username-row");
let timeout


function feedbackText() {
    usernameRow.value = "";
    passwordRow.value = "";
}

pass.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        if (user.value!=="") {
            if (pass.value!=="") {
                submit(user.value, pass.value);
            }
        } else {
            user.focus();
        }
    }
})

pass.addEventListener("keydown",(e)=>{
    if (e.key == "Tab") {
        e.preventDefault();
        user.focus();
    }
})

submitBtn.addEventListener("click", () => {
    submit(user.value, pass.value);
})

function type(fromStr, toStr) {
    let buffer = []
    for (let i = fromStr.length - 1; i >= 0; i--) {
        buffer.push(fromStr.slice(0, i));
    }
    if (toStr) {
        for (let i = 1; i < toStr.length + 1; i++) {
            buffer.push(toStr.slice(0, i));
        }
    }
    return buffer;
}

visibilityBtn.addEventListener('click', () => {
    if (pass.type === "password") {
        pass.type = "text";
        visibilityBtn.classList.add("invisible")
    } else {
        pass.type = "password";
        visibilityBtn.classList.remove("invisible")
    }
})

pass.addEventListener('focus',()=>{
    passwordRow.classList.add('focused')
})
pass.addEventListener('blur',()=>{
    passwordRow.classList.remove('focused')
})
user.addEventListener('focus',()=>{
    usernameRow.classList.add('focused')
})
user.addEventListener('blur',()=>{
    usernameRow.classList.remove('focused')
})

pass.addEventListener("input",()=>{
    if (pass.value!=="" && user.value!=="") {
        submitBtn.disabled = false;
    } else {
        submitBtn.disabled = true;
    }
})

user.addEventListener("input",()=>{
    if (user.value!=="" && pass.value!=="") {
        submitBtn.disabled = false;
    } else {
        submitBtn.disabled = true;
    }
})

document.addEventListener("keydown",(event)=>{
    if (event.key == "Enter") {
        if (user.value==="") {
            user.focus();
        } else {
            pass.focus()
        }
    }
})



//login logic
import { login } from "../assets/crypto.js";

async function submit(username, password) {
    const result = await login(username,password);
    if (result.success) { 
        location.href = "/";
    } else {
        //tell the user somehow (figure it out later)
        //fuck you past self
        user.value = "";
        pass.value = "";
        submitBtn.disabled = true;
        user.focus()
    }
}

window.submit = submit;