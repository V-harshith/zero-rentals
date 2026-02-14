"use client"

import { createContext, useContext, useState, useEffect, ReactNode } from "react"
import { toast } from "sonner"

interface Notification {
    id: string
    type: "inquiry" | "message" | "payment" | "system"
    title: string
    message: string
    timestamp: Date
    read: boolean
    actionUrl?: string
}

interface NotificationContextType {
    notifications: Notification[]
    unreadCount: number
    addNotification: (notification: Omit<Notification, "id" | "timestamp" | "read">) => void
    markAsRead: (id: string) => void
    markAllAsRead: () => void
    clearNotification: (id: string) => void
    clearAll: () => void
    requestPermission: () => Promise<void>
    hasPermission: boolean
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined)

export function NotificationProvider({ children }: { children: ReactNode }) {
    const [notifications, setNotifications] = useState<Notification[]>([])
    const [hasPermission, setHasPermission] = useState(false)

    // Check notification permission on mount
    useEffect(() => {
        if (typeof window !== "undefined" && "Notification" in window) {
            setHasPermission(Notification.permission === "granted")
        }
    }, [])

    const requestPermission = async () => {
        if (!("Notification" in window)) {
            toast.error("Browser notifications not supported")
            return
        }

        try {
            const permission = await Notification.requestPermission()
            setHasPermission(permission === "granted")

            if (permission === "granted") {
                toast.success("Notifications enabled!")
            } else {
                toast.error("Notification permission denied")
            }
        } catch {
            toast.error("Failed to request notification permission")
        }
    }

    const addNotification = (notification: Omit<Notification, "id" | "timestamp" | "read">) => {
        const newNotification: Notification = {
            ...notification,
            id: Date.now().toString(),
            timestamp: new Date(),
            read: false
        }

        setNotifications(prev => [newNotification, ...prev])

        // Show browser notification if permission granted
        if (hasPermission && document.hidden) {
            try {
                new Notification(notification.title, {
                    body: notification.message,
                    icon: "/zerorentals-logo.png",
                    badge: "/zerorentals-logo.png",
                    tag: newNotification.id
                })
            } catch {
                // Ignore browser notification errors
            }
        }

        // Show toast notification
        toast.info(notification.title, {
            description: notification.message
        })
    }

    const markAsRead = (id: string) => {
        setNotifications(prev =>
            prev.map(notif =>
                notif.id === id ? { ...notif, read: true } : notif
            )
        )
    }

    const markAllAsRead = () => {
        setNotifications(prev =>
            prev.map(notif => ({ ...notif, read: true }))
        )
    }

    const clearNotification = (id: string) => {
        setNotifications(prev => prev.filter(notif => notif.id !== id))
    }

    const clearAll = () => {
        setNotifications([])
    }

    const unreadCount = notifications.filter(n => !n.read).length

    return (
        <NotificationContext.Provider
            value={{
                notifications,
                unreadCount,
                addNotification,
                markAsRead,
                markAllAsRead,
                clearNotification,
                clearAll,
                requestPermission,
                hasPermission
            }}
        >
            {children}
        </NotificationContext.Provider>
    )
}

export function useNotifications() {
    const context = useContext(NotificationContext)
    if (context === undefined) {
        throw new Error("useNotifications must be used within a NotificationProvider")
    }
    return context
}
