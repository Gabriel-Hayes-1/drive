export async function generateUsername(username) {
    if (typeof username !== "string") return;

    const encoder = new TextEncoder();
    const data = encoder.encode(username);
    const hash = await crypto.subtle.digest("SHA-256", data);


    if (Uint8Array.prototype.toHex) {
        return new Uint8Array(hash).toHex();
    } else {
        const hashArray = Array.from(new Uint8Array(hash));
        return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
    }
}

export async function generateKeypair() {
    const salt = crypto.getRandomValues(new Uint8Array(16));

    const { privateKey, publicKey } = await crypto.subtle.generateKey(
        { name: "ECDSA", namedCurve: "P-256" },
        true, // extractable — so you can encrypt/export the private key
        ["sign", "verify"]
    );

    // Export raw bytes so callers can do whatever they want with them
    const privateKeyBytes = new Uint8Array(await crypto.subtle.exportKey("pkcs8", privateKey));
    const publicKeyBytes = new Uint8Array(await crypto.subtle.exportKey("spki", publicKey));

    return {
        salt,           // Uint8Array — pass to your PBKDF2 derivation
        privateKey,     // CryptoKey  — pass directly to subtle.sign
        publicKey,      // CryptoKey  — pass directly to subtle.verify
        privateKeyBytes, // Uint8Array — pass to your encrypt/base64 functions
        publicKeyBytes,  // Uint8Array — send to server, share freely
    };
}

export async function deriveAllKeys(password, salt) {
    const enc = new TextEncoder();

    // import password, then derive a master key using PBKDF2
    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        enc.encode(password),
        "PBKDF2",
        false,
        ["deriveBits"]
    );

    const masterBits = await crypto.subtle.deriveBits(
        { name: "PBKDF2", salt, iterations: 600_000, hash: "SHA-256" },
        keyMaterial,
        256
    );

    const masterKey = await crypto.subtle.importKey(
        "raw", masterBits, "HKDF", false, ["deriveBits", "deriveKey"]
    );

    const manifestKey = await crypto.subtle.deriveKey(
        { name: "HKDF", hash: "SHA-256", salt, info: enc.encode("manifest-key-v1") },
        masterKey,
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );

    const authKey = await crypto.subtle.deriveKey(
        { name: "HKDF", hash: "SHA-256", salt, info: enc.encode("auth-key-v1") },
        masterKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["wrapKey", "unwrapKey"]
    );

    const hmacSecret = await crypto.subtle.deriveBits(
        { name: "HKDF", hash: "SHA-256", salt, info: enc.encode("hmac-secret-v1") },
        masterKey,
        256
    )

    return { manifestKey, authKey, masterBits, hmacSecret };
}

export async function wrapPrivateKey(privateKey, authKey) {
    const wrapAlgo = {
        name: "AES-GCM",
        iv: crypto.getRandomValues(new Uint8Array(12)) //12 only idk dont touch it, it works
    };

    try {
        const wrappedPrivateKey = await crypto.subtle.wrapKey(
            "pkcs8",       //just make sure this matches unwrapping 
            privateKey,    
            authKey,   
            wrapAlgo
        );

        // wrappedPrivate key is an ArrayBuffer, iv is a Uint8Array
        return {
            wrappedPrivateKey,
            iv: wrapAlgo.iv
        };
    } catch (e) {
        console.error("Wrapping failed:", e);
    }
}
export async function unwrapPrivateKey(wrappedPrivateKey, authKey, iv) {
    const unwrapAlgo = {
        name: "AES-GCM",
        iv: iv
    }

    try {
        const privateKey = await window.crypto.subtle.unwrapKey(
            "pkcs8",
            wrappedPrivateKey,
            authKey,
            unwrapAlgo,
            { name: "ECDSA", namedCurve: "P-256" }, // matches the parameters used in generateKeypair
            false, 
            ["sign"] 
        )
        return privateKey;

    } catch (e) {
        return false;
    }   
}

export async function signNonce(nonce, privateKey) {
    const signature = await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        privateKey,
        nonce
    )
    return signature;
}

export function generateSalt() {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    return btoa(String.fromCharCode(...salt));
}

