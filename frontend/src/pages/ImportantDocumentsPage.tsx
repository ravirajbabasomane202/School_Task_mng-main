import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FilePlus2, FileText, Pencil, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import PageContainer from '../components/common/PageContainer';
import ResponsiveTable from '../components/common/ResponsiveTable';
import { isChairmanLevel } from '../constants/roles';
import {
  deleteImportantDocument,
  downloadImportantDocument,
  getImportantDocuments,
  updateImportantDocument,
  uploadImportantDocument
} from '../services/importantDocumentService';
import type {
  ImportantDocument,
  ImportantDocumentDetails
} from '../types/importantDocument.types';
import { getApiErrorMessage } from '../utils/apiError';
import { useAppSelector } from '../store/hooks';

const ACCEPTED_TYPES = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png';
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const INITIAL_FORM: ImportantDocumentDetails = { name: '', description: '', category: '' };

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function ImportantDocumentsPage() {
  const user = useAppSelector((state) => state.auth.user);
  const canManage = isChairmanLevel(user?.role);
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDocument, setEditingDocument] = useState<ImportantDocument | null>(null);
  const [form, setForm] = useState<ImportantDocumentDetails>(INITIAL_FORM);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState('');

  const documentsQuery = useQuery({
    queryKey: ['important-documents'],
    queryFn: getImportantDocuments
  });

  const refreshDocuments = () => queryClient.invalidateQueries({ queryKey: ['important-documents'] });
  const uploadMutation = useMutation({
    mutationFn: uploadImportantDocument,
    onSuccess: () => {
      void refreshDocuments();
      closeModal();
      toast.success('Document uploaded');
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Failed to upload document'))
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: ImportantDocumentDetails }) =>
      updateImportantDocument(id, payload),
    onSuccess: () => {
      void refreshDocuments();
      closeModal();
      toast.success('Document details updated');
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Failed to update document'))
  });
  const deleteMutation = useMutation({
    mutationFn: deleteImportantDocument,
    onSuccess: () => {
      void refreshDocuments();
      toast.success('Document deleted');
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Failed to delete document'))
  });

  function closeModal() {
    setIsModalOpen(false);
    setEditingDocument(null);
    setForm(INITIAL_FORM);
    setSelectedFile(null);
    setFileError('');
  }

  function openUploadModal() {
    setEditingDocument(null);
    setForm(INITIAL_FORM);
    setSelectedFile(null);
    setFileError('');
    setIsModalOpen(true);
  }

  function openEditModal(document: ImportantDocument) {
    setEditingDocument(document);
    setForm({
      name: document.name,
      description: document.description ?? '',
      category: document.category
    });
    setSelectedFile(null);
    setFileError('');
    setIsModalOpen(true);
  }

  function handleFileChange(file: File | undefined) {
    setSelectedFile(null);
    setFileError('');
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
    setSelectedFile(file);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      category: form.category.trim()
    };
    if (!payload.name || !payload.category) {
      toast.error('Document name and category are required');
      return;
    }
    if (editingDocument) {
      updateMutation.mutate({ id: editingDocument.id, payload });
      return;
    }
    if (!selectedFile) {
      setFileError('Select a supported file before uploading.');
      return;
    }
    const uploadData = new FormData();
    uploadData.append('name', payload.name);
    uploadData.append('description', payload.description);
    uploadData.append('category', payload.category);
    uploadData.append('file', selectedFile);
    uploadMutation.mutate(uploadData);
  }

  const isSaving = uploadMutation.isPending || updateMutation.isPending;

  return (
    <PageContainer className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#1E293B]">Imp Documents</h1>
          <p className="mt-1 text-sm text-[#5B6E8C]">School documents shared with authenticated users</p>
        </div>
        {canManage && (
          <Button onClick={openUploadModal}>
            <FilePlus2 aria-hidden="true" size={16} />
            Upload Document
          </Button>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-[#EFF2F6] bg-white">
        {documentsQuery.isLoading ? (
          <div className="py-12 text-center text-sm text-[#8A99B0]">Loading documents…</div>
        ) : documentsQuery.isError ? (
          <div className="py-12 text-center text-sm text-red-600">
            {getApiErrorMessage(documentsQuery.error, 'Unable to load documents')}
          </div>
        ) : documentsQuery.data.length === 0 ? (
          <div className="py-12 text-center text-sm text-[#8A99B0]">No important documents uploaded yet.</div>
        ) : (
          <ResponsiveTable minWidth={980}>
            <table className="w-full text-sm">
              <thead className="border-b border-[#EFF2F6] bg-[#F8F9FC]">
                <tr>
                  {['Document Name', 'Description', 'Category', 'Uploaded By', 'Upload Date', 'File Type', 'File Size', 'Actions'].map((heading) => (
                    <th key={heading} className="px-4 py-3 text-left text-xs font-semibold text-[#8A99B0]">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F4F9]">
                {documentsQuery.data.map((document) => (
                  <tr className="transition hover:bg-[#F8F9FC]" key={document.id}>
                    <td className="px-4 py-3 font-medium text-[#1E293B]">
                      <span className="flex items-center gap-2">
                        <FileText aria-hidden="true" className="shrink-0 text-[#185FA5]" size={17} />
                        {document.name}
                      </span>
                    </td>
                    <td className="max-w-[240px] px-4 py-3 text-[#5B6E8C]">{document.description || '—'}</td>
                    <td className="px-4 py-3 text-[#5B6E8C]">{document.category}</td>
                    <td className="px-4 py-3 text-[#5B6E8C]">{document.uploaded_by}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-[#5B6E8C]">
                      {new Date(document.upload_date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-[#5B6E8C]">{document.file_type}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-[#5B6E8C]">{formatFileSize(document.file_size)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <button
                          aria-label={`Download ${document.name}`}
                          className="text-[#185FA5] transition hover:text-[#0C447C]"
                          onClick={() => void downloadImportantDocument(document.id, document.original_filename).catch((error: unknown) =>
                            toast.error(getApiErrorMessage(error, 'Failed to download document'))
                          )}
                          type="button"
                        >
                          <Download aria-hidden="true" size={17} />
                        </button>
                        {canManage && (
                          <>
                            <button
                              aria-label={`Edit ${document.name}`}
                              className="text-[#5B6E8C] transition hover:text-[#185FA5]"
                              onClick={() => openEditModal(document)}
                              type="button"
                            >
                              <Pencil aria-hidden="true" size={16} />
                            </button>
                            <button
                              aria-label={`Delete ${document.name}`}
                              className="text-red-600 transition hover:text-red-800"
                              onClick={() => {
                                if (globalThis.confirm(`Delete "${document.name}"?`)) {
                                  deleteMutation.mutate(document.id);
                                }
                              }}
                              type="button"
                            >
                              <Trash2 aria-hidden="true" size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ResponsiveTable>
        )}
      </div>

      {canManage && (
        <Modal
          isOpen={isModalOpen}
          onClose={closeModal}
          title={editingDocument ? 'Edit Document Details' : 'Upload Document'}
        >
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="mb-1 block text-xs font-medium text-[#5B6E8C]" htmlFor="document-name">Document Name *</label>
              <input
                autoComplete="off"
                className="w-full rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm focus:border-[#185FA5] focus:outline-none"
                id="document-name"
                maxLength={255}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                required
                value={form.name}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[#5B6E8C]" htmlFor="document-description">Description</label>
              <textarea
                className="w-full rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm focus:border-[#185FA5] focus:outline-none"
                id="document-description"
                maxLength={5000}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                rows={3}
                value={form.description}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[#5B6E8C]" htmlFor="document-category">Category *</label>
              <input
                className="w-full rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm focus:border-[#185FA5] focus:outline-none"
                id="document-category"
                maxLength={100}
                onChange={(event) => setForm({ ...form, category: event.target.value })}
                required
                value={form.category}
              />
            </div>
            {!editingDocument && (
              <div>
                <label className="mb-1 block text-xs font-medium text-[#5B6E8C]" htmlFor="document-file">Select File *</label>
                <input
                  accept={ACCEPTED_TYPES}
                  className="block w-full rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm text-[#5B6E8C] file:mr-3 file:rounded-md file:border-0 file:bg-[#F1F6FB] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[#185FA5]"
                  id="document-file"
                  onChange={(event) => handleFileChange(event.target.files?.[0])}
                  required
                  type="file"
                />
                <p className="mt-1 text-xs text-[#8A99B0]">PDF, Office documents, JPG or PNG. Maximum size: 10 MB.</p>
                {selectedFile && <p className="mt-1 text-xs text-[#5B6E8C]">{selectedFile.name} · {formatFileSize(selectedFile.size)}</p>}
                {fileError && <p className="mt-1 text-xs text-red-600" role="alert">{fileError}</p>}
              </div>
            )}
            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end [&>*]:w-full sm:[&>*]:w-auto">
              <Button onClick={closeModal} type="button" variant="ghost">Cancel</Button>
              <Button loading={isSaving} type="submit">{editingDocument ? 'Save Changes' : 'Upload Document'}</Button>
            </div>
          </form>
        </Modal>
      )}
    </PageContainer>
  );
}

export default ImportantDocumentsPage;
