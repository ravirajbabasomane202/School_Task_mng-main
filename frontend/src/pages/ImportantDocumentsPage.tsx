import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronRight,
  Download,
  FilePlus2,
  FileText,
  Folder as FolderIcon,
  FolderPlus,
  Lock,
  Pencil,
  Search,
  Trash2,
  X
} from 'lucide-react';
import toast from 'react-hot-toast';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import PageContainer from '../components/common/PageContainer';
import ResponsiveTable from '../components/common/ResponsiveTable';
import DocumentFormModal, { type DocumentFormValues } from '../components/importantDocuments/DocumentFormModal';
import { isChairmanLevel } from '../constants/roles';
import {
  createDocumentFolder,
  deleteDocumentFolder,
  deleteImportantDocument,
  downloadImportantDocument,
  getDocumentFolders,
  searchImportantDocuments,
  updateDocumentFolder,
  updateImportantDocument,
  uploadImportantDocument
} from '../services/importantDocumentService';
import type { DocumentFolder, ImportantDocument } from '../types/importantDocument.types';
import { getApiErrorMessage } from '../utils/apiError';
import { useAppSelector } from '../store/hooks';

const PAGE_SIZE = 25;
const FILE_TYPES = ['PDF', 'DOC', 'DOCX', 'XLS', 'XLSX', 'PPT', 'PPTX', 'JPG', 'JPEG', 'PNG'];

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

const filterInputClass = 'w-full rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm focus:border-[#185FA5] focus:outline-none';

