// app/patients/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import Navbar from '@/components/Navbar'
import PatientCard from '@/components/PatientCard'
import SearchBar from '@/components/SearchBar'
import EthicsBanner from '@/components/EthicsBanner'
import PatientForm from '@/components/PatientForm'
import { patientsApi } from '@/lib/api'
<<<<<<< HEAD
import { getToken, verifySession } from '@/lib/auth'
=======
import { getUser, verifySession } from '@/lib/auth'
>>>>>>> b056e8f36ec665af29dbd0b03746f8c8dc046b34
import type { Patient, User, PatientFormData } from '@/types'
import { isAuthenticated } from '@/lib/auth'
export default function PatientsPage() {
    const router = useRouter()
    const [searchTerm, setSearchTerm] = useState('')
    const [patients, setPatients] = useState<Patient[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [user, setUser] = useState<User | null>(null)
    const [isFormOpen, setIsFormOpen] = useState(false)

    // ✅ Vérifier l'authentification via le cookie
    useEffect(() => {
<<<<<<< HEAD
        const checkAuth = async () => {
            const valid = await verifySession()
            if (!valid) {
                router.push('/')
                return
            }

            const userData = localStorage.getItem('user')
            if (userData) {
                setUser(JSON.parse(userData))
            }

            loadPatients()
        }
        checkAuth()
=======
        const loadData = async () => {
            try {
                const isAuth = await verifySession()
                if (!isAuth) {
                    router.push('/')
                    return
                }

                const userData = getUser()
                if (!userData) {
                    router.push('/')
                    return
                }

                // ✅ Convertir AuthUser en User
                const appUser: User = {
                    id: userData.id,
                    email: userData.email,
                    name: userData.name,
                    role: userData.role === 'clinician' ? 'doctor' : 
                          userData.role === 'superadmin' ? 'admin' : 'doctor',
                    hospital: undefined,
                    voiceReferenceId: undefined
                }
                setUser(appUser)
                await loadPatients()
            } catch (error) {
                console.error('❌ Erreur:', error)
                router.push('/')
            }
        }

        loadData()
>>>>>>> b056e8f36ec665af29dbd0b03746f8c8dc046b34
    }, [router])

    const loadPatients = async () => {
        setIsLoading(true)
        const result = await patientsApi.getAll()

        if (result.success && result.data) {
            const normalizedPatients: Patient[] = (result.data as any[]).map((patient: any) => ({
                ...patient,
                id: String(patient.id ?? ''),
                name:
                    patient.name ??
                    (
                        `${patient.first_name ?? ''} ${patient.last_name ?? ''}`.trim() ||
                        `Patient ${String(patient.id ?? '')}`
                    ),
                gender: patient.gender as 'Homme' | 'Femme' | undefined,
            }))

            setPatients(normalizedPatients)
        } else {
            console.error('Erreur chargement patients:', result.error)
        }
        setIsLoading(false)
    }

    const handleAddPatient = async (formData: PatientFormData) => {
        console.log('📝 FormData reçu:', formData)

        const newPatient = {
            first_name: formData.firstName,
            last_name: formData.lastName,
            date_of_birth: formData.birthDate,
            external_ref: formData.dmiId,
        }

        console.log('📤 Envoi au backend:', newPatient)

        const result = await patientsApi.create(newPatient)
        console.log('📥 Résultat:', result)

        if (result.success && result.data) {
            const normalizedPatient: Patient = {
                ...result.data,
                id: String(result.data.id),
                name: result.data.name ?? ((`${newPatient.first_name} ${newPatient.last_name}`.trim()) || `Patient ${String(result.data.id)}`),
                gender: result.data.gender as 'Homme' | 'Femme' | undefined,
            }

            setPatients(prevPatients => [normalizedPatient, ...prevPatients])
            alert(`✅ Patient ${normalizedPatient.name} ajouté avec succès !`)
            setIsFormOpen(false)
            loadPatients()
        } else {
            alert(`❌ Erreur: ${result.error || 'Impossible d\'ajouter le patient'}`)
        }
    }

    const filteredPatients = patients.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.phone?.includes(searchTerm) ||
        p.dmiId?.includes(searchTerm)
    )

    const handleSelectPatient = (patientId: string) => {
        localStorage.setItem('selectedPatient', patientId)
        router.push(`/patient/${patientId}`)
    }

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-4 text-gray-500">Chargement...</p>
                </div>
            </div>
        )
    }

    if (!user) {
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
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                    <div>
                        <Link href="/dashboard" className="text-blue-600 hover:underline text-sm">
                            ← Retour au dashboard
                        </Link>
                        <h1 className="text-2xl font-bold text-gray-900 mt-1">👥 Tous les patients</h1>
                        <p className="text-gray-500 text-sm">{patients.length} patients au total</p>
                    </div>
                    <button
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium"
                        onClick={() => setIsFormOpen(true)}
                    >
                        ➕ Nouveau patient
                    </button>
                </div>

                {/* Recherche */}
                <div className="mb-6">
                    <SearchBar
                        value={searchTerm}
                        onChange={setSearchTerm}
                        placeholder="🔍 Rechercher par nom, ID, téléphone, DMI_ID..."
                    />
                </div>

                {/* Liste */}
                <section>
                    {filteredPatients.length === 0 ? (
                        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                            <span className="text-4xl block mb-4">🔍</span>
                            <h3 className="text-lg font-semibold text-gray-900">Aucun patient trouvé</h3>
                            <p className="text-gray-500 text-sm">
                                {patients.length === 0 
                                    ? 'Aucun patient n\'a encore été créé. Commencez par en ajouter un !'
                                    : 'Aucun patient ne correspond à votre recherche'
                                }
                            </p>
                            {patients.length === 0 && (
                                <button
                                    onClick={() => setIsFormOpen(true)}
                                    className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium"
                                >
                                    ➕ Créer un patient
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {filteredPatients.map((patient) => (
                                <PatientCard
                                    key={patient.id}
                                    patient={patient}
                                    onSelect={handleSelectPatient}
                                />
                            ))}
                        </div>
                    )}
                </section>

                {/* Statistiques */}
                {patients.length > 0 && (
                    <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-white p-4 rounded-xl border border-gray-200 text-center">
                            <div className="text-2xl font-bold text-blue-600">{patients.length}</div>
                            <div className="text-sm text-gray-500">Total patients</div>
                        </div>
                        <div className="bg-white p-4 rounded-xl border border-gray-200 text-center">
                            <div className="text-2xl font-bold text-green-600">
                                {patients.filter(p => p.lastSession?.includes(new Date().toISOString().slice(0,7))).length}
                            </div>
                            <div className="text-sm text-gray-500">Vus ce mois</div>
                        </div>
                        <div className="bg-white p-4 rounded-xl border border-gray-200 text-center">
                            <div className="text-2xl font-bold text-amber-500">
                                {patients.filter(p => p.age > 65).length}
                            </div>
                            <div className="text-sm text-gray-500">+65 ans</div>
                        </div>
                        <div className="bg-white p-4 rounded-xl border border-gray-200 text-center">
                            <div className="text-2xl font-bold text-purple-600">
                                {patients.filter(p => p.gender === 'Femme').length}
                            </div>
                            <div className="text-sm text-gray-500">Femmes</div>
                        </div>
                    </div>
                )}

                <div className="mt-6">
                    <EthicsBanner />
                </div>
            </main>

            {/* Modal Formulaire */}
            <PatientForm
                isOpen={isFormOpen}
                onClose={() => setIsFormOpen(false)}
                onSave={handleAddPatient}
            />
        </>
    )
}