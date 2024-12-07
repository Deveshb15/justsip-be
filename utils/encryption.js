require('dotenv').config();
const crypto = require('crypto');

// Encryption key and IV should be stored securely in environment variables
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const IV_LENGTH = 16; // For AES, this is always 16

// Create a 32 byte key from any length string
function getKey(key) {
    return crypto.createHash('sha256').update(String(key)).digest('base64').substr(0, 32);
}

function encrypt(text) {
    if (!ENCRYPTION_KEY) throw new Error('Encryption key is required');
    const key = getKey(ENCRYPTION_KEY);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
    if (!ENCRYPTION_KEY) throw new Error('Encryption key is required');
    const key = getKey(ENCRYPTION_KEY);
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}

module.exports = {
    encrypt,
    decrypt
}; 