export function saltFromString(b64) {
    return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

export function arrayBufferToBase64(arrBuffer) {
    if (Uint8Array.prototype.toBase64) {
        return new Uint8Array(arrBuffer).toBase64();
    } else {
        console.warn("Using non-native arrayBuffer conversion");
        const base64 = btoa(String.fromCharCode.apply(null, new Uint8Array(arrBuffer)));
        return base64;
    }
}

export function base64ToArrayBuffer(base64) {
    if (Uint8Array.fromBase64) {
        return Uint8Array.fromBase64(base64).buffer;
    } else {
        console.warn("Using non-native base64 conversion");
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }
}

export async function keyToBase64(key) {
    const exported = await crypto.subtle.exportKey("raw", key);
    return arrayBufferToBase64(exported);
}

export function base64ToKey(base64String) { 
    const raw = base64ToArrayBuffer(base64String);
    return crypto.subtle.importKey(
        "raw",
        raw,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
}

export function arrayBufferToHex(arrBuffer) {
    if (Uint8Array.prototype.toHex) {
        return new Uint8Array(arrBuffer).toHex();
    } else {
        console.warn("Using non-native arrayBuffer to hex conversion");
        const hashArray = Array.from(new Uint8Array(arrBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
    }
}

export function jsonToArrayBuffer(json) {
    const jsonString = JSON.stringify(json);
    const encoder = new TextEncoder();
    return encoder.encode(jsonString).buffer;
}

export function arrayBufferToJson(buffer) {
    const decoder = new TextDecoder();
    const jsonString = decoder.decode(buffer);
    return JSON.parse(jsonString);
}

export function arrayBufferToKey(buffer) {
    return crypto.subtle.importKey(
        "raw",
        buffer,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
}

export async function encrypt(key, bytes) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        bytes
    );
    //prepend iv to ciphertext, iv can be public
    const result = new Uint8Array(iv.byteLength + ciphertext.byteLength);
    result.set(iv, 0);
    result.set(new Uint8Array(ciphertext), iv.byteLength);
    return result.buffer;
}

export async function decrypt(key, bytes) {
    const data = new Uint8Array(bytes);
    const iv = data.slice(0, 12);
    const ciphertext = data.slice(12);
    return await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        key,
        ciphertext
    );
}

function concatStrAndBytes(str,bytes) {
    const enc = new TextEncoder();
    const strBytes = enc.encode(str);
    const result = new Uint8Array(strBytes.length + bytes.byteLength);
    result.set(strBytes, 0);
    result.set(new Uint8Array(bytes), strBytes.length);
    return result.buffer;
}

export async function deriveFileKeys(masterBits, fileId, salt) {
    const enc = new TextEncoder();

    const masterKey = await crypto.subtle.importKey(
        "raw", masterBits, "HKDF", false, ["deriveKey"]
    );

    const [metaKey, contentKey] = await Promise.all([
        crypto.subtle.deriveKey(
            { name: "HKDF", hash: "SHA-256", salt, info: concatStrAndBytes("meta-key-v1:", fileId) },
            masterKey,
            { name: "AES-GCM", length: 256 },
            false,
            ["encrypt", "decrypt"]
        ),
        crypto.subtle.deriveKey(
            { name: "HKDF", hash: "SHA-256", salt, info: concatStrAndBytes("content-key-v1:", fileId) },
            masterKey,
            { name: "AES-GCM", length: 256 },
            false,
            ["encrypt", "decrypt"]
        )
    ])

    return { metaKey, contentKey };
}

export async function deriveFileNames(hmacSecret, fileId) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
        "raw",
        hmacSecret,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );

    const idBytes = typeof fileId === "string" ? enc.encode(fileId) : new Uint8Array(fileId);
    const concat = (a, b) => {
        const result = new Uint8Array(a.length + b.length);
        result.set(a, 0);
        result.set(b, a.length);
        return result;
    };

    const metadata = await crypto.subtle.sign(
        "HMAC",
        key,
        concat(idBytes, enc.encode("metadata"))
    );

    const content = await crypto.subtle.sign(
        "HMAC",
        key,
        concat(idBytes, enc.encode("content"))
    );

    return {
        metadataName: arrayBufferToHex(metadata),
        contentName: arrayBufferToHex(content)
    };
}

export async function deriveManifestName(hamcSecret) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
        "raw",
        hamcSecret,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    )
    return arrayBufferToHex(await crypto.subtle.sign(
        "HMAC",
        key,
        enc.encode("manifest")
    ))
}


//MAIN FUNCTIONS (not pure crypto)

export async function login(username, password) {
    const usernameHash = await generateUsername(username);

    const dataResponse = await fetch("/api/login", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ username: usernameHash })
    })

    const json = await dataResponse.json();
    if (dataResponse.status !== 200) {
        const message = json.message || "login failed";
        return {success:false, message: message};
    }

    const { encryptedPrivateKey, salt, iv, nonce } = json;

    const { manifestKey, masterBits, hmacSecret, authKey } = await deriveAllKeys(password, base64ToArrayBuffer(salt));


    const unwrappedPrivateKey = await unwrapPrivateKey(base64ToArrayBuffer(encryptedPrivateKey), authKey, base64ToArrayBuffer(iv));

    if (!unwrappedPrivateKey) {
        return {success:false, message: "invalid password"};
    }

    const nonceBytes = base64ToArrayBuffer(nonce);
    const signedNonce = arrayBufferToBase64(await signNonce(nonceBytes, unwrappedPrivateKey));


    const challengeResponse = await fetch("/api/nonce", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ username: usernameHash, signedNonce })
    })

    const decoder = new TextDecoder
    const challengeJson = await challengeResponse.json();
    if (challengeResponse.status === 200) {
        localStorage.setItem("username", username);
        localStorage.setItem("salt", salt);
        localStorage.setItem("manifestKey", await keyToBase64(manifestKey));
        localStorage.setItem("masterBits", arrayBufferToBase64(masterBits));
        localStorage.setItem("hmacSecret", arrayBufferToBase64(hmacSecret));
        return {success: true};
    } else {
        const message = challengeJson.message || "login failed";
        return {success:false, message: message};
    }
}
