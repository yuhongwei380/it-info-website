export function isAllowedUrl(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 2048 || /[\u0000-\u001f\u007f]/.test(value)) return false;
  return !/^(?:javascript|data|vbscript):/i.test(value.trim());
}

export function safeUrl(value) {
  return isAllowedUrl(value) ? value.trim() : "#";
}
