import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { store } from '../../store';
import LeaveRequestsPage from '../pages/departments/LeaveRequestsPage';

describe('LeaveRequestsPage', () => {
  it('renders without crashing', () => {
    render(
      <Provider store={store}>
        <MemoryRouter>
          <LeaveRequestsPage />
        </MemoryRouter>
      </Provider>
    );
    expect(screen.getByText('Leave Management')).toBeInTheDocument();
  });
});