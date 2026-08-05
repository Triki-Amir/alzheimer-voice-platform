'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import Navbar from '@/components/Navbar'
import EthicsBanner from '@/components/EthicsBanner'
import { mockPatients } from '@/lib/data'
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

    useEffect(() => {
        const loadData = async () => {
            const userData = localStorage.getItem('user')
            if (!userData) {
                router.push('/')
                return
            }
            setUser(JSON.parse(userData))

            // ✅ Résoudre la promesse params
            const { id } = await params

            if (!id) {
                router.push('/dashboard')
                return
            }

            // Récupérer le patient
            const foundPatient = mockPatients.find(p => p.id === id)
            if (foundPatient) {
                setPatient(foundPatient)
            } else {
                router.push('/dashboard')
            }
            setIsLoading(false)
        }

        loadData()
    }, [router, params])

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

    if (isLoading || !user || !patient) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-4 text-gray-500">Chargement...</p>
                </div>
            </div>
        )
    }

    return (
        <>
            <Header user={user} />
            <Navbar active="patients" />
            <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <Link
                    href="/dashboard"
                    className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-6 transition"
                >
                    ← Retour au dashboard
                </Link>

                <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm mb-8">
                    <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                        <div
                            className="w-24 h-24 rounded-full flex items-center justify-center text-white font-bold text-3xl flex-shrink-0"
                            style={{ backgroundColor: patient.color }}
                        >
                            {patient.initials}
                        </div>
                        <div className="flex-1 text-center sm:text-left">
                            <h1 className="text-2xl font-bold text-gray-900">{patient.name}</h1>
                            <div className="flex flex-wrap justify-center sm:justify-start gap-4 text-sm text-gray-500 mt-1">
                                <span>ID: {patient.id}</span>
                                <span>⭐ {patient.age} ans</span>
                                <span>📅 Né le {patient.birthDate}</span>
                                {patient.phone && <span>📞 {patient.phone}</span>}
                                {patient.gender && <span>⚥ {patient.gender}</span>}
                            </div>
                            <div className="mt-2 text-sm text-gray-400">
                                Dernière session: {patient.lastSession}
                            </div>
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
                                Dernier: {patient.lastSession}
                            </div>
                        </div>
                    </button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    <div className="bg-white p-4 rounded-xl border border-gray-200 text-center">
                        <div className="text-2xl font-bold text-blue-600">4</div>
                        <div className="text-xs text-gray-500">Tests disponibles</div>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-gray-200 text-center">
                        <div className="text-2xl font-bold text-green-600">2</div>
                        <div className="text-xs text-gray-500">Tests complétés</div>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-gray-200 text-center">
                        <div className="text-2xl font-bold text-amber-500">78%</div>
                        <div className="text-xs text-gray-500">Score global</div>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-gray-200 text-center">
                        <div className="text-2xl font-bold text-purple-600">⚠️ MCI</div>
                        <div className="text-xs text-gray-500">Diagnostic</div>
                    </div>
                </div>

                <EthicsBanner />
            </main>
        </>
    )
}