import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { store } from '../../store';
import ApprovalManagement from '../pages/chairman/ApprovalManagement';

describe('ApprovalManagement', () => {
  it('renders without crashing', () => {
    render(
      <Provider store={store}>
        <MemoryRouter>
          <ApprovalManagement />
        </MemoryRouter>
      </Provider>
    );
    expect(screen.getByText('Approvals')).toBeInTheDocument();
  });
});