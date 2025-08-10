'use client'

import React, { useEffect, useState } from 'react'
import { useUIStore } from '@/store/ui-store'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { X } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'

export const NotificationSystem = () => {
    const { notifications, removeNotification } = useUIStore()
    const [isMounted, setIsMounted] = useState(false)

    // Prevent hydration mismatch by only rendering after mount
    useEffect(() => {
        setIsMounted(true)
    }, [])

    // Auto-dismiss notifications after 3 seconds
    useEffect(() => {
        if (notifications.length > 0) {
            const interval = setInterval(() => {
                const now = Date.now()
                notifications.forEach((notification) => {
                    if (now - notification.timestamp > 3000) {
                        removeNotification(notification.id)
                    }
                })
            }, 500)
            return () => clearInterval(interval)
        }
    }, [notifications, removeNotification])

    if (!isMounted) {
        return null
    }

    return (
        <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 w-full max-w-sm pointer-events-none" suppressHydrationWarning>
            <AnimatePresence mode="popLayout">
                {notifications.map((notification) => (
                    <motion.div
                        key={notification.id}
                        initial={{ opacity: 0, x: 50, scale: 0.9 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: 20, scale: 0.9 }}
                        layout
                        className="pointer-events-auto"
                    >
                        <Alert
                            variant={
                                notification.type === 'error'
                                    ? 'destructive'
                                    : notification.type === 'success'
                                        ? 'success'
                                        : notification.type === 'warning'
                                            ? 'warning'
                                            : 'default'
                            }
                            className="shadow-lg backdrop-blur-sm bg-opacity-95 pr-10"
                        >
                            <AlertDescription className="font-medium">
                                {notification.message}
                            </AlertDescription>
                            <button
                                onClick={() => removeNotification(notification.id)}
                                className="absolute top-4 right-4 text-foreground/50 hover:text-foreground transition-colors"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </Alert>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    )
}
