import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Trash2, UserPlus, UserMinus, KeyRound, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface User {
  id: string;
  email: string;
  created_at: string;
  roles: string[];
}

export function UserManagement() {
  return <UserManagementInner />;
}

function ChangeMyPassword() {
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = async () => {
    if (newPw.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    if (newPw !== confirmPw) { toast.error("Passwords do not match"); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPw });
      if (error) throw error;
      toast.success("Password updated successfully");
      setNewPw("");
      setConfirmPw("");
    } catch (err: any) {
      toast.error(err.message || "Failed to update password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md space-y-4">
      <p className="text-sm text-muted-foreground">Change the password for your currently logged-in account.</p>
      <div className="space-y-2">
        <Label htmlFor="my-new-pw">New Password</Label>
        <Input id="my-new-pw" type="password" placeholder="Min 6 characters" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="my-confirm-pw">Confirm Password</Label>
        <Input id="my-confirm-pw" type="password" placeholder="Re-enter password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} />
      </div>
      <Button onClick={handleChange} disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <KeyRound className="h-4 w-4 mr-2" />}
        Update My Password
      </Button>
    </div>
  );
}

function UserManagementInner() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [showAddUser, setShowAddUser] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState<string | null>(null);
  const [addForm, setAddForm] = useState({ email: "", password: "", role: "viewer" });
  const [newPassword, setNewPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const callManageUser = async (body: Record<string, any>) => {
    const { data, error } = await supabase.functions.invoke("manage-user", { body });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const data = await callManageUser({ action: "list_users" });
      setUsers(data.users || []);
    } catch (error: any) {
      console.error("Error fetching users:", error);
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async () => {
    if (!addForm.email || !addForm.password) {
      toast.error("Email and password are required");
      return;
    }
    if (addForm.password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    try {
      setSubmitting(true);
      await callManageUser({
        action: "create_user",
        email: addForm.email,
        password: addForm.password,
        role: addForm.role,
      });
      toast.success(`User ${addForm.email} created with ${addForm.role} role`);
      setShowAddUser(false);
      setAddForm({ email: "", password: "", role: "viewer" });
      fetchUsers();
    } catch (error: any) {
      toast.error(error.message || "Failed to create user");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async () => {
    if (!showResetPassword || !newPassword) return;
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    try {
      setSubmitting(true);
      await callManageUser({
        action: "reset_password",
        user_id: showResetPassword,
        new_password: newPassword,
      });
      toast.success("Password updated successfully");
      setShowResetPassword(null);
      setNewPassword("");
    } catch (error: any) {
      toast.error(error.message || "Failed to reset password");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleRole = async (userId: string, role: "admin" | "viewer" | "superadmin", hasRole: boolean) => {
    try {
      if (hasRole) {
        const { error } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", userId)
          .eq("role", role);
        if (error) throw error;
        toast.success(`Removed ${role} role`);
      } else {
        const { error } = await supabase
          .from("user_roles")
          .insert([{ user_id: userId, role }]);
        if (error) throw error;
        toast.success(`Added ${role} role`);
      }
      fetchUsers();
    } catch (error: any) {
      toast.error("Failed to update role");
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteUserId) return;
    try {
      await callManageUser({ action: "delete_user", user_id: deleteUserId });
      toast.success("User deleted successfully");
      setDeleteUserId(null);
      fetchUsers();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete user");
    }
  };

  const resetPasswordUser = users.find((u) => u.id === showResetPassword);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>User Management</CardTitle>
          <CardDescription>Manage user accounts, permissions and passwords</CardDescription>
        </div>
        <Button onClick={() => setShowAddUser(true)} size="sm">
          <UserPlus className="h-4 w-4 mr-2" />
          Add User
        </Button>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="my-password">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="my-password">My Password</TabsTrigger>
            <TabsTrigger value="permissions">Permissions</TabsTrigger>
            <TabsTrigger value="deletion">User Deletion</TabsTrigger>
          </TabsList>

          <TabsContent value="my-password" className="mt-4">
            <ChangeMyPassword />
          </TabsContent>

          <TabsContent value="permissions" className="mt-4">
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Roles</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                      </TableCell>
                    </TableRow>
                  ) : users.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center">No users found</TableCell>
                    </TableRow>
                  ) : (
                    users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.email}</TableCell>
                        <TableCell>
                          <div className="flex gap-2 flex-wrap">
                            {user.roles.map((role) => (
                              <Badge key={role} variant="secondary">{role}</Badge>
                            ))}
                            {user.roles.length === 0 && (
                              <span className="text-sm text-muted-foreground">No roles</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-2 justify-end flex-wrap">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setShowResetPassword(user.id)}
                            >
                              <KeyRound className="h-4 w-4 mr-1" />
                              Password
                            </Button>
                            {(["superadmin", "admin", "viewer"] as const).map((role) => (
                              <Button
                                key={role}
                                variant="outline"
                                size="sm"
                                onClick={() => handleToggleRole(user.id, role, user.roles.includes(role))}
                              >
                                {user.roles.includes(role) ? (
                                  <UserMinus className="h-4 w-4 mr-1" />
                                ) : (
                                  <UserPlus className="h-4 w-4 mr-1" />
                                )}
                                {role.charAt(0).toUpperCase() + role.slice(1)}
                              </Button>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="deletion" className="mt-4">
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Roles</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                      </TableCell>
                    </TableRow>
                  ) : users.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center">No users found</TableCell>
                    </TableRow>
                  ) : (
                    users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.email}</TableCell>
                        <TableCell>
                          <div className="flex gap-2 flex-wrap">
                            {user.roles.map((role) => (
                              <Badge key={role} variant="secondary">{role}</Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setDeleteUserId(user.id)}
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            Delete
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>

        {/* Add User Dialog */}
        <Dialog open={showAddUser} onOpenChange={setShowAddUser}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New User</DialogTitle>
              <DialogDescription>Create a new user account with a role.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="new-email">Email</Label>
                <Input
                  id="new-email"
                  type="email"
                  placeholder="user@example.com"
                  value={addForm.email}
                  onChange={(e) => setAddForm((p) => ({ ...p, email: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password">Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder="Min 6 characters"
                  value={addForm.password}
                  onChange={(e) => setAddForm((p) => ({ ...p, password: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-role">Role</Label>
                <Select value={addForm.role} onValueChange={(v) => setAddForm((p) => ({ ...p, role: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="viewer">Viewer</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="superadmin">Superadmin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddUser(false)}>Cancel</Button>
              <Button onClick={handleAddUser} disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Create User
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Reset Password Dialog */}
        <Dialog open={!!showResetPassword} onOpenChange={() => { setShowResetPassword(null); setNewPassword(""); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reset Password</DialogTitle>
              <DialogDescription>
                Set a new password for {resetPasswordUser?.email || "this user"}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="reset-pw">New Password</Label>
                <Input
                  id="reset-pw"
                  type="password"
                  placeholder="Min 6 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowResetPassword(null); setNewPassword(""); }}>Cancel</Button>
              <Button onClick={handleResetPassword} disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Update Password
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={!!deleteUserId} onOpenChange={() => setDeleteUserId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete this user account and all their roles. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteUser}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
