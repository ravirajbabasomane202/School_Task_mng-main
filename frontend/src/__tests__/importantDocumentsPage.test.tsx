import { configureStore } from '@reduxjs/toolkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ImportantDocumentsPage from '../pages/ImportantDocumentsPage';
import * as service from '../services/importantDocumentService';
import type { DocumentFolder, ImportantDocument } from '../types/importantDocument.types';

vi.mock('../services/importantDocumentService', () => ({
  createDocumentFolder: vi.fn(),
  deleteDocumentFolder: vi.fn(),
  deleteImportantDocument: vi.fn(),
  downloadImportantDocument: vi.fn(),
  getDocumentFolders: vi.fn(),
  searchImportantDocuments: vi.fn(),
  updateDocumentFolder: vi.fn(),
  updateImportantDocument: vi.fn(),
  uploadImportantDocument: vi.fn()
}));
vi.mock('../services/userService', () => ({ getAllUsers: vi.fn().mockResolvedValue([]) }));

const folder = (id: number, name: string, parent: number | null, path: string[]): DocumentFolder => ({
  id, name, parent_id: parent, path, document_count: 1, total_document_count: 1, subfolder_count: 0, created_at: null
});
const folders = [
  folder(1, 'Academic Documents', null, ['Academic Documents']),
  folder(2, 'Academic Calendar', 1, ['Academic Documents', 'Academic Calendar'])
];
const doc = (id: number, name: string): ImportantDocument => ({
  id, name, description: null, category: 'Policy', original_filename: `${name}.pdf`, uploaded_by: 'Admin',
  uploaded_by_id: 1, upload_date: '2026-03-01T00:00:00Z', file_type: 'PDF', file_size: 100, folder_id: null, folder_path: [], visible_to_all: true
});

function renderPage(role = 'HR') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const store = configureStore({ reducer: { auth: () => ({ user: { id: 5, role } }) } });
  return render(
    <Provider store={store}><QueryClientProvider client={client}><MemoryRouter><ImportantDocumentsPage /></MemoryRouter></QueryClientProvider></Provider>
  );
}

describe('Important Documents folders and search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(service.getDocumentFolders).mockResolvedValue(folders);
    vi.mocked(service.searchImportantDocuments).mockImplementation(async (params) => ({
      documents: params?.q === 'zzz' ? [] : [doc(10, 'Fee Policy')], total: params?.q === 'zzz' ? 0 : 1, page: 1, pageSize: 25
    }));
  });

  it('navigates folders with breadcrumbs and loads that folder\'s documents', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Academic Documents/ }));
    await waitFor(() => expect(service.searchImportantDocuments).toHaveBeenCalledWith(expect.objectContaining({ folder_id: 1 })));
    const crumbs = screen.getByTestId('document-breadcrumb');
    expect(within(crumbs).getByText('Academic Documents')).toBeInTheDocument();

    fireEvent.click(await screen.findByRole('button', { name: /Academic Calendar/ }));
    await waitFor(() => expect(service.searchImportantDocuments).toHaveBeenCalledWith(expect.objectContaining({ folder_id: 2 })));
    expect(within(screen.getByTestId('document-breadcrumb')).getByText('Academic Calendar')).toBeInTheDocument();

    fireEvent.click(within(screen.getByTestId('document-breadcrumb')).getByRole('button', { name: 'Academic Documents' }));
    await waitFor(() => expect(service.searchImportantDocuments).toHaveBeenLastCalledWith(expect.objectContaining({ folder_id: 1 })));
    fireEvent.click(within(screen.getByTestId('document-breadcrumb')).getByRole('button', { name: 'Important Documents' }));
    await waitFor(() => expect(service.searchImportantDocuments).toHaveBeenLastCalledWith(expect.objectContaining({ folder_id: 'root' })));
  });

  it('searches across all folders, shows a no-results message and clears filters', async () => {
    renderPage();
    await screen.findByText('Fee Policy');
    fireEvent.change(screen.getByLabelText('Search documents', { selector: 'input' }), { target: { value: 'zzz' } });
    expect(await screen.findByTestId('documents-empty')).toHaveTextContent('No documents match your search or filters.');
    const searchCall = vi.mocked(service.searchImportantDocuments).mock.calls.at(-1)![0]!;
    expect(searchCall.q).toBe('zzz');
    expect(searchCall.folder_id).toBeUndefined();                      // search is not confined to the open folder
    fireEvent.click(screen.getByRole('button', { name: /Clear All Filters/ }));
    expect(await screen.findByText('Fee Policy')).toBeInTheDocument();
  });

  it('sends filter values to the server', async () => {
    renderPage();
    await screen.findByText('Fee Policy');
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    fireEvent.change(screen.getByLabelText('File Type'), { target: { value: 'PDF' } });
    fireEvent.change(screen.getByLabelText('Document Category'), { target: { value: 'Policy' } });
    fireEvent.change(screen.getByLabelText('Uploaded From'), { target: { value: '2026-01-01' } });
    await waitFor(() => expect(service.searchImportantDocuments).toHaveBeenLastCalledWith(
      expect.objectContaining({ file_type: 'PDF', category: 'Policy', date_from: '2026-01-01' })
    ));
  });

  it('hides folder and document management from non-managers and shows it to managers', async () => {
    const { unmount } = renderPage('HR');
    await screen.findByText('Fee Policy');
    expect(screen.queryByRole('button', { name: /New Folder/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Upload Document/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Rename folder/ })).toBeNull();
    unmount();
    renderPage('CHAIRMAN');
    await screen.findByText('Fee Policy');
    expect(screen.getByRole('button', { name: /New Folder/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Upload Document/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rename folder Academic Documents' })).toBeInTheDocument();
  });

  it('creates a folder inside the open folder and asks before deleting one', async () => {
    vi.mocked(service.createDocumentFolder).mockResolvedValue(folders[1]);
    vi.mocked(service.deleteDocumentFolder).mockResolvedValue();
    const confirmSpy = vi.spyOn(globalThis, 'confirm').mockReturnValue(false);
    renderPage('CHAIRMAN');
    fireEvent.click(await screen.findByText('Academic Documents'));
    await waitFor(() => expect(service.searchImportantDocuments).toHaveBeenCalledWith(expect.objectContaining({ folder_id: 1 })));
    fireEvent.click(screen.getByRole('button', { name: /New Folder/ }));
    fireEvent.change(await screen.findByLabelText('Folder Name *'), { target: { value: 'Policies' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Folder' }));
    await waitFor(() => expect(service.createDocumentFolder).toHaveBeenCalledWith('Policies', 1));

    fireEvent.click(await screen.findByRole('button', { name: 'Delete folder Academic Calendar' }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(service.deleteDocumentFolder).not.toHaveBeenCalled();      // cancelled -> nothing deleted
    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Delete folder Academic Calendar' }));
    await waitFor(() => expect(service.deleteDocumentFolder).toHaveBeenCalled());
    expect(vi.mocked(service.deleteDocumentFolder).mock.calls[0][0]).toBe(2);
    confirmSpy.mockRestore();
  });
});
