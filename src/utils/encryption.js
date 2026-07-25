import CryptoJS from 'crypto-js';
import { WHATSAPP_PAYLOAD_ENCRYPTION_KEY } from './appConstants.js';

const KEY = WHATSAPP_PAYLOAD_ENCRYPTION_KEY;

export function encryptText(plaintext) {
  const iv = CryptoJS.lib.WordArray.random(16);
  const encrypted = CryptoJS.AES.encrypt(
    plaintext,
    CryptoJS.enc.Hex.parse(KEY),
    { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }
  );
  const ivHex = iv.toString(CryptoJS.enc.Hex);
  const ctHex = encrypted.ciphertext.toString(CryptoJS.enc.Hex);
  return ivHex + ':' + ctHex;
}

export function decryptText(cipher) {
  const [ivHex, ctHex] = cipher.split(':');
  const iv = CryptoJS.enc.Hex.parse(ivHex);
  const cipherParams = CryptoJS.lib.CipherParams.create({
    ciphertext: CryptoJS.enc.Hex.parse(ctHex),
  });
  const decrypted = CryptoJS.AES.decrypt(
    cipherParams,
    CryptoJS.enc.Hex.parse(KEY),
    { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }
  );
  return decrypted.toString(CryptoJS.enc.Utf8);
}
