/**
 * 为浏览器演示身份和提交请求生成随机标识。
 * HTTPS 优先使用原生 UUID；临时 IP／HTTP 访问使用同源 Web Crypto 随机字节，
 * 避免缺少 randomUUID 时中断初始化。此标识仅服务本地演示，不充当服务端凭证。
 */
export function createClientId(): string {
  if (typeof globalThis.crypto.randomUUID === "function") return globalThis.crypto.randomUUID();
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
