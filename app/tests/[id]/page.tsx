// app/tests/[testId]/page.tsx

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
    const testId = params?.testId as string
    
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

        // Récupérer le patient sélectionné
        const patientId = localStorage.getItem('selectedPatient')
        if (patientId) {
            const foundPatient = mockPatients.find(p => p.id === patientId)
            if (foundPatient) {
                setPatient(foundPatient)
            }
        }

        // Récupérer le test
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
            <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                {/* Navigation */}
                <div className="flex items-center gap-4 mb-6">
                    <Link
                        href="/tests"
                        className="text-blue-600 hover:underline text-lg"
                    >
                        ← Retour aux tests
                    </Link>
                    <span className="text-gray-300">|</span>
                    <span className="text-gray-500">
                        Patient: <span className="font-medium text-gray-700">{patient.name}</span>
                    </span>
                </div>

                {/* En-tête du test */}
                <div className="bg-white border-4 border-gray-200 rounded-3xl p-6 shadow-xl mb-6">
                    <div className="flex items-start gap-6">
                        <div className="text-6xl">{test.icon}</div>
                        <div className="flex-1">
                            <h1 className="text-3xl font-bold text-gray-900">{test.name}</h1>
                            <p className="text-xl text-gray-500 mt-1">{test.description}</p>
                            <div className="flex flex-wrap gap-3 mt-3">
                                <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                                    ⏱️ {test.duration}
                                </span>
                                {test.category && (
                                    <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-sm font-medium">
                                        📂 {test.category}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Instructions */}
                <div className="bg-blue-50 border-4 border-blue-200 rounded-3xl p-6 shadow-xl mb-6">
                    <h2 className="text-2xl font-bold text-blue-800 mb-4">📋 Instructions</h2>
                    <ul className="space-y-3">
                        {test.instructions?.map((instruction, index) => (
                            <li key={index} className="flex items-start gap-3 text-lg text-gray-700">
                                <span className="text-2xl text-blue-500 font-bold">{index + 1}.</span>
                                <span>{instruction}</span>
                            </li>
                        ))}
                    </ul>
                </div>

                {/* Bouton Démarrer */}
                <div className="bg-white border-4 border-gray-200 rounded-3xl p-6 shadow-xl">
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div>
                            <h3 className="text-xl font-semibold text-gray-900">Prêt à commencer ?</h3>
                            <p className="text-gray-500">
                                Assurez-vous d'être dans un environnement calme
                            </p>
                        </div>
                        <button
                            onClick={handleStartRecording}
                            className="px-8 py-4 bg-red-600 text-white text-2xl font-bold rounded-2xl hover:bg-red-700 transition shadow-xl"
                        >
                            🔴 Démarrer l'enregistrement
                        </button>
                    </div>
                </div>

                <div className="mt-8">
                    <EthicsBanner />
                </div>
            </main>
        </>
    )
}