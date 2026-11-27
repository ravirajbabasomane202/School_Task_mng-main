import { useEffect, useState, type FormEvent } from 'react';
import type {
  DocumentAudienceSelection,
  DocumentFolder,
  ImportantDocument
} from '../../types/importantDocument.types';
import Button from '../common/Button';
import Modal from '../common/Modal';
import DocumentAudiencePicker from './DocumentAudiencePicker';

export const ACCEPTED_TYPES = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png';
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export interface DocumentFormValues {
  name: string;
  description: string;
  category: string;
  folderId: number | null;
  audience: DocumentAudienceSelection;
  file: File | null;
}

interface DocumentFormModalProps {
  document: ImportantDocument | null;
  folders: DocumentFolder[];
  defaultFolderId: number | null;
  isOpen: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (values: DocumentFormValues) => void;
}

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

const inputClass =
  'w-full rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm focus:border-[#185FA5] focus:outline-none';

function initialValues(document: ImportantDocument | null, defaultFolderId: number | null): DocumentFormValues {
  return {
    name: document?.name ?? '',
    description: document?.description ?? '',
    category: document?.category ?? '',
    folderId: document ? (document.folder_id ?? null) : defaultFolderId,
    audience: document
      ? { visibleToAll: document.visible_to_all !== false, userIds: document.audience_user_ids ?? [] }
      : { visibleToAll: false, userIds: [] },
    file: null
  };
}

/** Upload (no document) or edit/move/re-audience (with document). */
function DocumentFormModal({
  document,
  folders,
  defaultFolderId,
  isOpen,
  isSaving,
  onClose,
  onSubmit
}: DocumentFormModalProps) {
  const [values, setValues] = useState<DocumentFormValues>(() => initialValues(document, defaultFolderId));
  const [fileError, setFileError] = useState('');
  const [audienceError, setAudienceError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setValues(initialValues(document, defaultFolderId));
      setFileError('');
      setAudienceError('');
    }
  }, [document, defaultFolderId, isOpen]);

  const handleFile = (file: File | undefined) => {
    setFileError('');
    setValues((current) => ({ ...current, file: null }));
    if (!file) return;
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!extension || !ACCEPTED_TYPES.split(',').includes(`.${extension}`)) {
      setFileError('Choose a supported document or image file.');
      return;
    }
    if (file.size === 0 || file.size > MAX_FILE_SIZE) {
      setFileError('File must be non-empty and 10 MB or smaller.');
      return;
    }
    setValues((current) => ({ ...current, file }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!document && !values.file) {
      setFileError('Select a supported file before uploading.');
      return;
    }
    if (!values.audience.visibleToAll && values.audience.userIds.length === 0) {
      setAudienceError('Select at least one user, or choose Select All.');
      return;
    }
    setAudienceError('');
    onSubmit({ ...values, name: values.name.trim(), description: values.description.trim(), category: values.category.trim() });
  };

  const sortedFolders = [...folders].sort((a, b) => a.path.join('/').localeCompare(b.path.join('/')));

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={document ? 'Edit Document' : 'Upload Document'}>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label className="mb-1 block text-xs font-medium text-[#5B6E8C]" htmlFor="document-name">Document Name *</label>
          <input autoComplete="off" className={inputClass} id="document-name" maxLength={255} onChange={(e) => setValues({ ...values, name: e.target.value })} required value={values.name} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[#5B6E8C]" htmlFor="document-description">Description</label>
          <textarea className={inputClass} id="document-description" maxLength={5000} onChange={(e) => setValues({ ...values, description: e.target.value })} rows={3} value={values.description} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[#5B6E8C]" htmlFor="document-category">Category *</label>
          <input className={inputClass} id="document-category" maxLength={100} onChange={(e) => setValues({ ...values, category: e.target.value })} required value={values.category} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[#5B6E8C]" htmlFor="document-folder">Folder</label>
          <select
            className={inputClass}
            id="document-folder"
            onChange={(e) => setValues({ ...values, folderId: e.target.value ? Number(e.target.value) : null })}
            value={values.folderId ?? ''}
          >
            <option value="">Important Documents (top level)</option>
            {sortedFolders.map((folder) => (
              <option key={folder.id} value={folder.id}>{folder.path.join(' › ')}</option>
            ))}
          </select>
        </div>
        {!document && (
          <div>
            <label className="mb-1 block text-xs font-medium text-[#5B6E8C]" htmlFor="document-file">Select File *</label>
            <input
              accept={ACCEPTED_TYPES}
              className="block w-full rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm text-[#5B6E8C] file:mr-3 file:rounded-md file:border-0 file:bg-[#F1F6FB] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[#185FA5]"
              id="document-file"
              onChange={(e) => handleFile(e.target.files?.[0])}
              required
              type="file"
            />
            <p className="mt-1 text-xs text-[#8A99B0]">PDF, Office documents, JPG or PNG. Maximum size: 10 MB.</p>
            {values.file && <p className="mt-1 text-xs text-[#5B6E8C]">{values.file.name} · {formatFileSize(values.file.size)}</p>}
            {fileError && <p className="mt-1 text-xs text-red-600" role="alert">{fileError}</p>}
          </div>
        )}
        <DocumentAudiencePicker
          error={audienceError}
          onChange={(audience) => { setAudienceError(''); setValues({ ...values, audience }); }}
          value={values.audience}
        />
        <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end [&>*]:w-full sm:[&>*]:w-auto">
          <Button onClick={onClose} type="button" variant="ghost">Cancel</Button>
          <Button loading={isSaving} type="submit">{document ? 'Save Changes' : 'Upload Document'}</Button>
        </div>
      </form>
    </Modal>
  );
}

export default DocumentFormModal;
