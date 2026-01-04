'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react'
import { api } from '@/lib/api-client'
import { MDResultsDisplay } from '../MD/MDResultsDisplay'
import type { MDResult } from '@/types/md-types'

interface MDResultsViewProps {
    jobId: string
}

export function MDResultsView({ jobId }: MDResultsViewProps) {
    const [loading, setLoading] = useState(true)
    const [job, setJob] = useState<any>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const fetchJob = async () => {
            try {
                setLoading(true)
                const data = await api.getMDJob(jobId)
                setJob(data)
                setError(null)
            } catch (err: any) {
                console.error('Failed to fetch MD job:', err)
                setError(err.message || 'Failed to load MD results')
            } finally {
                setLoading(false)
            }
        }

        fetchJob()
    }, [jobId])

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-64 space-y-4">
                <Loader2 className="w-8 h-8 text-green-500 animate-spin" />
                <p className="text-gray-400">Loading MD results...</p>
            </div>
        )
    }

    if (error || !job) {
        return (
            <div className="p-6 text-center">
                <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-white mb-2">Error Loading Results</h3>
                <p className="text-gray-400 mb-6">{error || 'Job not found'}</p>
                <Button onClick={() => window.location.reload()}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Retry
                </Button>
            </div>
        )
    }

    // Prepare result object
    // If job is still running or failed, construct a partial result to show status
    const rawResult = job.result || {}
    const result: MDResult = {
        ...rawResult,
        success: rawResult.success !== undefined ? rawResult.success : job.status === 'completed',
        status: rawResult.status || job.status,
        message: rawResult.message || job.message || (job.status === 'completed' ? 'Simulation finished successfully' : 'Job status: ' + job.status),
        output_files: rawResult.output_files || job.output_files || {},
    }

    return (
        <div className="animate-in fade-in duration-500">
            <MDResultsDisplay 
                result={result} 
                jobId={jobId} 
                isReadOnly={true}
                parameters={job.input_params}
            />
        </div>
    )
}
