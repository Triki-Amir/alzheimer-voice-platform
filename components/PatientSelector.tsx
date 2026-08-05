'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Patient } from '@/types'

interface PatientSelectorProps {
    patients: Patient[]
    onSelectPatient: (patientId: string) => void
    onAddNew: () => void
}

export default function PatientSelector({ patients, onSelectPatient, onAddNew }: PatientSelectorProps) {
    const [searchTerm, setSearchTerm] = useState('')
    const [showAll, setShowAll] = useState(false)

    const filteredPatients = patients.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.id.toLowerCase().includes(searchTerm.toLowerCase())
    )

    const displayedPatients = showAll ? filteredPatients : filteredPatients.slice(0, 3)

    return (
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                <div>
                    <h2 className="text-xl font-bold text-gray-900">👤 Sélectionner un patient</h2>
                    <p className="text-sm text-gray-500">
                        Choisissez un patient existant ou créez une nouvelle fiche
                    </p>
                </div>
                <button
                    onClick={onAddNew}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium"
                >
                    ➕ Nouveau patient
                </button>
            </div>

            {/* Barre de recherche */}
            <div className="mb-4">
                <input
                    type="text"
                    className="w-full h-12 px-4 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none bg-gray-50"
                    placeholder="🔍 Rechercher un patient par nom ou ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            {/* Liste des patients */}
            {filteredPatients.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                    <span className="text-4xl block mb-2">🔍</span>
                    <p>Aucun patient trouvé</p>
                    <button
                        onClick={onAddNew}
                        className="mt-2 text-blue-600 hover:underline font-medium"
                    >
                        ➕ Créer un nouveau patient
                    </button>
                </div>
            ) : (
                <div className="space-y-2">
                    {displayedPatients.map((patient) => (
                        <div
                            key={patient.id}
                            className="flex items-center justify-between p-3 border border-gray-100 rounded-lg hover:border-blue-500 hover:bg-blue-50 cursor-pointer transition"
                            onClick={() => onSelectPatient(patient.id)}
                        >
                            <div className="flex items-center gap-3">
                                <div
                                    className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm flex-shrink-0"
                                    style={{ backgroundColor: patient.color }}
                                >
                                    {patient.initials}
                                </div>
                                <div>
                                    <div className="font-medium text-gray-900">{patient.name}</div>
                                    <div className="text-sm text-gray-500">
                                        {patient.id} • {patient.age} ans • Dernière session: {patient.lastSession}
                                    </div>
                                </div>
                            </div>
                            <button className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition">
                                Sélectionner
                            </button>
                        </div>
                    ))}

                    {filteredPatients.length > 3 && (
                        <button
                            onClick={() => setShowAll(!showAll)}
                            className="w-full text-center text-blue-600 hover:underline text-sm py-2 font-medium"
                        >
                            {showAll ? 'Voir moins ▲' : `Voir tous les patients (${filteredPatients.length}) ▼`}
                        </button>
                    )}
                </div>
            )}

            {/* Lien vers la liste complète */}
            <div className="mt-4 pt-4 border-t border-gray-200">
                <Link href="/patients" className="text-blue-600 hover:underline text-sm">
                    📋 Gérer tous les patients →
                </Link>
            </div>
        </div>
    )
}