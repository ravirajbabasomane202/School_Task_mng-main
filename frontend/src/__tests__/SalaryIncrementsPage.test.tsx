import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { store } from '../../store';
import SalaryIncrementsPage from '../pages/departments/SalaryIncrementsPage';

describe('SalaryIncrementsPage', () => {
  it('renders without crashing', () => {
    render(
      <Provider store={store}>
        <MemoryRouter>
          <SalaryIncrementsPage />
        </MemoryRouter>
      </Provider>
    );
    expect(screen.getByText('Salary Increments')).toBeInTheDocument();
  });
});