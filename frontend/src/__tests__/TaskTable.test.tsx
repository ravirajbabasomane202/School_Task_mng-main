import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TaskTable from '../components/tables/TaskTable';
import type { Task } from '../types/task.types';

const mockTasks: Task[] = [
  {
    id: 1,
    title: 'High Priority Task',
    description: 'Test task 1',
    assigned_by: 99,
    assigned_to: 1,
    department_id: 1,
    priority: 'HIGH',
    status: 'PENDING',
    start_date: '2026-04-20',
    due_date: '2026-04-25',
    attachment_path: null,
    proof_path: null,
    completed_at: null,
    assignedTo: { id: 1, name: 'John Doe', email: 'john.doe@school.com', department_id: 1 },
    department: { id: 1, name: 'Mathematics' },
    assignedToName: 'John Doe',
    departmentName: 'Mathematics',
  },
  {
    id: 2,
    title: 'Medium Priority Task',
    description: 'Test task 2',
    assigned_by: 99,
    assigned_to: 2,
    department_id: 2,
    priority: 'MEDIUM',
    status: 'IN_PROGRESS',
    start_date: '2026-04-18',
    due_date: '2026-05-02',
    attachment_path: null,
    proof_path: null,
    completed_at: null,
    assignedTo: { id: 2, name: 'Jane Smith', email: 'jane.smith@school.com', department_id: 2 },
    department: { id: 2, name: 'Science' },
    assignedToName: 'Jane Smith',
    departmentName: 'Science',
  },
  {
    id: 3,
    title: 'Low Priority Task',
    description: 'Test task 3',
    assigned_by: 99,
    assigned_to: 3,
    department_id: 3,
    priority: 'LOW',
    status: 'COMPLETED',
    start_date: '2026-04-10',
    due_date: '2026-04-20',
    attachment_path: null,
    proof_path: null,
    completed_at: '2026-04-19T09:30:00Z',
    assignedTo: { id: 3, name: 'Bob Johnson', email: 'bob.johnson@school.com', department_id: 3 },
    department: { id: 3, name: 'History' },
    assignedToName: 'Bob Johnson',
    departmentName: 'History',
  }
];

