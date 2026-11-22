function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLocaleLowerCase('vi')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function searchTokens(values) {
  return [...new Set(values.flatMap(value => normalizeSearchText(value).split(/\s+/).filter(Boolean)))];
}

function slugify(value) {
  return normalizeSearchText(value).replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

module.exports = { normalizeSearchText, searchTokens, slugify };
