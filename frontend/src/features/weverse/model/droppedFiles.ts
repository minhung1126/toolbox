/** Directory readers return batches (often 100 entries); drain each reader fully. */
export async function readDroppedFiles(items?: DataTransferItemList, fallback?: FileList): Promise<File[]> {
  const files: File[] = [];
  async function visit(entry: FileSystemEntry): Promise<void> {
    if (entry.isFile) {
      files.push(await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject)));
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      while (true) {
        const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
        if (!batch.length) break;
        for (const child of batch) await visit(child);
      }
    }
  }
  for (const item of Array.from(items || [])) {
    const entry = item.webkitGetAsEntry?.();
    if (entry) await visit(entry);
    else {
      const file = item.getAsFile?.();
      if (file) files.push(file);
    }
  }
  return files.length ? files : Array.from(fallback || []);
}
