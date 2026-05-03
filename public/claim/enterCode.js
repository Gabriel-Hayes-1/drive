const inputs = document.querySelectorAll('.code-input-container input');
const feedback = document.querySelector('#feedback')
let timeout

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

async function checkAndSubmit() {
    const allFilled = Array.from(inputs).every(input => input.value);
    if (!allFilled) return;

    const code = Array.from(inputs).map(input => input.value).join('');

    const result = await fetch(`/api/redeem`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ inviteCode: code })
    })
    const json = await result.json();
    if (result.status == 200) {
        window.location.href = json.redirect
    } else {
        feedback.textContent = json.message || "invalid code";

        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => {
            const buffer = type(feedback.textContent, "");
            let i = 0;
            const interval = setInterval(() => {
                feedback.textContent = buffer[i];
                i++;
                if (i >= buffer.length) {
                    clearInterval(interval);
                    feedback.textContent = "";
                }
            }, 40)
        }, 2000)

        inputs.forEach(input => input.value = '');
        inputs[0].focus();
    }
}

inputs.forEach((input, index) => {
    input.addEventListener('keydown', (e) => {
        if (e.key === "ArrowLeft") {
            e.preventDefault();
            if (index > 0) inputs[index - 1].focus();
        } else if (e.key === "ArrowRight") {
            e.preventDefault();
            if (index < inputs.length - 1) inputs[index + 1].focus();
        } else if (e.key === "Backspace" && !e.target.value && index > 0) {
            inputs[index - 1].focus();
        } else if (e.key.length === 1 && /[a-zA-Z0-9]/.test(e.key)) {
            e.target.value = '';
        }
    });

    input.addEventListener('paste', async (e) => {
        e.preventDefault();
        const pasted = e.clipboardData.getData('text').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        pasted.split('').forEach((char, i) => {
            if (index + i < inputs.length) {
                inputs[index + i].value = char;
            }
        });
        const nextIndex = Math.min(index + pasted.length, inputs.length - 1);
        inputs[nextIndex].focus();
        await checkAndSubmit();
    });

    input.addEventListener('input', async (e) => {
        const raw = e.target.value;
        const cleaned = raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        e.target.value = cleaned.slice(-1);

        if (e.target.value) {
            if (index < inputs.length - 1) {
                inputs[index + 1].focus();
            } else {
                await checkAndSubmit();
            }
        }

        await checkAndSubmit();
    });
});