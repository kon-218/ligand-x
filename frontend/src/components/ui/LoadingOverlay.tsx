import React from 'react'
import { Loader2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface LoadingOverlayProps {
    isLoading: boolean
    message?: string
    description?: string
    isBlocking?: boolean
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
    isLoading,
    message = 'Loading...',
    description,
    isBlocking = true,
}) => {
    return (
        <AnimatePresence>
            {isLoading && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className={`absolute inset-0 z-50 flex flex-col items-center justify-center ${isBlocking ? 'bg-background/80 backdrop-blur-sm' : 'bg-transparent pointer-events-none'
                        }`}
                >
                    <div className="flex flex-col items-center p-6 rounded-lg bg-card border shadow-lg max-w-sm text-center">
                        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
                        <h3 className="text-lg font-semibold mb-1">{message}</h3>
                        {description && (
                            <p className="text-sm text-muted-foreground">{description}</p>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
