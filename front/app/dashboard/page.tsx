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
import { mockPatients } from '@/lib/data'
import type { Patient, User, PatientFormData } from '@/types'

export default function DashboardPage() {
    const router = useRouter()
    const [searchTerm, setSearchTerm] = useState('')
    const [patients, setPatients] = useState<Patient[]>(mockPatients)
    const [filteredPatients, setFilteredPatients] = useState<Patient[]>(mockPatients)
    const [user, setUser] = useState<User | null>(null)
    const [isFormOpen, setIsFormOpen] = useState(false)

    // Vérifier l'authentification
    useEffect(() => {
        const userData = localStorage.getItem('user')
        if (!userData) {
            router.push('/')
        } else {
            setUser(JSON.parse(userData))
        }
    }, [router])

    // Filtrer les patients
    useEffect(() => {
        const filtered = patients.filter(p =>
            p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.phone?.includes(searchTerm)
        )
        setFilteredPatients(filtered)
    }, [searchTerm, patients])

    // MODIFICATION ICI : Rediriger vers /patient/[id]
    const handleSelectPatient = (patientId: string) => {
        router.push(`/patient/${patientId}`)
    }

    const handleAddPatient = (formData: PatientFormData) => {
        const newPatient: Patient = {
            id: `PAT_${String(patients.length + 1).padStart(6, '0')}`,
            name: `${formData.firstName} ${formData.lastName}`,
            initials: `${formData.firstName[0]}${formData.lastName[0]}`,
            age: new Date().getFullYear() - new Date(formData.birthDate).getFullYear(),
            birthDate: formData.birthDate,
            phone: formData.phone,
            email: formData.email,
            gender: formData.gender,
            address: formData.address,
            lastSession: new Date().toLocaleDateString('fr-FR'),
            color: ['#2563EB', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'][Math.floor(Math.random() * 6)],
            createdAt: new Date().toISOString()
        }

        setPatients([newPatient, ...patients])
        alert(`✅ Patient ${newPatient.name} ajouté avec succès !`)
        setIsFormOpen(false)
    }

    if (!user) {
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
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                {/* Section Sélection */}
                <section className="mb-8">
                    <div className="mb-4">
                        <h2 className="text-2xl font-bold text-gray-900">
                            📋 Sélection du Patient / Session
                        </h2>
                        <p className="text-gray-500 text-sm">
                            Gérez les fiches patients ou créez-en une nouvelle.
                        </p>
                    </div>
                    <SearchBar
                        value={searchTerm}
                        onChange={setSearchTerm}
                        placeholder="🔍 Rechercher un patient (nom, ID, téléphone...)"
                    />
                </section>

                {/* Liste patients */}
                <section className="mb-8">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                        <h3 className="text-lg font-semibold text-gray-900">
                            👥 Patients récents ({filteredPatients.length})
                        </h3>
                        <button
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium"
                            onClick={() => setIsFormOpen(true)}
                        >
                            ➕ Nouveau patient
                        </button>
                    </div>

                    <div className="space-y-3">
                        {filteredPatients.length === 0 ? (
                            <div className="text-center py-8 text-gray-500">
                                Aucun patient trouvé
                            </div>
                        ) : (
                            filteredPatients.slice(0, 5).map((patient) => (
                                <PatientCard
                                    key={patient.id}
                                    patient={patient}
                                    onSelect={handleSelectPatient}
                                />
                            ))
                        )}

                        {/* Voir tous */}
                        <Link href="/patients">
                            <div className="flex items-center justify-center p-4 border-2 border-dashed border-gray-300 rounded-xl hover:border-blue-500 hover:bg-blue-50 cursor-pointer transition">
                                <div className="text-center">
                                    <span className="text-2xl block text-blue-600">📋</span>
                                    <span className="text-blue-600 font-medium">Voir tous les patients</span>
                                    <span className="text-gray-400 block text-sm">
                                        {patients.length} patients au total ▼
                                    </span>
                                </div>
                            </div>
                        </Link>
                    </div>
                </section>

                <EthicsBanner />
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