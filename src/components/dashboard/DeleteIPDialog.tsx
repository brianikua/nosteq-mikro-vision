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

interface DeleteIPDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deviceName: string;
  ipAddress: string;
  onConfirm: () => void;
}

export const DeleteIPDialog = ({ open, onOpenChange, deviceName, ipAddress, onConfirm }: DeleteIPDialogProps) => (
  <AlertDialog open={open} onOpenChange={onOpenChange}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Remove IP Address?</AlertDialogTitle>
        <AlertDialogDescription>
          This will permanently remove <span className="font-semibold text-foreground">{deviceName}</span> ({ipAddress}) from monitoring. This action cannot be undone.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction
          onClick={onConfirm}
          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        >
          Remove
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
