import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { store } from '../../store';
import DirectorDashboard from '../pages/director/DirectorDashboard';

describe('DirectorDashboard', () => {
  it('renders without crashing', () => {
    render(
      <Provider store={store}>
        <MemoryRouter>
          <DirectorDashboard />
        </MemoryRouter>
      </Provider>
    );
  });
});