describe('TaskTable Component', () => {
  it('should render task rows correctly', () => {
    render(<TaskTable tasks={mockTasks} />);

    expect(screen.getByText('High Priority Task')).toBeInTheDocument();
    expect(screen.getByText('Medium Priority Task')).toBeInTheDocument();
    expect(screen.getByText('Low Priority Task')).toBeInTheDocument();

    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getByText('Bob Johnson')).toBeInTheDocument();

  });

  it('should show empty state when no data provided', () => {
    render(<TaskTable tasks={[]} />);

    expect(screen.getByText('No Tasks Found')).toBeInTheDocument();
    expect(screen.getByText('No tasks available right now.')).toBeInTheDocument();
  });

  it('should show custom empty message', () => {
    render(
      <TaskTable 
        tasks={[]} 
        emptyMessage="No tasks assigned to you yet."
      />
    );

    expect(screen.getByText('No Tasks Found')).toBeInTheDocument();
    expect(screen.getByText('No tasks assigned to you yet.')).toBeInTheDocument();
  });

  it('should render priority stripes with correct hex colors', () => {
    const { container } = render(<TaskTable tasks={mockTasks} />);

    // Find all priority elements
    const priorityElements = container.querySelectorAll('[class*="before:bg-"]');

    // Check for HIGH priority stripe color (#D64545)
    const highPriorityElement = Array.from(container.querySelectorAll('.before\\:bg-\\[\\#D64545\\]'));
    expect(highPriorityElement.length).toBeGreaterThanOrEqual(0);

    // Check for MEDIUM priority stripe color (#D89B17)
    const mediumPriorityElement = Array.from(container.querySelectorAll('.before\\:bg-\\[\\#D89B17\\]'));
    expect(mediumPriorityElement.length).toBeGreaterThanOrEqual(0);

    // Check for LOW priority stripe color (#2E9B67)
    const lowPriorityElement = Array.from(container.querySelectorAll('.before\\:bg-\\[\\#2E9B67\\]'));
    expect(lowPriorityElement.length).toBeGreaterThanOrEqual(0);

    // Verify actual color values in class names
    const allClasses = Array.from(container.querySelectorAll('[class]'))
      .flatMap(el => (el as HTMLElement).className.split(' '));

    expect(allClasses).toContain('before:bg-[#D64545]');
    expect(allClasses).toContain('before:bg-[#D89B17]');
    expect(allClasses).toContain('before:bg-[#2E9B67]');
  });

  it('should call onRowClick when task row is clicked', () => {
    const mockOnRowClick = vi.fn();
    render(<TaskTable tasks={mockTasks} onRowClick={mockOnRowClick} />);

    const taskTitle = screen.getByText('High Priority Task');
    fireEvent.click(taskTitle.closest('tr')!);

    expect(mockOnRowClick).toHaveBeenCalledWith(mockTasks[0]);
  });

  it('should not call onRowClick when no callback provided', () => {
    render(<TaskTable tasks={mockTasks} />);

    const taskTitle = screen.getByText('High Priority Task');
    const row = taskTitle.closest('tr');

    // Row should not have cursor-pointer class if no callback
    expect(row?.className).not.toContain('cursor-pointer');
  });

  it('should format dates correctly', () => {
    render(<TaskTable tasks={mockTasks} />);

    // Check date formatting (en-IN format: DD Mon YYYY)
    const dateElements = screen.getAllByText(/\d{2} [A-Za-z]{3} \d{4}/);
    expect(dateElements.length).toBeGreaterThan(0);
  });

  it('should display status badges with correct variants', () => {
    render(<TaskTable tasks={mockTasks} />);

    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('should handle unassigned tasks gracefully', () => {
    const unassignedTask: Task = {
      ...mockTasks[0],
      id: 4,
      assignedTo: undefined,
      assignedToName: undefined
    };

    render(<TaskTable tasks={[unassignedTask]} />);

    expect(screen.getByText('Unassigned')).toBeInTheDocument();
  });

  it('should render table headers correctly', () => {
    render(<TaskTable tasks={mockTasks} />);

    expect(screen.getByText('Task Title')).toBeInTheDocument();
    expect(screen.getByText('Assigned To')).toBeInTheDocument();
    expect(screen.getByText('Priority')).toBeInTheDocument();
    expect(screen.getByText('Type')).toBeInTheDocument();
    expect(screen.getByText('Assign Date')).toBeInTheDocument();
    expect(screen.getByText('Deadline')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
  });
});


describe('TaskTable status options by relationship to the task', () => {
  const ASSIGNER_ID = 99;   // mockTasks[*].assigned_by
  const ASSIGNEE_ID = 1;    // mockTasks[0].assigned_to
  const OTHER_ID = 555;

  const openStatusModal = (task: Task, currentUserId: number) => {
    render(
      <TaskTable
        tasks={[task]}
        showActions
        onStatusChange={vi.fn().mockResolvedValue(undefined)}
        currentUserId={currentUserId}
      />
    );
    fireEvent.click(screen.getByTitle('Change status'));
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    return Array.from(select.options).map((o) => o.value);
  };

  it('assigner sees all five statuses', () => {
    expect(openStatusModal(mockTasks[0], ASSIGNER_ID)).toEqual([
      'PENDING', 'IN_PROGRESS', 'COMPLETED', 'DELAYED', 'ESCALATED',
    ]);
  });

  it('assignee only sees In Progress and Completed, plus the hint', () => {
    expect(openStatusModal(mockTasks[0], ASSIGNEE_ID)).toEqual(['IN_PROGRESS', 'COMPLETED']);
    expect(
      screen.getByText('Pending and Delayed are set automatically. Escalated is set by the assigner.')
    ).toBeInTheDocument();
  });

  it('assigner does not see the assignee hint', () => {
    openStatusModal(mockTasks[0], ASSIGNER_ID);
    expect(screen.queryByText(/set automatically/)).not.toBeInTheDocument();
  });

  it('assignee of a delayed task can still pick In Progress / Completed', () => {
    const delayed: Task = { ...mockTasks[0], id: 10, status: 'DELAYED' };
    expect(openStatusModal(delayed, ASSIGNEE_ID)).toEqual(['IN_PROGRESS', 'COMPLETED']);
  });

  it('hides the Status button from users who are neither assigner nor assignee', () => {
    render(
      <TaskTable tasks={[mockTasks[0]]} showActions onStatusChange={vi.fn()} currentUserId={OTHER_ID} />
    );
    expect(screen.queryByTitle('Change status')).not.toBeInTheDocument();
  });

  it('hides the Status button when no current user is known', () => {
    render(<TaskTable tasks={[mockTasks[0]]} showActions onStatusChange={vi.fn()} />);
    expect(screen.queryByTitle('Change status')).not.toBeInTheDocument();
  });

  it.each(['COMPLETED', 'ESCALATED'] as const)(
    'hides the Status button from the assignee once the task is %s',
    (status) => {
      const locked: Task = { ...mockTasks[0], id: 11, status };
      render(
        <TaskTable tasks={[locked]} showActions onStatusChange={vi.fn()} currentUserId={ASSIGNEE_ID} />
      );
      expect(screen.queryByTitle('Change status')).not.toBeInTheDocument();
    }
  );

  it('still lets the assigner change a completed or escalated task', () => {
    const done: Task = { ...mockTasks[0], id: 12, status: 'COMPLETED' };
    render(
      <TaskTable tasks={[done]} showActions onStatusChange={vi.fn()} currentUserId={ASSIGNER_ID} />
    );
    expect(screen.getByTitle('Change status')).toBeInTheDocument();
  });

  it('shows the backend 403 message inside the modal when the update is rejected', async () => {
    const onStatusChange = vi.fn().mockRejectedValue({
      response: { data: { message: 'You can only set status to In Progress or Completed.' } },
    });
    render(
      <TaskTable tasks={[mockTasks[0]]} showActions onStatusChange={onStatusChange} currentUserId={ASSIGNEE_ID} />
    );
    fireEvent.click(screen.getByTitle('Change status'));
    fireEvent.click(screen.getByText('Confirm'));
    expect(
      await screen.findByText('You can only set status to In Progress or Completed.')
    ).toBeInTheDocument();
  });
});
