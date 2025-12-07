'use client'

import { Button } from '@/components/ui/button'

interface ABFEStepExecuteProps {
    isRunning: boolean
    progress: number
    progressMessage: string
    onRun: () => void
    onCancel: () => void
}

export function ABFEStepExecute({
    isRunning,
    progress,
    progressMessage,
    onRun,
    onCancel,
}: ABFEStepExecuteProps) {
    return (
        <div className="space-y-6">
            <h3 className="text-lg font-semibold">Step 3: Run ABFE Calculation</h3>

            {!isRunning ? (
                <div className="space-y-4">
                    <div className="p-4 bg-gray-800 rounded border border-gray-700">
                        <h4 className="font-semibold mb-2">Ready to run ABFE calculation</h4>
                        <p className="text-sm text-gray-400">
                            Click the button below to submit the ABFE calculation job.
                            You can monitor the progress in real-time.
                        </p>
                    </div>

                    <Button
                        onClick={onRun}
                        size="lg"
                        className="w-full bg-blue-600 hover:bg-blue-700"
                    >
                        <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Run ABFE Calculation
                    </Button>
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="p-4 bg-gray-800 rounded border border-gray-700">
                        <div className="flex items-center justify-between mb-2">
                            <h4 className="font-semibold">Calculation in progress...</h4>
                            <span className="text-sm text-gray-400">{Math.round(progress)}%</span>
                        </div>

                        {/* Progress Bar */}
                        <div className="w-full bg-gray-700 rounded-full h-2 mb-2">
                            <div
                                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                style={{ width: `${progress}%` }}
                            />
                        </div>

                        <p className="text-sm text-gray-400">{progressMessage || 'Processing...'}</p>
                    </div>

                    <div className="p-4 bg-blue-900/20 border border-blue-700/50 rounded-lg">
                        <p className="text-sm text-gray-300">
                            <strong>Note:</strong> ABFE calculations can take considerable time.
                            The job is running in the background and you can safely navigate away.
                        </p>
                    </div>

                    <Button
                        onClick={onCancel}
                        size="lg"
                        variant="outline"
                        className="w-full bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20 hover:border-amber-500/50 hover:text-amber-300 transition-all duration-200 flex flex-col items-center justify-center py-6"
                    >
                        <span className="font-semibold">Stop Monitoring</span>
                        <span className="text-xs text-gray-400">(job continues in background)</span>
                    </Button>
                </div>
            )}
        </div>
    )
}
