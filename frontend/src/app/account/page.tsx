'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useUIStore } from '@/store/ui-store'

export default function AccountPage() {
  const router = useRouter()
  const { setActiveOverlay } = useUIStore()

  useEffect(() => {
    setActiveOverlay('account')
    router.replace('/')
  }, [setActiveOverlay, router])

  return null
}
