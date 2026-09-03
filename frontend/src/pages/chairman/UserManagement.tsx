import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import UserTable from '../../components/tables/UserTable';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import SelectWithOther from '../../components/common/SelectWithOther';
import { ROLE_LABELS, TASK_ASSIGNABLE_ROLES } from '../../constants/roles';
import { createDepartment, getAllDepartments } from '../../services/departmentService';
import { createRole, getAllRoles } from '../../services/roleService';
import api from '../../services/api';
import type { User } from '../../types/user.types';

interface AddUserForm {
  name: string;
  email: string;
  role: string;
  department_id: number | null;
  password: string;
}

interface EditUserForm {
  name: string;
  email: string;
  role: string;
  department_id: number | null;
  password?: string;
}

interface ApiResponse<T> {
  data: T;
  message: string;
  success: boolean;
}

const UserManagement: React.FC = () => {
  const queryClient = useQueryClient();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeactivateModalOpen, setIsDeactivateModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [addForm, setAddForm] = useState<AddUserForm>({
    name: '',
    email: '',
    role: '',
    department_id: null,
    password: ''
  });
  const [editForm, setEditForm] = useState<EditUserForm>({
    name: '',
    email: '',
    role: '',
    department_id: null
  });
  const [addErrors, setAddErrors] = useState<Record<string, string>>({});
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});

  const { data: users, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const response = await api.get<ApiResponse<User[]>>('/users');
      return response.data.data;
    }
  });

  const { data: departments } = useQuery({
    queryKey: ['departments'],
    queryFn: getAllDepartments
  });

  const { data: customRoles } = useQuery({
    queryKey: ['roles'],
    queryFn: getAllRoles
  });

  // Built-in roles (drive permissions/routing) plus any custom roles added
  // via the "Other" option, deduplicated by value.
  const roleOptions = useMemo(() => {
    const builtInNames = new Set<string>(TASK_ASSIGNABLE_ROLES);
    const builtIn = TASK_ASSIGNABLE_ROLES.map((role) => ({ label: ROLE_LABELS[role], value: role }));
    const custom = (customRoles ?? [])
      .filter((role) => !builtInNames.has(role.name))
      .map((role) => ({ label: role.name, value: role.name }));
    return [...builtIn, ...custom];
  }, [customRoles]);

  const departmentOptions = useMemo(
    () => (departments ?? []).map((department) => ({ label: department.name, value: String(department.id) })),
    [departments]
  );

  const handleCreateRole = async (name: string) => {
    const role = await createRole(name);
    void queryClient.invalidateQueries({ queryKey: ['roles'] });
    return { label: role.name, value: role.name };
  };

  const handleCreateDepartment = async (name: string) => {
    const department = await createDepartment(name);
    void queryClient.invalidateQueries({ queryKey: ['departments'] });
    return { label: department.name, value: String(department.id) };
  };

  const addUserMutation = useMutation({
    mutationFn: async (userData: AddUserForm) => {
      const response = await api.post('/users', userData);
      return response.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      setIsAddModalOpen(false);
      setAddForm({ name: '', email: '', role: '', department_id: null, password: '' });
      setAddErrors({});
      toast.success('User added successfully');
    },
    onError: (error: any) => {
      if (error.response?.data?.errors) {
        setAddErrors(error.response.data.errors);
      } else {
        toast.error('Failed to add user');
      }
    }
  });

  const editUserMutation = useMutation({
    mutationFn: async ({ id, userData }: { id: number; userData: EditUserForm }) => {
      const response = await api.put(`/users/${id}`, userData);
      return response.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      setIsEditModalOpen(false);
      setSelectedUser(null);
      setEditErrors({});
      toast.success('User updated successfully');
    },
    onError: (error: any) => {
      if (error.response?.data?.errors) {
        setEditErrors(error.response.data.errors);
      } else {
        toast.error('Failed to update user');
      }
    }
  });

  const deactivateUserMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/users/${id}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      setIsDeactivateModalOpen(false);
      setSelectedUser(null);
      toast.success('User deactivated successfully');
    },
    onError: () => {
      toast.error('Failed to deactivate user');
    }
  });

  const handleAddUser = () => {
    addUserMutation.mutate(addForm);
  };

  const handleEditUser = () => {
    if (selectedUser) {
      editUserMutation.mutate({ id: selectedUser.id, userData: editForm });
    }
  };

  const handleDeactivateUser = () => {
    if (selectedUser) {
      deactivateUserMutation.mutate(selectedUser.id);
    }
  };

  const openEditModal = (user: User) => {
    setSelectedUser(user);
    setEditForm({
      name: user.name,
      email: user.email,
      role: user.role,
      department_id: user.department_id
    });
    setIsEditModalOpen(true);
  };

  const openDeactivateModal = (user: User) => {
    setSelectedUser(user);
    setIsDeactivateModalOpen(true);
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">User Management</h1>
        <Button onClick={() => setIsAddModalOpen(true)}>Add new user</Button>
      </div>

      <UserTable
        users={users || []}
        onEdit={openEditModal}
        onDeactivate={openDeactivateModal}
      />

      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add New User"
        footer={
          <div className="flex justify-end space-x-2">
            <Button variant="ghost" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddUser} loading={addUserMutation.isPending}>
              Add User
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Full Name</label>
            <input
              type="text"
              value={addForm.name}
              onChange={(event) => setAddForm({ ...addForm, name: event.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
            {addErrors.name && <p className="mt-1 text-sm text-red-600">{addErrors.name}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Email</label>
            <input
              type="email"
              value={addForm.email}
              onChange={(event) => setAddForm({ ...addForm, email: event.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
            {addErrors.email && <p className="mt-1 text-sm text-red-600">{addErrors.email}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Role</label>
            <SelectWithOther
              error={addErrors.role}
              inputPlaceholder="Enter new role"
              label="Role"
              onChange={(value) => setAddForm({ ...addForm, role: value })}
              onCreate={handleCreateRole}
              options={roleOptions}
              saveLabel="Save Role"
              selectPlaceholder="Select Role"
              value={addForm.role}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Department</label>
            <SelectWithOther
              error={addErrors.department_id}
              inputPlaceholder="Enter Department"
              label="Department"
              onChange={(value) =>
                setAddForm({ ...addForm, department_id: value ? Number.parseInt(value, 10) : null })
              }
              onCreate={handleCreateDepartment}
              options={departmentOptions}
              saveLabel="Save Department"
              selectPlaceholder="Select Department"
              value={addForm.department_id ? String(addForm.department_id) : ''}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Temporary Password</label>
            <input
              type="password"
              value={addForm.password}
              onChange={(event) => setAddForm({ ...addForm, password: event.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
            {addErrors.password && (
              <p className="mt-1 text-sm text-red-600">{addErrors.password}</p>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit User"
        footer={
          <div className="flex justify-end space-x-2">
            <Button variant="ghost" onClick={() => setIsEditModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEditUser} loading={editUserMutation.isPending}>
              Update User
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Full Name</label>
            <input
              type="text"
              value={editForm.name}
              onChange={(event) => setEditForm({ ...editForm, name: event.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
            {editErrors.name && <p className="mt-1 text-sm text-red-600">{editErrors.name}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Email</label>
            <input
              type="email"
              value={editForm.email}
              onChange={(event) => setEditForm({ ...editForm, email: event.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
            {editErrors.email && <p className="mt-1 text-sm text-red-600">{editErrors.email}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Role</label>
            <SelectWithOther
              error={editErrors.role}
              inputPlaceholder="Enter new role"
              label="Role"
              onChange={(value) => setEditForm({ ...editForm, role: value })}
              onCreate={handleCreateRole}
              options={roleOptions}
              saveLabel="Save Role"
              selectPlaceholder="Select Role"
              value={editForm.role}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Department</label>
            <SelectWithOther
              error={editErrors.department_id}
              inputPlaceholder="Enter Department"
              label="Department"
              onChange={(value) =>
                setEditForm({ ...editForm, department_id: value ? Number.parseInt(value, 10) : null })
              }
              onCreate={handleCreateDepartment}
              options={departmentOptions}
              saveLabel="Save Department"
              selectPlaceholder="Select Department"
              value={editForm.department_id ? String(editForm.department_id) : ''}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              New Password (optional)
            </label>
            <input
              type="password"
              value={editForm.password || ''}
              onChange={(event) => setEditForm({ ...editForm, password: event.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isDeactivateModalOpen}
        onClose={() => setIsDeactivateModalOpen(false)}
        title="Deactivate User"
        footer={
          <div className="flex justify-end space-x-2">
            <Button variant="ghost" onClick={() => setIsDeactivateModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleDeactivateUser}
              variant="danger"
              loading={deactivateUserMutation.isPending}
            >
              Deactivate
            </Button>
          </div>
        }
      >
        <p>
          Are you sure you want to deactivate {selectedUser?.name}? They will lose access
          immediately.
        </p>
      </Modal>
    </div>
  );
};

export default UserManagement;
