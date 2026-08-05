'use client'

import { useState } from 'react'
import type { PatientFormData } from '@/types'

interface PatientFormProps {
    isOpen: boolean
    onClose: () => void
    onSave: (patient: PatientFormData) => void
}

export default function PatientForm({ isOpen, onClose, onSave }: PatientFormProps) {
    const [formData, setFormData] = useState<PatientFormData>({
        firstName: '',
        lastName: '',
        birthDate: '',
        phone: '',
        email: '',
        gender: 'Homme',
        address: ''
    })

    const [errors, setErrors] = useState<Partial<PatientFormData>>({})

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target
        setFormData(prev => ({ ...prev, [name]: value }))
        // Effacer l'erreur du champ
        if (errors[name as keyof PatientFormData]) {
            setErrors(prev => ({ ...prev, [name]: '' }))
        }
    }

    const validate = (): boolean => {
        const newErrors: Partial<PatientFormData> = {}

        if (!formData.firstName.trim()) newErrors.firstName = 'Le prénom est requis'
        if (!formData.lastName.trim()) newErrors.lastName = 'Le nom est requis'
        if (!formData.birthDate) newErrors.birthDate = 'La date de naissance est requise'
        
        if (formData.phone && !/^[0-9+\s]{8,15}$/.test(formData.phone)) {
            newErrors.phone = 'Numéro de téléphone invalide'
        }
        
        if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
            newErrors.email = 'Email invalide'
        }

        setErrors(newErrors)
        return Object.keys(newErrors).length === 0
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (validate()) {
            onSave(formData)
            // Reset form
            setFormData({
                firstName: '',
                lastName: '',
                birthDate: '',
                phone: '',
                email: '',
                gender: 'Homme',
                address: ''
            })
            onClose()
        }
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 rounded-t-2xl flex justify-between items-center">
                    <h2 className="text-xl font-semibold text-gray-900">➕ Nouveau Patient</h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition text-2xl"
                    >
                        ✕
                    </button>
                </div>

                {/* Formulaire */}
                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    {/* Ligne 1: Prénom + Nom */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Prénom <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                name="firstName"
                                value={formData.firstName}
                                onChange={handleChange}
                                className={`w-full h-12 px-4 border-2 rounded-xl focus:outline-none transition ${
                                    errors.firstName ? 'border-red-500 focus:border-red-500' : 'border-gray-200 focus:border-blue-500'
                                }`}
                                placeholder="Mohamed"
                            />
                            {errors.firstName && (
                                <p className="mt-1 text-sm text-red-500">{errors.firstName}</p>
                            )}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Nom <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                name="lastName"
                                value={formData.lastName}
                                onChange={handleChange}
                                className={`w-full h-12 px-4 border-2 rounded-xl focus:outline-none transition ${
                                    errors.lastName ? 'border-red-500 focus:border-red-500' : 'border-gray-200 focus:border-blue-500'
                                }`}
                                placeholder="Trabelsi"
                            />
                            {errors.lastName && (
                                <p className="mt-1 text-sm text-red-500">{errors.lastName}</p>
                            )}
                        </div>
                    </div>

                    {/* Ligne 2: Date de naissance + Genre */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Date de naissance <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="date"
                                name="birthDate"
                                value={formData.birthDate}
                                onChange={handleChange}
                                className={`w-full h-12 px-4 border-2 rounded-xl focus:outline-none transition ${
                                    errors.birthDate ? 'border-red-500 focus:border-red-500' : 'border-gray-200 focus:border-blue-500'
                                }`}
                            />
                            {errors.birthDate && (
                                <p className="mt-1 text-sm text-red-500">{errors.birthDate}</p>
                            )}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Genre
                            </label>
                            <select
                                name="gender"
                                value={formData.gender}
                                onChange={handleChange}
                                className="w-full h-12 px-4 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition bg-white"
                            >
                                <option value="Homme">Homme</option>
                                <option value="Femme">Femme</option>
                            </select>
                        </div>
                    </div>

                    {/* Ligne 3: Téléphone + Email */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Téléphone
                            </label>
                            <input
                                type="tel"
                                name="phone"
                                value={formData.phone}
                                onChange={handleChange}
                                className={`w-full h-12 px-4 border-2 rounded-xl focus:outline-none transition ${
                                    errors.phone ? 'border-red-500 focus:border-red-500' : 'border-gray-200 focus:border-blue-500'
                                }`}
                                placeholder="+216 24 541 135"
                            />
                            {errors.phone && (
                                <p className="mt-1 text-sm text-red-500">{errors.phone}</p>
                            )}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Email
                            </label>
                            <input
                                type="email"
                                name="email"
                                value={formData.email}
                                onChange={handleChange}
                                className={`w-full h-12 px-4 border-2 rounded-xl focus:outline-none transition ${
                                    errors.email ? 'border-red-500 focus:border-red-500' : 'border-gray-200 focus:border-blue-500'
                                }`}
                                placeholder="patient@email.com"
                            />
                            {errors.email && (
                                <p className="mt-1 text-sm text-red-500">{errors.email}</p>
                            )}
                        </div>
                    </div>

                    {/* Ligne 4: Adresse */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Adresse
                        </label>
                        <textarea
                            name="address"
                            value={formData.address}
                            onChange={handleChange}
                            rows={2}
                            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition resize-none"
                            placeholder="Adresse complète"
                        />
                    </div>

                    {/* Champs obligatoires */}
                    <p className="text-sm text-gray-500">
                        <span className="text-red-500">*</span> Champs obligatoires
                    </p>

                    {/* Boutons */}
                    <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-200">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 h-12 px-6 border-2 border-gray-300 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition"
                        >
                            Annuler
                        </button>
                        <button
                            type="submit"
                            className="flex-1 h-12 px-6 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition"
                        >
                            💾 Enregistrer le patient
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}