import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { store } from '../../store';
import PurchaseOrdersPage from '../pages/departments/PurchaseOrdersPage';

describe('PurchaseOrdersPage', () => {
  it('renders without crashing', () => {
    render(
      <Provider store={store}>
        <MemoryRouter>
          <PurchaseOrdersPage />
        </MemoryRouter>
      </Provider>
    );
    expect(screen.getByText('Purchase Orders')).toBeInTheDocument();
  });
});