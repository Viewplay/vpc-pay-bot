const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE58_MAP = (() => {
  const m = {};
  for (let i = 0; i < BASE58_ALPHABET.length; i++) m[BASE58_ALPHABET[i]] = i;
  return m;
})();

function base58Decode(str) {
  if (typeof str !== "string" || str.length === 0) return null;

  for (let i = 0; i < str.length; i++) {
    if (BASE58_MAP[str[i]] === undefined) return null;
  }

  let bytes = [0];
  for (let i = 0; i < str.length; i++) {
    const val = BASE58_MAP[str[i]];
    let carry = val;
    for (let j = 0; j < bytes.length; j++) {
      const x = bytes[j] * 58 + carry;
      bytes[j] = x & 0xff;
      carry = x >> 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  let leadingZeros = 0;
  for (let i = 0; i < str.length && str[i] === "1"; i++) leadingZeros++;
  for (let i = 0; i < leadingZeros; i++) bytes.push(0);

  bytes.reverse();
  return new Uint8Array(bytes);
}

export function isValidSolanaAddress(addr) {
  if (typeof addr !== "string") return false;
  const a = addr.trim();
  if (a.length < 32 || a.length > 44) return false;
  const decoded = base58Decode(a);
  return decoded && decoded.length === 32;
}
