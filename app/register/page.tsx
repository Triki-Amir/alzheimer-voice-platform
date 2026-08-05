// app/register/page.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import DoctorVoiceRecorder from '@/components/VoiceRecorder/DoctorVoiceRecorder'
import type { DoctorRegistrationData, PracticeType } from '@/types'

const HOSPITALS = [
    'Hôpital Sahloul - Sousse',
    'Hôpital Charles Nicolle - Tunis',
    'Hôpital La Rabta - Tunis',
    'Hôpital Militaire - Tunis',
    'Hôpital Fattouma Bourguiba - Monastir',
    'Autre'
]

const PRACTICE_TYPES: { value: PracticeType; label: string }[] = [
    { value: 'hospital', label: '🏥 Hôpital' },
    { value: 'clinic', label: '🏨 Clinique' },
    { value: 'cabinet', label: '🏪 Cabinet médical' },
    { value: 'other', label: '📋 Autre' }
]

export default function RegisterPage() {
    const router = useRouter()
    const [step, setStep] = useState(1)
    const [formData, setFormData] = useState<DoctorRegistrationData>({
        firstName: '',
        lastName: '',
        email: '',
        password: '',
        practiceType: 'hospital',
        hospital: '',
        hospitalOther: '',
        clinicName: '',
        clinicAddress: '',
        phone: ''
    })
    const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null)
    const [voiceDuration, setVoiceDuration] = useState(0)
    const [isLoading, setIsLoading] = useState(false)
    const [isSendingEmail, setIsSendingEmail] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)
    const [emailSent, setEmailSent] = useState(false)
    const [verificationCode, setVerificationCode] = useState('')
    const [enteredCode, setEnteredCode] = useState('')

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target
        setFormData(prev => ({ ...prev, [name]: value }))
    }

    const handleVoiceRecording = (blob: Blob, duration: number) => {
        setVoiceBlob(blob)
        setVoiceDuration(duration)
        setError(null)
    }

    // ==================== ÉTAPE 1 : ENVOI DU CODE DE VÉRIFICATION ====================
    const sendVerificationEmail = async () => {
        if (!formData.email) {
            setError('Veuillez entrer votre email.')
            return
        }

        setIsSendingEmail(true)
        setError(null)

        try {
            const code = Math.floor(100000 + Math.random() * 900000).toString()
            setVerificationCode(code)

            // Simuler l'envoi d'un email
            await new Promise(resolve => setTimeout(resolve, 1500))

            console.log(`📧 Code de vérification pour ${formData.email}: ${code}`)
            setEmailSent(true)
            setError(null)

        } catch (err) {
            console.error('Erreur envoi email:', err)
            setError('Erreur lors de l\'envoi de l\'email. Veuillez réessayer.')
        } finally {
            setIsSendingEmail(false)
        }
    }

    // ==================== ÉTAPE 1 : VÉRIFICATION DU CODE ====================
    const verifyCode = () => {
        if (enteredCode === verificationCode) {
            setStep(2)
            setError(null)
        } else {
            setError('Code de vérification incorrect. Veuillez réessayer.')
        }
    }

    // ==================== ÉTAPE 2 : INSCRIPTION FINALE ====================
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        setIsLoading(true)

        // Validation
        if (!formData.firstName || !formData.lastName || !formData.email || !formData.password) {
            setError('Veuillez remplir tous les champs obligatoires.')
            setIsLoading(false)
            return
        }

        if (formData.practiceType !== 'cabinet' && !formData.hospital) {
            setError('Veuillez sélectionner un hôpital ou une clinique.')
            setIsLoading(false)
            return
        }

        if (formData.practiceType === 'cabinet' && !formData.clinicName) {
            setError('Veuillez entrer le nom de votre cabinet.')
            setIsLoading(false)
            return
        }

        if (!voiceBlob) {
            setError('Veuillez enregistrer votre voix de référence.')
            setIsLoading(false)
            return
        }

        if (voiceDuration < 3) {
            setError("L'enregistrement doit durer au moins 3 secondes.")
            setIsLoading(false)
            return
        }

        try {
            // 1. Upload de la voix du médecin
            const voiceFormData = new FormData()
            const filename = `${formData.firstName}_${formData.lastName}_${Date.now()}_reference.wav`
            voiceFormData.append('audio', voiceBlob, filename)
            voiceFormData.append('firstName', formData.firstName)
            voiceFormData.append('lastName', formData.lastName)
            
            let hospitalValue = formData.hospital
            if (formData.practiceType === 'cabinet') {
                hospitalValue = `Cabinet: ${formData.clinicName}`
            } else if (formData.hospital === 'Autre' && formData.hospitalOther) {
                hospitalValue = formData.hospitalOther
            }
            voiceFormData.append('hospital', hospitalValue)
            voiceFormData.append('practiceType', formData.practiceType)

            const voiceResponse = await fetch('/api/upload-doctor-voice', {
                method: 'POST',
                body: voiceFormData
            })

            if (!voiceResponse.ok) {
                throw new Error('Erreur lors de l\'enregistrement de la voix')
            }

            const voiceResult = await voiceResponse.json()

            // 2. Sauvegarder les données du médecin
            const doctorData = {
                ...formData,
                hospital: hospitalValue,
                voiceReferenceId: voiceResult.voiceId,
                voiceReferenceUrl: voiceResult.path,
                isVerified: true,
                createdAt: new Date().toISOString()
            }

            localStorage.setItem('doctorData', JSON.stringify(doctorData))

            setSuccess(true)
            setTimeout(() => {
                router.push('/dashboard')
            }, 2000)

        } catch (err) {
            console.error('Erreur:', err)
            setError('Une erreur est survenue. Veuillez réessayer.')
        } finally {
            setIsLoading(false)
        }
    }

    const getHospitalDisplay = (hospital: string) => {
        if (hospital === 'Hôpital Sahloul - Sousse') return '🏥 Sahloul'
        if (hospital === 'Hôpital Charles Nicolle - Tunis') return '🏥 Charles Nicolle'
        if (hospital === 'Hôpital La Rabta - Tunis') return '🏥 La Rabta'
        if (hospital === 'Hôpital Militaire - Tunis') return '🏥 Militaire'
        if (hospital === 'Hôpital Fattouma Bourguiba - Monastir') return '🏥 Fattouma Bourguiba'
        return '🏥 Autre'
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center p-4">
            <div className="w-full max-w-4xl bg-white rounded-3xl shadow-2xl p-8">
                {/* Header */}
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-blue-600">eHealthBridge</h1>
                    <p className="text-gray-500 text-sm">Voix - Alzheimer - IA</p>
                    <h2 className="text-2xl font-bold text-gray-900 mt-4">📝 Inscription Médecin</h2>
                    
                    {/* Indicateur d'étapes */}
                    <div className="flex items-center justify-center gap-4 mt-4">
                        <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                                step === 1 ? 'bg-blue-600 text-white' : 'bg-green-500 text-white'
                            }`}>
                                {step === 1 ? '1' : '✓'}
                            </div>
                            <span className={`text-sm ${step === 1 ? 'font-semibold text-blue-600' : 'text-gray-400'}`}>
                                Confirmation
                            </span>
                        </div>
                        <div className={`w-16 h-0.5 ${step >= 2 ? 'bg-green-500' : 'bg-gray-300'}`} />
                        <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                                step === 2 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-400'
                            }`}>
                                2
                            </div>
                            <span className={`text-sm ${step === 2 ? 'font-semibold text-blue-600' : 'text-gray-400'}`}>
                                Enregistrement
                            </span>
                        </div>
                    </div>
                </div>

                {success ? (
                    <div className="text-center py-8">
                        <div className="text-6xl mb-4">✅</div>
                        <h3 className="text-2xl font-bold text-green-600">Inscription réussie !</h3>
                        <p className="text-gray-500 mt-2">Redirection vers le tableau de bord...</p>
                    </div>
                ) : (
                    <>
                        {error && (
                            <div className="p-4 bg-red-50 border-2 border-red-300 rounded-xl text-red-700 mb-4">
                                ❌ {error}
                            </div>
                        )}

                        {step === 1 ? (
                            // ==================== ÉTAPE 1 : EMAIL + CODE ====================
                            <div className="space-y-6">
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
                                            className="w-full h-12 px-4 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
                                            placeholder="Maher"
                                            required
                                        />
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
                                            className="w-full h-12 px-4 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
                                            placeholder="Abouda"
                                            required
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Email <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="email"
                                        name="email"
                                        value={formData.email}
                                        onChange={handleChange}
                                        className="w-full h-12 px-4 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
                                        placeholder="dr.mabouda@ehb.tn"
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Mot de passe <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="password"
                                        name="password"
                                        value={formData.password}
                                        onChange={handleChange}
                                        className="w-full h-12 px-4 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
                                        placeholder="••••••••"
                                        required
                                        minLength={6}
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Type de pratique <span className="text-red-500">*</span>
                                    </label>
                                    <select
                                        name="practiceType"
                                        value={formData.practiceType}
                                        onChange={handleChange}
                                        className="w-full h-12 px-4 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none bg-white"
                                        required
                                    >
                                        {PRACTICE_TYPES.map((type) => (
                                            <option key={type.value} value={type.value}>
                                                {type.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {formData.practiceType === 'hospital' || formData.practiceType === 'clinic' || formData.practiceType === 'other' ? (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            {formData.practiceType === 'hospital' ? 'Hôpital' : 'Clinique'} <span className="text-red-500">*</span>
                                        </label>
                                        <select
                                            name="hospital"
                                            value={formData.hospital}
                                            onChange={handleChange}
                                            className="w-full h-12 px-4 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none bg-white"
                                            required={formData.practiceType === 'hospital' || formData.practiceType === 'clinic' || formData.practiceType === 'other'}
                                        >
                                            <option value="">Sélectionnez...</option>
                                            {HOSPITALS.map((hospital) => (
                                                <option key={hospital} value={hospital}>
                                                    {getHospitalDisplay(hospital)}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                ) : (
                                    <>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Nom du cabinet <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                name="clinicName"
                                                value={formData.clinicName}
                                                onChange={handleChange}
                                                className="w-full h-12 px-4 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
                                                placeholder="Cabinet du Dr. Nom"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Adresse du cabinet
                                            </label>
                                            <input
                                                type="text"
                                                name="clinicAddress"
                                                value={formData.clinicAddress}
                                                onChange={handleChange}
                                                className="w-full h-12 px-4 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
                                                placeholder="123 Rue de la République, Tunis"
                                            />
                                        </div>
                                    </>
                                )}

                                {formData.hospital === 'Autre' && formData.practiceType !== 'cabinet' && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Nom de l'établissement <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            name="hospitalOther"
                                            value={formData.hospitalOther}
                                            onChange={handleChange}
                                            className="w-full h-12 px-4 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
                                            placeholder="Nom de votre établissement"
                                            required
                                        />
                                    </div>
                                )}

                                {!emailSent ? (
                                    <button
                                        type="button"
                                        onClick={sendVerificationEmail}
                                        disabled={isSendingEmail || !formData.email}
                                        className="w-full py-3 bg-blue-600 text-white text-lg font-bold rounded-2xl hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isSendingEmail ? '⏳ Envoi en cours...' : '📧 Envoyer le code de confirmation'}
                                    </button>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="p-4 bg-green-50 border-2 border-green-300 rounded-xl text-green-700">
                                            ✅ Un code de confirmation a été envoyé à <strong>{formData.email}</strong>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Code de confirmation
                                            </label>
                                            <input
                                                type="text"
                                                value={enteredCode}
                                                onChange={(e) => setEnteredCode(e.target.value)}
                                                className="w-full h-12 px-4 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
                                                placeholder="Entrez le code reçu par email"
                                                maxLength={6}
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            onClick={verifyCode}
                                            className="w-full py-3 bg-green-600 text-white text-lg font-bold rounded-2xl hover:bg-green-700 transition"
                                        >
                                            ✅ Vérifier le code
                                        </button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            // ==================== ÉTAPE 2 : ENREGISTREMENT VOCAL ====================
                            <form onSubmit={handleSubmit} className="space-y-6">
                                <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
                                    <p className="text-blue-800 font-medium">
                                        🔐 Étape 2 : Enregistrement vocal de référence
                                    </p>
                                    <p className="text-blue-600 text-sm mt-1">
                                        Veuillez enregistrer votre voix pour permettre la distinction entre vous et le patient lors des tests.
                                    </p>
                                </div>

                                <div>
                                    <DoctorVoiceRecorder
                                        onRecordingComplete={handleVoiceRecording}
                                    />
                                    {voiceBlob && (
                                        <p className="text-sm text-green-600 mt-2">
                                            ✅ Enregistrement terminé ({voiceDuration}s)
                                        </p>
                                    )}
                                </div>

                                <div className="flex gap-4">
                                    <button
                                        type="button"
                                        onClick={() => setStep(1)}
                                        className="flex-1 py-3 bg-gray-200 text-gray-700 text-lg font-bold rounded-2xl hover:bg-gray-300 transition"
                                    >
                                        ← Retour
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isLoading}
                                        className="flex-1 py-4 bg-blue-600 text-white text-xl font-bold rounded-2xl hover:bg-blue-700 transition shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isLoading ? '⏳ Inscription en cours...' : '✅ Finaliser l\'inscription'}
                                    </button>
                                </div>
                            </form>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}