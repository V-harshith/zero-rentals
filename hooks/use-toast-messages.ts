import { toast } from "sonner"
import { useCallback } from "react"

export function useToastMessages() {
  const showSuccess = useCallback((message: string) => {
    toast.success(message)
  }, [])

  const showError = useCallback((message: string) => {
    toast.error(message)
  }, [])

  const showInfo = useCallback((message: string) => {
    toast.info(message)
  }, [])

  const showWarning = useCallback((message: string) => {
    toast.warning(message)
  }, [])

  const showLoading = useCallback((message: string) => {
    return toast.loading(message)
  }, [])

  const dismissToast = useCallback((toastId: string | number) => {
    toast.dismiss(toastId)
  }, [])

  // Common messages
  const authMessages = {
    loginSuccess: () => showSuccess("Login successful!"),
    loginError: () => showError("Login failed. Please check your credentials."),
    logoutSuccess: () => showSuccess("Logged out successfully"),
    sessionExpired: () => showError("Session expired. Please login again."),
    emailVerified: () => showSuccess("Email verified successfully!"),
    passwordResetSent: () => showSuccess("Password reset email sent!"),
    passwordResetSuccess: () => showSuccess("Password updated successfully!"),
    passwordChangeSuccess: () => showSuccess("Password changed successfully!"),
    passwordChangeError: () => showError("Failed to change password"),
  }

  const propertyMessages = {
    created: () => showSuccess("Property posted successfully!"),
    updated: () => showSuccess("Property updated successfully!"),
    deleted: () => showSuccess("Property deleted successfully!"),
    createError: () => showError("Failed to create property"),
    updateError: () => showError("Failed to update property"),
    deleteError: () => showError("Failed to delete property"),
    limitReached: () => showWarning("You have reached your property limit"),
    approvalPending: () => showInfo("Your property is pending approval"),
    approved: () => showSuccess("Property approved and is now live!"),
    rejected: () => showError("Property was not approved"),
  }

  const inquiryMessages = {
    sent: () => showSuccess("Inquiry sent successfully!"),
    sendError: () => showError("Failed to send inquiry"),
    statusUpdated: () => showSuccess("Status updated successfully!"),
  }

  const favoriteMessages = {
    added: () => showSuccess("Added to favorites"),
    removed: () => showSuccess("Removed from favorites"),
    loginRequired: () => showError("Please login to save favorites"),
  }

  const paymentMessages = {
    success: () => showSuccess("Payment successful!"),
    failed: () => showError("Payment failed"),
    processing: () => showLoading("Processing payment..."),
    verified: () => showSuccess("Payment verified!"),
  }

  const fileMessages = {
    uploadSuccess: () => showSuccess("File uploaded successfully"),
    uploadError: () => showError("Failed to upload file"),
    invalidType: () => showError("Invalid file type"),
    tooLarge: () => showError("File is too large"),
  }

  const networkMessages = {
    offline: () => showError("You are offline. Please check your connection."),
    serverError: () => showError("Server error. Please try again later."),
    timeout: () => showError("Request timed out. Please try again."),
  }

  return {
    showSuccess,
    showError,
    showInfo,
    showWarning,
    showLoading,
    dismissToast,
    auth: authMessages,
    property: propertyMessages,
    inquiry: inquiryMessages,
    favorite: favoriteMessages,
    payment: paymentMessages,
    file: fileMessages,
    network: networkMessages,
  }
}
