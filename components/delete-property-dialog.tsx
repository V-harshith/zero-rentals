"use client"

import { useState } from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"

interface DeletePropertyDialogProps {
  propertyId?: string
  propertyName?: string
  propertyTitle?: string // Alias for propertyName
  onDelete?: () => void
  onConfirm?: () => void | Promise<void> // Alias for onDelete
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function DeletePropertyDialog({
  propertyId,
  propertyName,
  propertyTitle,
  onDelete,
  onConfirm,
  open: controlledOpen,
  onOpenChange,
}: DeletePropertyDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  
  // Support both propertyName and propertyTitle
  const displayName = propertyName || propertyTitle || "this property"
  
  // Support both onDelete and onConfirm callbacks
  const handleCallback = onConfirm || onDelete

  const handleDelete = async () => {
    setIsDeleting(true)

    try {
      // If propertyId is provided, handle deletion internally
      if (propertyId) {
        const response = await fetch(`/api/properties/${propertyId}`, {
          method: "DELETE",
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || "Failed to delete property")
        }

        toast.success("Property deleted successfully")
      }
      
      // Call the callback (onConfirm or onDelete)
      await handleCallback?.()
      onOpenChange?.(false)
    } catch (error: any) {
      console.error("Error deleting property:", error)
      toast.error(error.message || "Failed to delete property")
    } finally {
      setIsDeleting(false)
    }
  }

  // Controlled mode (with open prop)
  if (controlledOpen !== undefined) {
    return (
      <AlertDialog open={controlledOpen} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Property</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{displayName}</strong>?
              This action cannot be undone and will permanently delete the property
              and all associated images.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )
  }

  // Uncontrolled mode (with trigger)
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Property</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete <strong>{displayName}</strong>?
            This action cannot be undone and will permanently delete the property
            and all associated images.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

