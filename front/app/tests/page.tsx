// app/tests/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import Navbar from '@/components/Navbar'
import PatientSelector from '@/components/PatientSelector'
import PatientForm from '@/components/PatientForm'
import EthicsBanner from '@/components/EthicsBanner'
import { mockTests } from '@/lib/data'
import { patientsApi } from '@/lib/api'
import { getToken } from '@/lib/auth'
import type { User, Patient, Test, PatientFormData } from '@/types'

export default function TestsPage() {
    const router = useRouter()
    const [user, setUser] = useState<User | null>(null)
    const [patients, setPatients] = useState<Patient[]>([])
    const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
    const [isFormOpen, setIsFormOpen] = useState(false)
    const [isLoading, setIsLoading] = useState(true)

    // Vérifier l'authentification et charger les données
    useEffect(() => {
        const token = getToken()
        if (!token) {
            router.push('/')
            return
        }

        const userData = localStorage.getItem('user')
        if (userData) {
            setUser(JSON.parse(userData))
        }

        loadPatients()
    }, [router])

    const loadPatients = async () => {
        setIsLoading(true)
        const result = await patientsApi.getAll()
        if (result.success && result.data) {
            setPatients(result.data)
            // Vérifier si un patient était sélectionné
            const savedPatientId = localStorage.getItem('selectedPatient')
            if (savedPatientId) {
                const patient = result.data.find(p => p.id === savedPatientId)
                if (patient) {
                    setSelectedPatient(patient)
                }
            }
        } else {
            console.error('Erreur chargement patients:', result.error)
        }
        setIsLoading(false)
    }

    // Sauvegarder le patient sélectionné quand il change
    useEffect(() => {
        if (selectedPatient) {
            localStorage.setItem('selectedPatient', selectedPatient.id)
        }
    }, [selectedPatient])

    const handleSelectPatient = (patientId: string) => {
        const patient = patients.find(p => p.id === patientId)
        if (patient) {
            setSelectedPatient(patient)
        }
    }

    const handleAddPatient = async (formData: PatientFormData) => {
        const newPatient = {
            first_name: formData.firstName,
            last_name: formData.lastName,
            date_of_birth: formData.birthDate,
            external_ref: formData.dmiId,
        }

        const result = await patientsApi.create(newPatient)
        
        if (result.success && result.data) {
            setPatients([result.data, ...patients])
            setSelectedPatient(result.data)
            localStorage.setItem('selectedPatient', result.data.id)
            alert(`✅ Patient ${result.data.name} ajouté avec succès !`)
            setIsFormOpen(false)
        } else {
            alert(`❌ Erreur: ${result.error || 'Impossible d\'ajouter le patient'}`)
        }
    }

    const handleStartTest = (testId: string) => {
        if (!selectedPatient) return
        localStorage.setItem('currentTest', testId)
        router.push(`/recording?test=${testId}&patient=${selectedPatient.id}`)
    }

    const handleBackToPatient = () => {
        if (selectedPatient) {
            router.push(`/patient/${selectedPatient.id}`)
        } else {
            router.push('/dashboard')
        }
    }

    const handleFinishTests = () => {
        setSelectedPatient(null)
        localStorage.removeItem('selectedPatient')
        router.push('/dashboard')
    }

    if (isLoading || !user) {
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
            <Navbar active="tests" />
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                {!selectedPatient ? (
                    // Mode : Sélection du patient
                    <>
                        <div className="mb-6">
                            <div className="flex items-center gap-4">
                                <h1 className="text-2xl font-bold text-gray-900">🧪 Tests cognitifs</h1>
                                <Link
                                    href="/dashboard"
                                    className="text-sm text-blue-600 hover:underline"
                                >
                                    ← Retour au dashboard
                                </Link>
                            </div>
                            <p className="text-gray-500 text-sm">
                                Sélectionnez un patient pour commencer les tests
                            </p>
                        </div>
                        <PatientSelector
                            patients={patients}
                            onSelectPatient={handleSelectPatient}
                            onAddNew={() => setIsFormOpen(true)}
                        />
                    </>
                ) : (
                    // Mode : Tests du patient sélectionné
                    <>
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                            <div>
                                <div className="flex items-center gap-3">
                                    <h1 className="text-2xl font-bold text-gray-900">🧪 Tests cognitifs</h1>
                                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                                        {selectedPatient.id}
                                    </span>
                                </div>
                                <p className="text-gray-500 text-sm">
                                    Patient: <span className="font-medium text-gray-700">{selectedPatient.name}</span>
                                </p>
                            </div>
                            <div className="flex items-center gap-3 flex-wrap">
                                <button
                                    onClick={handleBackToPatient}
                                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition text-sm font-medium"
                                >
                                    ← Retour au patient
                                </button>
                                <button
                                    onClick={handleFinishTests}
                                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition text-sm font-medium"
                                >
                                    ✅ Finaliser les tests
                                </button>
                                <Link
                                    href={`/rapport/${selectedPatient.id}`}
                                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition text-sm font-medium"
                                >
                                    📊 Voir le rapport
                                </Link>
                            </div>
                        </div>

                        {/* Liste des tests */}
                        <div className="space-y-4">
                            {mockTests.map((test) => (
                                <div
                                    key={test.id}
                                    className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6 shadow-sm hover:shadow-md transition"
                                >
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                                        <div className="text-4xl sm:text-5xl flex-shrink-0 text-center sm:text-left">
                                            {test.icon}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                                                <h3 className="text-lg font-semibold text-gray-900">{test.name}</h3>
                                                <span className="text-sm text-gray-500">{test.duration}</span>
                                            </div>
                                            <p className="text-sm text-gray-500 mt-1">{test.description}</p>
                                        </div>
                                        <button
                                            onClick={() => handleStartTest(test.id)}
                                            className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition whitespace-nowrap"
                                        >
                                            ▶️ Démarrer
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <button
                            className="w-full mt-6 py-3.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition"
                            onClick={() => {
                                const firstTest = mockTests[0]
                                if (firstTest) {
                                    handleStartTest(firstTest.id)
                                }
                            }}
                        >
                            ▶️ Lancer le protocole complet
                        </button>

                        <div className="mt-4 text-center">
                            <Link
                                href={`/rapport/${selectedPatient.id}`}
                                className="text-purple-600 hover:underline text-sm font-medium"
                            >
                                📊 Voir le rapport complet du patient
                            </Link>
                        </div>
                    </>
                )}

                <div className="mt-8">
                    <EthicsBanner />
                </div>
            </main>

            <PatientForm
                isOpen={isFormOpen}
                onClose={() => setIsFormOpen(false)}
                onSave={handleAddPatient}
            />
        </>
    )
}