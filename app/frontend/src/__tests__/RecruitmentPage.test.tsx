import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { store } from '../../store';
import RecruitmentPage from '../pages/departments/RecruitmentPage';

describe('RecruitmentPage', () => {
  it('renders without crashing', () => {
    render(
      <Provider store={store}>
        <MemoryRouter>
          <RecruitmentPage />
        </MemoryRouter>
      </Provider>
    );
    expect(screen.getByText('Recruitment')).toBeInTheDocument();
  });
});