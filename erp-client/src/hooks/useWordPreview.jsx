import { useState, useCallback } from 'react';
import WordPreviewModal from '../components/shared/WordPreviewModal';

// Wires up the document preview with minimal boilerplate at the call site:
//
//   const { showPreview, previewNode } = useWordPreview();
//   ...
//   <Button onClick={() => showPreview(buildDoc())}>Preview</Button>
//   {previewNode}
//
// `showPreview` takes the same spec object as downloadWordDoc, so preview and
// download always render from one builder.
export function useWordPreview() {
  const [doc, setDoc] = useState(null);
  const showPreview = useCallback((spec) => setDoc(spec), []);
  const closePreview = useCallback(() => setDoc(null), []);

  return {
    showPreview,
    closePreview,
    previewNode: <WordPreviewModal doc={doc} onClose={closePreview} />,
  };
}
