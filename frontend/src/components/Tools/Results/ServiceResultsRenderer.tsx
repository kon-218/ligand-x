'use client'

import React from 'react'
import type { ServiceType } from '@/types/unified-job-types'
import { DockingResultsView } from './DockingResultsView'
import { MDResultsView } from './MDResultsView'
import { Boltz2ResultsView } from './Boltz2ResultsView'
import { ABFEResultsView } from './ABFEResultsView'
import { RBFEResultsView } from './RBFEResultsView'
import { QCResultsView } from './QCResultsView'

interface ServiceResultsRendererProps {
    jobId: string
    service: ServiceType
}

/**
 * Routes to appropriate service-specific results display
 * Fetches job details and renders the appropriate view
 */
export function ServiceResultsRenderer({ jobId, service }: ServiceResultsRendererProps) {
    // Render service-specific view
    switch (service) {
        case 'docking':
            return <DockingResultsView jobId={jobId} />
        case 'md':
            return <MDResultsView jobId={jobId} />
        case 'boltz2':
            return <Boltz2ResultsView jobId={jobId} />
        case 'abfe':
            return <ABFEResultsView jobId={jobId} />
        case 'rbfe':
            return <RBFEResultsView jobId={jobId} />
        case 'qc':
            return <QCResultsView jobId={jobId} />
        default:
            return <div>Unknown service: {service}</div>
    }
}
