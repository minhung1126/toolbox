import JSZip from 'jszip';

export function generateChecklistText({ photos = [], posts = [], photoMap = new Map(), unassignedIds = [] }) {
  const lines = [
    '# Instagram 貼文三部曲發布對照表',
    `匯出時間：${new Date().toLocaleString()}`,
    `總照片數：${photos.length} 張`,
    '',
  ];

  posts.forEach((post, pIdx) => {
    const postPhotos = post.photoIds.map((id) => photoMap.get(id)).filter(Boolean);
    lines.push('========================================');
    lines.push(`【Post ${pIdx + 1}】${post.title}（共 ${postPhotos.length} 張）`);
    lines.push('========================================');
    postPhotos.forEach((p, idx) => {
      const coverTag = idx === 0 ? ' [★ 首圖 Cover]' : '';
      const orderNum = String(idx + 1).padStart(2, '0');
      lines.push(`  ${orderNum}. ${p.name}${coverTag}`);
    });
    lines.push(`建議 Hashtags: #Part${pIdx + 1} #Instagram #Daily #Story`);
    lines.push('');
  });

  if (unassignedIds.length > 0) {
    lines.push(`未分配備忘照片（共 ${unassignedIds.length} 張）：`);
    unassignedIds.forEach((id) => {
      const p = photoMap.get(id);
      if (p) lines.push(`  - ${p.name}`);
    });
    lines.push('');
  }

  return lines.join('\n');
}

export async function exportCuratedZip({ posts, photoMap, checklistContent }) {
  const zip = new JSZip();

  for (let pIdx = 0; pIdx < posts.length; pIdx += 1) {
    const post = posts[pIdx];
    const postIndex = pIdx + 1;
    const cleanTitle = post.title.replace(/[\\/:*?"<>|]/g, '_').trim();
    const folderName = `Post_${postIndex}_${cleanTitle}`;
    const folder = zip.folder(folderName);

    for (let i = 0; i < post.photoIds.length; i += 1) {
      const photo = photoMap.get(post.photoIds[i]);
      if (!photo || !photo.file) continue;

      const seq = String(i + 1).padStart(2, '0');
      const isCover = i === 0 ? '01_COVER_' : `${seq}_`;
      const fileName = `${isCover}${photo.name}`;

      folder.file(fileName, photo.file);
    }
  }

  if (checklistContent) {
    zip.file('貼文發布對照清單_Checklist.txt', checklistContent);
  }

  const content = await zip.generateAsync({ type: 'blob' });
  const downloadUrl = URL.createObjectURL(content);
  const anchor = document.createElement('a');
  anchor.href = downloadUrl;
  const timestamp = new Date().toISOString().slice(0, 10);
  anchor.download = `Instagram_三部曲貼文_${timestamp}.zip`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);
}
