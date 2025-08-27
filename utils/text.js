// utils/text.js
function wrapText(text, maxChars = 38) {
  if (!text) return "";
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  let lines = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length <= maxChars) {
      cur = (cur + " " + w).trim();
    } else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines.join("\\n");
}

function sanitizeForDrawtext(text) {
  return (text || "")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/"/g, '\\"');
}

module.exports = { wrapText, sanitizeForDrawtext };
