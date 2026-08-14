import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { store } from '../../store';
import AssetManagementPage from '../pages/departments/AssetManagementPage';

describe('AssetManagementPage', () => {
  it('renders without crashing', () => {
    render(
      <Provider store={store}>
        <MemoryRouter>
          <AssetManagementPage />
        </MemoryRouter>
      </Provider>
    );
    expect(screen.getByText('Asset Management')).toBeInTheDocument();
  });
});