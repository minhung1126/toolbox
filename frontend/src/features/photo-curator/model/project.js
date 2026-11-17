export function exportProject({ photos, posts, unassignedIds }) {
  return {
    format: 'toolbox-photo-curator',
    version: 1,
    photos: photos.map(({ id, name, size, lastModified }) => ({ id, name, size, lastModified })),
    posts: posts.map(({ id, title, photoIds }) => ({ id, title, photoIds: [...photoIds] })),
    unassignedIds: [...unassignedIds],
  };
}

export function parseProject(text) {
  if (text.length > 2_000_000) throw new Error('專案超過 2 MB。');
  const value = JSON.parse(text);
  if (
    value?.format !== 'toolbox-photo-curator' ||
    value.version !== 1 ||
    !Array.isArray(value.photos) ||
    value.photos.length > 2000 ||
    !Array.isArray(value.posts) ||
    ![3, 6, 9].includes(value.posts.length) ||
    !Array.isArray(value.unassignedIds)
  )
    throw new Error('不支援的排版專案格式或版本。');
  const ids = new Set();
  for (const photo of value.photos) {
    if (
      !photo ||
      typeof photo.id !== 'string' ||
      !photo.id ||
      ids.has(photo.id) ||
      typeof photo.name !== 'string' ||
      !photo.name ||
      !Number.isSafeInteger(photo.size) ||
      photo.size < 0 ||
      !Number.isFinite(photo.lastModified)
    )
      throw new Error('照片對應格式不正確。');
    ids.add(photo.id);
  }
  const postIds = new Set();
  for (const post of value.posts) {
    if (
      !post ||
      typeof post.id !== 'string' ||
      postIds.has(post.id) ||
      typeof post.title !== 'string' ||
      !Array.isArray(post.photoIds)
    )
      throw new Error('貼文編排格式不正確。');
    postIds.add(post.id);
  }
  const assigned = [...value.posts.flatMap((post) => post.photoIds), ...value.unassignedIds];
  if (assigned.length !== ids.size || new Set(assigned).size !== ids.size || assigned.some((id) => !ids.has(id)))
    throw new Error('照片重複分配或遺漏。');
  // Strip any untrusted extra properties such as preview URLs and embedded file contents.
  return exportProject(value);
}

export function matchProjectFiles(photos, files) {
  const key = (item) => JSON.stringify([item.name, item.size, item.lastModified]);
  const counts = new Map();
  photos.forEach((photo) => counts.set(key(photo), (counts.get(key(photo)) || 0) + 1));
  return photos.map((photo) => {
    if (photo.file) return photo;
    const candidates = files.filter((file) => key(file) === key(photo));
    if (counts.get(key(photo)) !== 1 || candidates.length !== 1) return { ...photo, missing: true };
    return { ...photo, file: candidates[0], previewUrl: URL.createObjectURL(candidates[0]), missing: false };
  });
}
