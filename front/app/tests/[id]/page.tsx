// app/tests/[id]/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import Navbar from '@/components/Navbar'
import EthicsBanner from '@/components/EthicsBanner'
import { mockPatients, mockTests } from '@/lib/data'
import type { User, Patient, Test } from '@/types'

export default function TestDetailPage() {
    const router = useRouter()
    const params = useParams()
    const testId = params?.id as string

    const [user, setUser] = useState<User | null>(null)
    const [patient, setPatient] = useState<Patient | null>(null)
    const [test, setTest] = useState<Test | null>(null)
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        const userData = localStorage.getItem('user')
        if (!userData) {
            router.push('/')
            return
        }
        setUser(JSON.parse(userData))

        const patientId = localStorage.getItem('selectedPatient')
        if (patientId) {
            const foundPatient = mockPatients.find(p => p.id === patientId)
            if (foundPatient) {
                setPatient(foundPatient)
            }
        }

        const foundTest = mockTests.find(t => t.id === testId)
        if (foundTest) {
            setTest(foundTest)
        } else {
            router.push('/tests')
        }

        setIsLoading(false)
    }, [router, testId])

    const handleStartRecording = () => {
        if (patient && test) {
            router.push(`/recording?test=${test.id}&patient=${patient.id}`)
        }
    }

    if (isLoading || !user || !patient || !test) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-4 text-gray-500 text-lg">Chargement...</p>
                </div>
            </div>
        )
    }

    return (
        <>
            <Header user={user} />
            <Navbar active="tests" />
            <main className="max-w-7xl mx-auto px-4 py-4">
                
                {/* En-tête */}
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                    <div className="flex items-center gap-3">
                        <Link href="/tests" className="text-blue-600 hover:underline text-sm font-medium">
                            ← Retour aux tests
                        </Link>
                        <span className="text-gray-300">|</span>
                        <span className="text-sm text-gray-500">
                            Patient: <span className="font-medium text-gray-700">{patient.name}</span>
                        </span>
                        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                            {patient.id}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-2xl">{test.icon}</span>
                        <h1 className="text-xl font-bold text-gray-900">{test.name}</h1>
                        <span className="text-sm text-gray-500">/ {''}</span>
                        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                            {test.duration}
                        </span>
                    </div>
                </div>

                {/* Métriques en haut */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2">
                        <p className="text-xs text-gray-500">Volume</p>
                        <p className="text-lg font-bold text-blue-600">78%</p>
                    </div>
                    <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-2">
                        <p className="text-xs text-gray-500">Clarté</p>
                        <p className="text-lg font-bold text-green-600">92%</p>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2">
                        <p className="text-xs text-gray-500">Bruit</p>
                        <p className="text-lg font-bold text-amber-600">12%</p>
                    </div>
                    <div className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-2">
                        <p className="text-xs text-gray-500">Durée</p>
                        <p className="text-lg font-bold text-purple-600">2:30</p>
                    </div>
                </div>

                {/* Image - PLEINE LARGEUR */}
                <div className="w-full bg-white border-4 border-gray-200 rounded-2xl p-2 shadow-xl mb-4">
                    {test.imagePath ? (
                        <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-gray-100">
                            <img
                                src={test.imagePath}
                                alt={test.name}
                                className="object-contain w-full h-full"
                                onError={(e) => {
                                    const target = e.target as HTMLImageElement
                                    target.style.display = 'none'
                                }}
                            />
                        </div>
                    ) : (
                        <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-gray-100 flex items-center justify-center">
                            <div className="text-center text-gray-400">
                                <span className="text-6xl block">{test.icon}</span>
                                <p className="text-xl font-semibold text-gray-600">{test.name}</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Boutons en dessous de l'image */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="md:col-span-1 bg-blue-50 border-2 border-blue-200 rounded-2xl p-3 flex items-center">
                        <div>
                            <p className="text-xs font-medium text-blue-600">📋 Consignes</p>
                            <p className="text-sm text-blue-800 line-clamp-2">
                                {test.instructions?.[0] || 'Suivez les instructions'}
                            </p>
                        </div>
                    </div>
                    <div className="md:col-span-2">
                        <button
                            onClick={handleStartRecording}
                            className="w-full bg-red-600 text-white text-xl font-bold rounded-2xl hover:bg-red-700 transition shadow-lg py-4 flex items-center justify-center gap-2"
                        >
                            <span>🔴</span> Démarrer l'enregistrement
                        </button>
                    </div>
                    <div className="md:col-span-1">
                        <Link
                            href="/dashboard"
                            className="w-full block bg-gray-100 text-gray-700 text-center text-sm font-medium rounded-2xl hover:bg-gray-200 transition py-4"
                        >
                            ← Retour au dashboard
                        </Link>
                    </div>
                </div>

                <div className="mt-6">
                    <EthicsBanner />
                </div>
            </main>
        </>
    )
}