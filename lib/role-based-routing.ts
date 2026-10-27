'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export function RoleBasedEntry({ lowestID }: { lowestID: number }) {
    const router = useRouter()

    useEffect(() => {
        switch (lowestID) {
            case 1:
                router.replace("/protected/admin")
                break
            case 2:
                router.replace("/protected/manager")
                break
            case 3:
                router.replace("/protected/capability")
                break
            case 4:
                router.replace("/protected/employee")
                break
            default:
                router.replace("/")
                break
        }
    }, [lowestID, router])

    return null
}