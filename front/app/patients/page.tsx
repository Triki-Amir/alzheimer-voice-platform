'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import Navbar from '@/components/Navbar'
import PatientCard from '@/components/PatientCard'
import SearchBar from '@/components/SearchBar'
import EthicsBanner from '@/components/EthicsBanner'
import { mockPatients } from '@/lib/data'
import type { Patient, User } from '@/types'

export default function PatientsPage() {
    const router = useRouter()
    const [searchTerm, setSearchTerm] = useState('')
    const [patients, setPatients] = useState<Patient[]>(mockPatients)
    const [user, setUser] = useState<User | null>(null)

    useEffect(() => {
        const userData = localStorage.getItem('user')
        if (!userData) {
            router.push('/')
        } else {
            setUser(JSON.parse(userData))
        }
    }, [router])

    const filteredPatients = patients.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.phone?.includes(searchTerm) ||
        p.email?.includes(searchTerm)
    )

    const handleSelectPatient = (patientId: string) => {
        localStorage.setItem('selectedPatient', patientId)
        router.push('/tests')
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
                {/* Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                    <div>
                        <Link
                            href="/dashboard"
                            className="text-blue-600 hover:underline text-sm"
                        >
                            ← Retour au dashboard
                        </Link>
                        <h1 className="text-2xl font-bold text-gray-900 mt-1">
                            👥 Tous les patients
                        </h1>
                        <p className="text-gray-500 text-sm">
                            {patients.length} patients au total
                        </p>
                    </div>
                    <button
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium"
                        onClick={() => router.push('/dashboard')}
                    >
                        ➕ Nouveau patient
                    </button>
                </div>

                {/* Recherche */}
                <div className="mb-6">
                    <SearchBar
                        value={searchTerm}
                        onChange={setSearchTerm}
                        placeholder="🔍 Rechercher par nom, ID, téléphone, email..."
                    />
                </div>

                {/* Liste */}
                <section>
                    {filteredPatients.length === 0 ? (
                        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                            <span className="text-4xl block mb-4">🔍</span>
                            <h3 className="text-lg font-semibold text-gray-900">Aucun patient trouvé</h3>
                            <p className="text-gray-500 text-sm">
                                Aucun patient ne correspond à votre recherche
                            </p>
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
                <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white p-4 rounded-xl border border-gray-200 text-center">
                        <div className="text-2xl font-bold text-blue-600">{patients.length}</div>
                        <div className="text-sm text-gray-500">Total patients</div>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-gray-200 text-center">
                        <div className="text-2xl font-bold text-green-600">
                            {patients.filter(p => p.lastSession.includes('07/2026')).length}
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

                <div className="mt-6">
                    <EthicsBanner />
                </div>
            </main>
        </>
    )
}