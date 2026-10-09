import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

const PhotoCuratorSessionContext = createContext(null);

export const INITIAL_POSTS = [
  { id: 'post-1', title: 'Post 1', photoIds: [] },
  { id: 'post-2', title: 'Post 2', photoIds: [] },
  { id: 'post-3', title: 'Post 3', photoIds: [] },
];

export function arrangementSignature(photos, posts, unassignedIds) {
  return JSON.stringify({ photoIds: photos.map((photo) => photo.id), posts, unassignedIds });
}

// The authenticated app shell owns this session so switching tools keeps local files.
// Unmounting the shell on logout/account change releases them and their preview URLs.
export function PhotoCuratorSessionProvider({ children }) {
  const [photos, setPhotos] = useState([]);
  const [unassignedIds, setUnassignedIds] = useState([]);
  const [posts, setPosts] = useState(INITIAL_POSTS);
  const [previousArrangement, setPreviousArrangement] = useState(null);
  const [exportedSignature, setExportedSignature] = useState(null);
  const photosRef = useRef(photos);
  photosRef.current = photos;

  const signature = arrangementSignature(photos, posts, unassignedIds);
  const hasUnexportedWork = photos.length > 0 && (unassignedIds.length > 0 || signature !== exportedSignature);

  useEffect(() => {
    if (!hasUnexportedWork) return undefined;
    const warnBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [hasUnexportedWork]);

  useEffect(
    () => () => {
      photosRef.current.forEach((photo) => {
        if (photo.previewUrl) URL.revokeObjectURL(photo.previewUrl);
      });
    },
    []
  );

  return (
    <PhotoCuratorSessionContext.Provider
      value={{
        photos,
        setPhotos,
        unassignedIds,
        setUnassignedIds,
        posts,
        setPosts,
        previousArrangement,
        setPreviousArrangement,
        setExportedSignature,
        hasUnexportedWork,
      }}
    >
      {children}
    </PhotoCuratorSessionContext.Provider>
  );
}

export function usePhotoCuratorSession() {
  return useContext(PhotoCuratorSessionContext);
}