function ImportantDocumentsPage() {
  const user = useAppSelector((state) => state.auth.user);
  const canManage = isChairmanLevel(user?.role);
  const queryClient = useQueryClient();

  const [currentFolderId, setCurrentFolderId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [text, setText] = useState('');
  const [category, setCategory] = useState('');
  const [uploadedBy, setUploadedBy] = useState('');
  const [fileType, setFileType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [insideFolderOnly, setInsideFolderOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const [isDocumentModalOpen, setIsDocumentModalOpen] = useState(false);
  const [editingDocument, setEditingDocument] = useState<ImportantDocument | null>(null);
  const [folderModal, setFolderModal] = useState<{ mode: 'create' | 'rename'; folder?: DocumentFolder } | null>(null);
  const [folderName, setFolderName] = useState('');

  const q = useDebounced(text.trim());
  const debouncedCategory = useDebounced(category.trim());
  const debouncedUploader = useDebounced(uploadedBy.trim());
  const dateRangeInvalid = Boolean(dateFrom && dateTo && dateFrom > dateTo);
  const isSearching = Boolean(q || debouncedCategory || debouncedUploader || fileType || dateFrom || dateTo);

  useEffect(() => {
    setPage(1);
  }, [q, debouncedCategory, debouncedUploader, fileType, dateFrom, dateTo, currentFolderId, insideFolderOnly]);

  const foldersQuery = useQuery({ queryKey: ['document-folders'], queryFn: getDocumentFolders });
  const folders = useMemo(() => foldersQuery.data ?? [], [foldersQuery.data]);
  const folderById = useMemo(() => new Map(folders.map((folder) => [folder.id, folder])), [folders]);

  // If the open folder vanished (deleted/renamed away or no longer permitted) go back to the top.
  useEffect(() => {
    if (currentFolderId !== null && foldersQuery.isSuccess && !folderById.has(currentFolderId)) {
      setCurrentFolderId(null);
    }
  }, [currentFolderId, folderById, foldersQuery.isSuccess]);

  const breadcrumb = useMemo(() => {
    const trail: DocumentFolder[] = [];
    let cursor = currentFolderId !== null ? folderById.get(currentFolderId) : undefined;
    while (cursor && trail.length < 20) {
      trail.unshift(cursor);
      cursor = cursor.parent_id !== null ? folderById.get(cursor.parent_id) : undefined;
    }
    return trail;
  }, [currentFolderId, folderById]);

  const subfolders = useMemo(
    () => folders.filter((folder) => folder.parent_id === currentFolderId).sort((a, b) => a.name.localeCompare(b.name)),
    [folders, currentFolderId]
  );

  const searchParams = {
    q: q || undefined,
    category: debouncedCategory || undefined,
    uploaded_by: debouncedUploader || undefined,
    file_type: fileType || undefined,
    date_from: dateFrom || undefined,
    date_to: dateRangeInvalid ? undefined : dateTo || undefined,
    ...(isSearching
      ? insideFolderOnly && currentFolderId !== null
        ? { folder_id: currentFolderId, recursive: true }
        : {}
      : { folder_id: currentFolderId ?? ('root' as const) }),
    page,
    page_size: PAGE_SIZE
  };

  const documentsQuery = useQuery({
    queryKey: ['important-documents', searchParams],
    queryFn: () => searchImportantDocuments(searchParams),
    enabled: !dateRangeInvalid,
    placeholderData: (previous) => previous
  });
  const documents = documentsQuery.data?.documents ?? [];
  const total = documentsQuery.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['important-documents'] });
    void queryClient.invalidateQueries({ queryKey: ['document-folders'] });
  };

  const closeDocumentModal = () => {
    setIsDocumentModalOpen(false);
    setEditingDocument(null);
  };

  const uploadMutation = useMutation({
    mutationFn: uploadImportantDocument,
    onSuccess: () => { refresh(); closeDocumentModal(); toast.success('Document uploaded'); },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Failed to upload document'))
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Parameters<typeof updateImportantDocument>[1] }) =>
      updateImportantDocument(id, payload),
    onSuccess: () => { refresh(); closeDocumentModal(); toast.success('Document updated'); },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Failed to update document'))
  });
  const deleteMutation = useMutation({
    mutationFn: deleteImportantDocument,
    onSuccess: () => { refresh(); toast.success('Document deleted'); },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Failed to delete document'))
  });
  const folderMutation = useMutation({
    mutationFn: async () => {
      const name = folderName.trim();
      if (!name) throw new Error('Folder name is required');
      if (folderModal?.mode === 'rename' && folderModal.folder) {
        return updateDocumentFolder(folderModal.folder.id, { name });
      }
      return createDocumentFolder(name, currentFolderId);
    },
    onSuccess: () => {
      refresh();
      toast.success(folderModal?.mode === 'rename' ? 'Folder renamed' : 'Folder created');
      setFolderModal(null);
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Unable to save the folder'))
  });
  const deleteFolderMutation = useMutation({
    mutationFn: deleteDocumentFolder,
    onSuccess: () => { refresh(); toast.success('Folder deleted'); },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Unable to delete the folder'))
  });

  const handleDocumentSubmit = (values: DocumentFormValues) => {
    const audienceIds = values.audience.visibleToAll ? [] : values.audience.userIds;
    if (editingDocument) {
      updateMutation.mutate({
        id: editingDocument.id,
        payload: {
          name: values.name,
          description: values.description,
          category: values.category,
          folder_id: values.folderId,
          visible_to_all: values.audience.visibleToAll,
          audience_user_ids: audienceIds
        }
      });
      return;
    }
    const data = new FormData();
    data.append('name', values.name);
    data.append('description', values.description);
    data.append('category', values.category);
    if (values.folderId !== null) data.append('folder_id', String(values.folderId));
    data.append('visible_to_all', String(values.audience.visibleToAll));
    data.append('audience_user_ids', JSON.stringify(audienceIds));
    if (values.file) data.append('file', values.file);
    uploadMutation.mutate(data);
  };

  const openFolder = (id: number | null) => {
    setCurrentFolderId(id);
    setText('');
    setCategory('');
    setUploadedBy('');
    setFileType('');
    setDateFrom('');
    setDateTo('');
  };

  const clearFilters = () => {
    setText('');
    setCategory('');
    setUploadedBy('');
    setFileType('');
    setDateFrom('');
    setDateTo('');
    setInsideFolderOnly(false);
  };

  const handleDeleteFolder = (folder: DocumentFolder) => {
    if (globalThis.confirm(`Delete the folder "${folder.name}"? Only empty folders can be deleted.`)) {
      deleteFolderMutation.mutate(folder.id);
    }
  };

  const heading = isSearching ? 'Search results' : breadcrumb.length ? breadcrumb[breadcrumb.length - 1].name : 'Important Documents';
  const emptyMessage = isSearching
    ? 'No documents match your search or filters.'
    : currentFolderId !== null
      ? 'This folder has no documents.'
      : 'No documents at the top level.';

  return (
    <PageContainer className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#1E293B]">Imp Documents</h1>
          <p className="mt-1 text-sm text-[#5B6E8C]">School documents, organised in folders and shared with selected users</p>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => { setFolderName(''); setFolderModal({ mode: 'create' }); }} variant="ghost">
              <FolderPlus aria-hidden="true" size={16} />
              New Folder
            </Button>
            <Button onClick={() => { setEditingDocument(null); setIsDocumentModalOpen(true); }}>
              <FilePlus2 aria-hidden="true" size={16} />
              Upload Document
            </Button>
          </div>
        )}
      </div>

      <section aria-label="Search documents" className="space-y-3 rounded-xl border border-[#EFF2F6] bg-white p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8A99B0]" size={16} />
            <input
              aria-label="Search documents"
              className={`${filterInputClass} pl-9`}
              onChange={(e) => setText(e.target.value)}
              placeholder="Search by document name, title, folder, category or file name…"
              type="search"
              value={text}
            />
          </div>
          <Button onClick={() => setShowFilters((current) => !current)} size="sm" variant="ghost">
            {showFilters ? 'Hide Filters' : 'Filters'}
          </Button>
          {(isSearching || insideFolderOnly) && (
            <Button onClick={clearFilters} size="sm" variant="ghost">
              <X aria-hidden="true" size={14} />
              Clear All Filters
            </Button>
          )}
        </div>
        {showFilters && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="document-filters">
            <div>
              <label className="mb-1 block text-xs font-medium text-[#5B6E8C]" htmlFor="filter-category">Document Category</label>
              <input className={filterInputClass} id="filter-category" onChange={(e) => setCategory(e.target.value)} value={category} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[#5B6E8C]" htmlFor="filter-uploader">Uploaded By</label>
              <input className={filterInputClass} id="filter-uploader" onChange={(e) => setUploadedBy(e.target.value)} value={uploadedBy} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[#5B6E8C]" htmlFor="filter-type">File Type</label>
              <select className={filterInputClass} id="filter-type" onChange={(e) => setFileType(e.target.value)} value={fileType}>
                <option value="">All types</option>
                {FILE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[#5B6E8C]" htmlFor="filter-from">Uploaded From</label>
              <input className={filterInputClass} id="filter-from" onChange={(e) => setDateFrom(e.target.value)} type="date" value={dateFrom} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[#5B6E8C]" htmlFor="filter-to">Uploaded To</label>
              <input className={filterInputClass} id="filter-to" min={dateFrom || undefined} onChange={(e) => setDateTo(e.target.value)} type="date" value={dateTo} />
            </div>
            {currentFolderId !== null && (
              <label className="flex items-center gap-2 self-end pb-2 text-sm text-[#1E293B]">
                <input checked={insideFolderOnly} onChange={(e) => setInsideFolderOnly(e.target.checked)} type="checkbox" />
                Search only inside this folder
              </label>
            )}
          </div>
        )}
        {dateRangeInvalid && <p className="text-xs text-red-600" role="alert">“Uploaded From” must be on or before “Uploaded To”.</p>}
      </section>

      <nav aria-label="Folder path" className="flex flex-wrap items-center gap-1 text-sm" data-testid="document-breadcrumb">
        <button
          className={`rounded px-1 ${currentFolderId === null && !isSearching ? 'font-semibold text-[#1E293B]' : 'text-[#185FA5] hover:underline'}`}
          onClick={() => openFolder(null)}
          type="button"
        >
          Important Documents
        </button>
        {breadcrumb.map((folder, index) => (
          <span className="flex items-center gap-1" key={folder.id}>
            <ChevronRight aria-hidden="true" className="text-[#8A99B0]" size={14} />
            <button
              className={`rounded px-1 ${index === breadcrumb.length - 1 ? 'font-semibold text-[#1E293B]' : 'text-[#185FA5] hover:underline'}`}
              onClick={() => openFolder(folder.id)}
              type="button"
            >
              {folder.name}
            </button>
          </span>
        ))}
        {isSearching && <span className="ml-2 text-xs text-[#8A99B0]">(showing search results{insideFolderOnly && currentFolderId !== null ? ' in this folder' : ' across all folders'})</span>}
      </nav>

      {!isSearching && (foldersQuery.isLoading || subfolders.length > 0) && (
        <section aria-label="Folders" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {foldersQuery.isLoading ? (
            <p className="text-sm text-[#8A99B0]">Loading folders…</p>
          ) : (
            subfolders.map((folder) => (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-[#EFF2F6] bg-white p-3" key={folder.id}>
                <button
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  onClick={() => openFolder(folder.id)}
                  type="button"
                >
                  <FolderIcon aria-hidden="true" className="shrink-0 text-[#185FA5]" size={22} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-[#1E293B]">{folder.name}</span>
                    <span className="block text-xs text-[#8A99B0]">
                      {folder.total_document_count} document{folder.total_document_count === 1 ? '' : 's'}
                      {folder.subfolder_count ? ` · ${folder.subfolder_count} subfolder${folder.subfolder_count === 1 ? '' : 's'}` : ''}
                    </span>
                  </span>
                </button>
                {canManage && (
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      aria-label={`Rename folder ${folder.name}`}
                      className="text-[#5B6E8C] hover:text-[#185FA5]"
                      onClick={() => { setFolderName(folder.name); setFolderModal({ mode: 'rename', folder }); }}
                      type="button"
                    >
                      <Pencil aria-hidden="true" size={15} />
                    </button>
                    <button
                      aria-label={`Delete folder ${folder.name}`}
                      className="text-red-600 hover:text-red-800"
                      onClick={() => handleDeleteFolder(folder)}
                      type="button"
                    >
                      <Trash2 aria-hidden="true" size={15} />
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </section>
      )}

      <div className="overflow-hidden rounded-xl border border-[#EFF2F6] bg-white">
        <h2 className="border-b border-[#EFF2F6] px-4 py-3 text-sm font-semibold text-[#1E293B]">
          {heading}
          {documentsQuery.data ? <span className="ml-2 font-normal text-[#8A99B0]">({total})</span> : null}
        </h2>
        {documentsQuery.isLoading ? (
          <div className="py-12 text-center text-sm text-[#8A99B0]">Loading documents…</div>
        ) : documentsQuery.isError ? (
          <div className="py-12 text-center text-sm text-red-600">
            {getApiErrorMessage(documentsQuery.error, 'Unable to load documents')}
          </div>
        ) : documents.length === 0 ? (
          <div className="py-12 text-center text-sm text-[#8A99B0]" data-testid="documents-empty">{emptyMessage}</div>
        ) : (
          <ResponsiveTable minWidth={1040}>
            <table className="w-full text-sm">
              <thead className="border-b border-[#EFF2F6] bg-[#F8F9FC]">
                <tr>
                  {['Document Name', 'Description', 'Category', 'Folder', 'Uploaded By', 'Upload Date', 'File Type', 'File Size', 'Actions'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[#8A99B0]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F4F9]">
                {documents.map((document) => (
                  <tr className="transition hover:bg-[#F8F9FC]" key={document.id}>
                    <td className="px-4 py-3 font-medium text-[#1E293B]">
                      <span className="flex items-center gap-2">
                        <FileText aria-hidden="true" className="shrink-0 text-[#185FA5]" size={17} />
                        {document.name}
                        {canManage && document.visible_to_all === false && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700"
                            title={`Visible to ${document.audience_user_ids?.length ?? 0} selected user(s) plus managers and the uploader`}
                          >
                            <Lock aria-hidden="true" size={10} />
                            {document.audience_user_ids?.length ?? 0} users
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="max-w-[240px] px-4 py-3 text-[#5B6E8C]">{document.description || '—'}</td>
                    <td className="px-4 py-3 text-[#5B6E8C]">{document.category}</td>
                    <td className="px-4 py-3 text-[#5B6E8C]">
                      {document.folder_path?.length ? (
                        <button className="text-left text-[#185FA5] hover:underline" onClick={() => openFolder(document.folder_id ?? null)} type="button">
                          {document.folder_path.join(' › ')}
                        </button>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-[#5B6E8C]">{document.uploaded_by}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-[#5B6E8C]">{new Date(document.upload_date).toLocaleDateString()}</td>
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
                              onClick={() => { setEditingDocument(document); setIsDocumentModalOpen(true); }}
                              type="button"
                            >
                              <Pencil aria-hidden="true" size={16} />
                            </button>
                            <button
                              aria-label={`Delete ${document.name}`}
                              className="text-red-600 transition hover:text-red-800"
                              onClick={() => {
                                if (globalThis.confirm(`Delete "${document.name}"?`)) deleteMutation.mutate(document.id);
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
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-[#EFF2F6] px-4 py-3 text-sm text-[#5B6E8C]">
            <span>Page {page} of {pageCount}</span>
            <div className="flex gap-2">
              <Button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} size="sm" variant="ghost">Previous</Button>
              <Button disabled={page >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))} size="sm" variant="ghost">Next</Button>
            </div>
          </div>
        )}
      </div>

      {canManage && (
        <>
          <DocumentFormModal
            defaultFolderId={currentFolderId}
            document={editingDocument}
            folders={folders}
            isOpen={isDocumentModalOpen}
            isSaving={uploadMutation.isPending || updateMutation.isPending}
            onClose={closeDocumentModal}
            onSubmit={handleDocumentSubmit}
          />
          <Modal
            isOpen={Boolean(folderModal)}
            onClose={() => setFolderModal(null)}
            title={folderModal?.mode === 'rename' ? 'Rename Folder' : currentFolderId !== null ? 'New Subfolder' : 'New Folder'}
          >
            <form
              className="space-y-4"
              onSubmit={(e) => { e.preventDefault(); folderMutation.mutate(); }}
            >
              {folderModal?.mode === 'create' && (
                <p className="text-xs text-[#8A99B0]">
                  Created in: {breadcrumb.length ? ['Important Documents', ...breadcrumb.map((f) => f.name)].join(' › ') : 'Important Documents'}
                </p>
              )}
              <div>
                <label className="mb-1 block text-xs font-medium text-[#5B6E8C]" htmlFor="folder-name">Folder Name *</label>
                <input
                  autoComplete="off"
                  className={filterInputClass}
                  id="folder-name"
                  maxLength={150}
                  onChange={(e) => setFolderName(e.target.value)}
                  required
                  value={folderName}
                />
              </div>
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end [&>*]:w-full sm:[&>*]:w-auto">
                <Button onClick={() => setFolderModal(null)} type="button" variant="ghost">Cancel</Button>
                <Button disabled={!folderName.trim()} loading={folderMutation.isPending} type="submit">
                  {folderModal?.mode === 'rename' ? 'Save' : 'Create Folder'}
                </Button>
              </div>
            </form>
          </Modal>
        </>
      )}
    </PageContainer>
  );
}

export default ImportantDocumentsPage;
