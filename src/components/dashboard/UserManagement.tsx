import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Trash2, UserPlus, UserMinus } from "lucide-react";
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
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      
      // Get all user roles
      const { data: userRoles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role");

      if (rolesError) throw rolesError;

      // Group roles by user_id
      const rolesMap = new Map<string, string[]>();
      userRoles?.forEach((ur) => {
        const existing = rolesMap.get(ur.user_id) || [];
        rolesMap.set(ur.user_id, [...existing, ur.role]);
      });

      // Get current user to filter out
      const { data: { user: currentUser } } = await supabase.auth.getUser();

      // Combine user data with roles
      const usersWithRoles: User[] = Array.from(rolesMap.entries()).map(([userId, roles]) => ({
        id: userId,
        email: userId === currentUser?.id ? currentUser.email || "Unknown" : "User",
        created_at: new Date().toISOString(),
        roles,
      }));

      setUsers(usersWithRoles);
    } catch (error: any) {
      console.error("Error fetching users:", error);
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleRole = async (userId: string, role: "admin" | "viewer" | "superadmin", hasRole: boolean) => {
    try {
      if (hasRole) {
        // Remove role
        const { error } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", userId)
          .eq("role", role);

        if (error) throw error;
        toast.success(`Removed ${role} role`);
      } else {
        // Add role
        const { error } = await supabase
          .from("user_roles")
          .insert([{ user_id: userId, role }]);

        if (error) throw error;
        toast.success(`Added ${role} role`);
      }

      fetchUsers();
    } catch (error: any) {
      console.error("Error updating role:", error);
      toast.error("Failed to update role");
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteUserId) return;

    try {
      // Delete user roles first
      const { error: rolesError } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", deleteUserId);

      if (rolesError) throw rolesError;

      toast.success("User deleted successfully");
      setDeleteUserId(null);
      fetchUsers();
    } catch (error: any) {
      console.error("Error deleting user:", error);
      toast.error("Failed to delete user");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>User Management</CardTitle>
        <CardDescription>Manage user permissions and accounts</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="permissions">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="permissions">Permissions</TabsTrigger>
            <TabsTrigger value="deletion">User Deletion</TabsTrigger>
          </TabsList>

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
                      <TableCell colSpan={3} className="text-center">
                        Loading users...
                      </TableCell>
                    </TableRow>
                  ) : users.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center">
                        No users found
                      </TableCell>
                    </TableRow>
                  ) : (
                    users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.email}</TableCell>
                        <TableCell>
                          <div className="flex gap-2 flex-wrap">
                            {user.roles.map((role) => (
                              <Badge key={role} variant="secondary">
                                {role}
                              </Badge>
                            ))}
                            {user.roles.length === 0 && (
                              <span className="text-sm text-muted-foreground">No roles</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-2 justify-end">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleToggleRole(user.id, "superadmin", user.roles.includes("superadmin"))}
                            >
                              {user.roles.includes("superadmin") ? (
                                <UserMinus className="h-4 w-4 mr-1" />
                              ) : (
                                <UserPlus className="h-4 w-4 mr-1" />
                              )}
                              Superadmin
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleToggleRole(user.id, "admin", user.roles.includes("admin"))}
                            >
                              {user.roles.includes("admin") ? (
                                <UserMinus className="h-4 w-4 mr-1" />
                              ) : (
                                <UserPlus className="h-4 w-4 mr-1" />
                              )}
                              Admin
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleToggleRole(user.id, "viewer", user.roles.includes("viewer"))}
                            >
                              {user.roles.includes("viewer") ? (
                                <UserMinus className="h-4 w-4 mr-1" />
                              ) : (
                                <UserPlus className="h-4 w-4 mr-1" />
                              )}
                              Viewer
                            </Button>
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
                      <TableCell colSpan={3} className="text-center">
                        Loading users...
                      </TableCell>
                    </TableRow>
                  ) : users.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center">
                        No users found
                      </TableCell>
                    </TableRow>
                  ) : (
                    users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.email}</TableCell>
                        <TableCell>
                          <div className="flex gap-2 flex-wrap">
                            {user.roles.map((role) => (
                              <Badge key={role} variant="secondary">
                                {role}
                              </Badge>
                            ))}
                            {user.roles.length === 0 && (
                              <span className="text-sm text-muted-foreground">No roles</span>
                            )}
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

        <AlertDialog open={!!deleteUserId} onOpenChange={() => setDeleteUserId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete this user's roles and access. This action cannot be undone.
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
