import db from "./db.js";
import crypto from "crypto";

const randomString = (len) =>
    Array.from(crypto.getRandomValues(new Uint8Array(len)))
        .map((b) => "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[b % 36])
        .join("");

const isValidCode = (value) => /^[A-Za-z0-9]{8}$/.test(value);

export function generateInviteCode(code) {
    if (code && isValidCode(code)) {
        code = code.toUpperCase();
    } else {
        code = randomString(8);
    }

    const stmt = db.prepare("INSERT INTO invites (code, created_at) VALUES (?, ?)");
    stmt.run(code, Date.now());

    return code;
}

const argCode = process.argv[2];
const inviteCode = generateInviteCode(argCode);
console.log(inviteCode);