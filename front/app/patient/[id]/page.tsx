'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import Navbar from '@/components/Navbar'
import EthicsBanner from '@/components/EthicsBanner'
import { patientsApi } from '@/lib/api'
import { isAuthenticated, verifySession } from '@/lib/auth'
import type { Patient, User } from '@/types'

interface PatientPageProps {
    params: Promise<{
        id: string
    }>
}

export default function PatientPage({ params }: PatientPageProps) {
    const router = useRouter()
    const [user, setUser] = useState<User | null>(null)
    const [patient, setPatient] = useState<Patient | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const loadData = async () => {
            try {
                const valid = await verifySession()
                if (!valid) {
                    router.push('/')
                    return
                }

                const userData = localStorage.getItem('user')
                if (!userData) {
                    router.push('/')
                    return
                }
                setUser(JSON.parse(userData))

                const { id } = await params

                if (!id) {
                    router.push('/dashboard')
                    return
                }

                await loadPatient(id)
            } catch (error) {
                console.error('Error loading patient data:', error)
                setError('Erreur lors du chargement des données')
                setIsLoading(false)
            }
        }

        loadData()
    }, [router, params])

    const loadPatient = async (patientId: string) => {
        setIsLoading(true)
        setError(null)

        try {
            const result = await patientsApi.getAll()

            if (result.success && result.data) {
                const foundPatient = result.data.find((patient) => String(patient.id) === patientId)

                if (foundPatient) {
                    setPatient(foundPatient as Patient)
                } else {
                    setError('Patient non trouvé')
                    setTimeout(() => {
                        router.push('/dashboard')
                    }, 2000)
                }
            } else {
                setError(result.error || 'Patient non trouvé')
                setTimeout(() => {
                    router.push('/dashboard')
                }, 2000)
            }
        } catch (error) {
            console.error('Error fetching patient:', error)
            setError('Erreur lors du chargement du patient')
        } finally {
            setIsLoading(false)
        }
    }

    const handleStartTests = () => {
        if (patient) {
            localStorage.setItem('selectedPatient', patient.id)
            router.push('/tests')
        }
    }

    const handleViewReport = () => {
        if (patient) {
            router.push(`/rapport/${patient.id}`)
        }
    }

    const handleBack = () => {
        router.push('/dashboard')
    }

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-4 text-gray-500">Chargement du patient...</p>
                </div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="text-red-500 text-6xl mb-4">⚠️</div>
                    <h2 className="text-xl font-semibold text-gray-900 mb-2">Erreur</h2>
                    <p className="text-gray-500">{error}</p>
                    <button
                        onClick={handleBack}
                        className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                    >
                        Retour au dashboard
                    </button>
                </div>
            </div>
        )
    }

    if (!user || !patient) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-4 text-gray-500">Redirection...</p>
                </div>
            </div>
        )
    }

    return (
        <>
            <Header user={user} />
            <Navbar active="patients" />
            <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <button
                    onClick={handleBack}
                    className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-6 transition"
                >
                    ← Retour au dashboard
                </button>

                <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm mb-8">
                    <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                        <div
                            className="w-24 h-24 rounded-full flex items-center justify-center text-white font-bold text-3xl flex-shrink-0"
                            style={{ backgroundColor: patient.color || '#3B82F6' }}
                        >
                            {patient.initials || patient.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'P'}
                        </div>
                        <div className="flex-1 text-center sm:text-left">
                            <h1 className="text-2xl font-bold text-gray-900">{patient.name}</h1>
                            <div className="flex flex-wrap justify-center sm:justify-start gap-4 text-sm text-gray-500 mt-1">
                                <span>ID: {patient.id}</span>
                                {patient.age && <span>⭐ {patient.age} ans</span>}
                                {patient.birthDate && <span>📅 Né le {patient.birthDate}</span>}
                                {patient.phone && <span>📞 {patient.phone}</span>}
                                {patient.gender && <span>⚥ {patient.gender}</span>}
                                {patient.dmiId && <span>🔑 DMI: {patient.dmiId}</span>}
                            </div>
                            {patient.lastSession && (
                                <div className="mt-2 text-sm text-gray-400">
                                    Dernière session: {patient.lastSession}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    <button
                        onClick={handleStartTests}
                        className="group relative bg-gradient-to-br from-blue-500 to-blue-700 hover:from-blue-600 hover:to-blue-800 text-white rounded-2xl p-8 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1"
                    >
                        <div className="flex flex-col items-center text-center">
                            <span className="text-6xl mb-4 group-hover:scale-110 transition-transform">▶️</span>
                            <h2 className="text-2xl font-bold">Démarrer les tests</h2>
                            <p className="text-blue-100 text-sm mt-2">
                                Lancez les tests cognitifs pour ce patient
                            </p>
                            <div className="mt-4 text-xs bg-white/20 px-4 py-1.5 rounded-full">
                                ~10-15 min
                            </div>
                        </div>
                    </button>

                    <button
                        onClick={handleViewReport}
                        className="group relative bg-gradient-to-br from-purple-500 to-purple-700 hover:from-purple-600 hover:to-purple-800 text-white rounded-2xl p-8 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1"
                    >
                        <div className="flex flex-col items-center text-center">
                            <span className="text-6xl mb-4 group-hover:scale-110 transition-transform">📊</span>
                            <h2 className="text-2xl font-bold">Voir le rapport</h2>
                            <p className="text-purple-100 text-sm mt-2">
                                Consultez les résultats et l'évolution
                            </p>
                            <div className="mt-4 text-xs bg-white/20 px-4 py-1.5 rounded-full">
                                {patient.lastSession ? `Dernier: ${patient.lastSession}` : 'Aucune session'}
                            </div>
                        </div>
                    </button>
                </div>

                <EthicsBanner />
            </main>
        </>
    )
}