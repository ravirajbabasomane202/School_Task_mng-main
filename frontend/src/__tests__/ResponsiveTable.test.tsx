import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ResponsiveTable from '../components/common/ResponsiveTable';

describe('ResponsiveTable', () => {
  it('scrolls horizontally inside its own wrapper', () => {
    render(
      <ResponsiveTable>
        <table>
          <tbody>
            <tr>
              <td>cell</td>
            </tr>
          </tbody>
        </table>
      </ResponsiveTable>
    );
    const wrapper = screen.getByTestId('responsive-table');
    expect(wrapper.className).toContain('overflow-x-auto');
    expect(wrapper).toContainElement(screen.getByText('cell'));
  });

  it('defaults the inner min width to 640 and honours the minWidth prop', () => {
    const { rerender } = render(
      <ResponsiveTable>
        <table />
      </ResponsiveTable>
    );
    expect((screen.getByTestId('responsive-table').firstChild as HTMLElement).style.minWidth).toBe('640px');

    rerender(
      <ResponsiveTable minWidth={900}>
        <table />
      </ResponsiveTable>
    );
    expect((screen.getByTestId('responsive-table').firstChild as HTMLElement).style.minWidth).toBe('900px');
  });
});
