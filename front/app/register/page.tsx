// app/register/page.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import DoctorVoiceRecorder from '@/components/VoiceRecorder/DoctorVoiceRecorder'
import {
    registerDoctor,
    loginStep1,
    setup2FA,
    confirm2FA,
    enrollDoctorVoice,
    AuthError,
} from '@/lib/auth'
import type { DoctorRegistrationData, PracticeType, User } from '@/types'

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

// NOTE: le backend (schemas.DoctorRegister) ne stocke aujourd'hui que
// email / password / name / family_name. Les champs hôpital / type de
// pratique / téléphone sont conservés côté front (localStorage, keyed par
// doctor id) pour l'affichage — pas encore de colonne côté auth-service.
// A migrer vers de vraies colonnes si ces infos doivent être partagées
// entre navigateurs/appareils.
const PROFILE_EXTRA_KEY = 'ehealth_doctor_profile_extra'
const USER_KEY = 'user'
const API_URL = '/auth'

type Step = 'info' | 'setup-2fa' | 'backup-codes' | 'voice'

export default function RegisterPage() {
    const router = useRouter()
    const [step, setStep] = useState<Step>('info')

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

    // Etat du flow 2FA (identique au login: setup obligatoire à l'inscription)
    const [preAuthToken, setPreAuthToken] = useState('')
    const [code, setCode] = useState('')
    const [qrCodeBase64, setQrCodeBase64] = useState('')
    const [totpSecret, setTotpSecret] = useState('')
    const [backupCodes, setBackupCodes] = useState<string[]>([])

    const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null)
    const [voiceDuration, setVoiceDuration] = useState(0)

    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target
        setFormData(prev => ({ ...prev, [name]: value }))
    }

    const handleVoiceRecording = (blob: Blob, duration: number) => {
        setVoiceBlob(blob)
        setVoiceDuration(duration)
        setError(null)
    }

    const getHospitalDisplay = (hospital: string) => {
        if (hospital === 'Hôpital Sahloul - Sousse') return '🏥 Sahloul'
        if (hospital === 'Hôpital Charles Nicolle - Tunis') return '🏥 Charles Nicolle'
        if (hospital === 'Hôpital La Rabta - Tunis') return '🏥 La Rabta'
        if (hospital === 'Hôpital Militaire - Tunis') return '🏥 Militaire'
        if (hospital === 'Hôpital Fattouma Bourguiba - Monastir') return '🏥 Fattouma Bourguiba'
        return '🏥 Autre'
    }

    // ✅ Récupérer l'utilisateur depuis le backend via le cookie
    const fetchUserFromBackend = async (): Promise<User | null> => {
        try {
            const response = await fetch(`${API_URL}/verify`, {
                credentials: 'include',  // ✅ Envoie le cookie automatiquement
            })
            if (!response.ok) return null
            const data = await response.json()
            const user: User = {
                id: data.sub,
                email: data.email,
                role: data.role || 'clinician',
                name: data.email?.split('@')[0] ?? 'Docteur',
            }
            localStorage.setItem(USER_KEY, JSON.stringify(user))
            return user
        } catch (error) {
            console.error('❌ Erreur récupération utilisateur:', error)
            return null
        }
    }

    // ==================== ÉTAPE 1 : inscription (email + mdp) ====================
    const handleInfoSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)

        if (!formData.firstName || !formData.lastName || !formData.email || !formData.password) {
            setError('Veuillez remplir tous les champs obligatoires.')
            return
        }
        if (formData.practiceType !== 'cabinet' && !formData.hospital) {
            setError('Veuillez sélectionner un hôpital ou une clinique.')
            return
        }
        if (formData.practiceType === 'cabinet' && !formData.clinicName) {
            setError('Veuillez entrer le nom de votre cabinet.')
            return
        }

        setIsLoading(true)
        try {
            // 1. Créer le compte médecin côté auth-service
            await registerDoctor(formData.email, formData.password, formData.firstName, formData.lastName)

            // 2. Login immédiat pour récupérer le pre_auth_token, puis lancer
            //    la configuration 2FA obligatoire (la 2FA n'est jamais activée
            //    par /doctors/register lui-même).
            const loginResult = await loginStep1(formData.email, formData.password)
            setPreAuthToken(loginResult.preAuthToken)

            const setup = await setup2FA(loginResult.preAuthToken)
            setQrCodeBase64(setup.qrCodeBase64)
            setTotpSecret(setup.secret)
            setStep('setup-2fa')
        } catch (err) {
            setError(describeError(err))
        } finally {
            setIsLoading(false)
        }
    }

    // ==================== ÉTAPE 2 : confirmer la 2FA ====================
    const handleConfirm2FA = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        setIsLoading(true)

        try {
            const result = await confirm2FA(preAuthToken, code)
            // ✅ Le token est dans le cookie - pas besoin de le stocker
            // On garde juste les backup codes
            setBackupCodes(result.backupCodes)
            setStep('backup-codes')
        } catch (err) {
            setError(describeError(err))
        } finally {
            setIsLoading(false)
        }
    }

    // ==================== ÉTAPE 3 : enregistrement vocal de référence ====================
    const handleVoiceSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)

        if (!voiceBlob) {
            setError('Veuillez enregistrer votre voix de référence.')
            return
        }
        if (voiceDuration < 3) {
            setError("L'enregistrement doit durer au moins 3 secondes.")
            return
        }

        setIsLoading(true)
        try {
            const filename = `${formData.firstName}_${formData.lastName}_${Date.now()}_reference.wav`
            
            // ✅ Le cookie est envoyé automatiquement avec credentials: 'include'
            await enrollDoctorVoice(voiceBlob, filename)

            // ✅ Récupérer l'utilisateur depuis le backend via le cookie
            const user = await fetchUserFromBackend()
            
            if (user) {
                let hospitalValue = formData.hospital
                if (formData.practiceType === 'cabinet') {
                    hospitalValue = `Cabinet: ${formData.clinicName}`
                } else if (formData.hospital === 'Autre' && formData.hospitalOther) {
                    hospitalValue = formData.hospitalOther
                }
                const existingRaw = localStorage.getItem(PROFILE_EXTRA_KEY)
                const existing = existingRaw ? JSON.parse(existingRaw) : {}
                existing[user.id] = {
                    practiceType: formData.practiceType,
                    hospital: hospitalValue,
                    clinicAddress: formData.clinicAddress,
                    phone: formData.phone,
                }
                localStorage.setItem(PROFILE_EXTRA_KEY, JSON.stringify(existing))
            }

            setSuccess(true)
            setTimeout(() => {
                router.push('/dashboard')
            }, 1500)
        } catch (err) {
            console.error('🔴 RAW ERROR:', err)
            setError(describeError(err))
        } finally {
            setIsLoading(false)
        }
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
                    <div className="flex items-center justify-center gap-3 mt-4 flex-wrap">
                        {(['info', 'setup-2fa', 'backup-codes', 'voice'] as Step[]).map((s, i) => {
                            const order: Step[] = ['info', 'setup-2fa', 'backup-codes', 'voice']
                            const currentIdx = order.indexOf(step)
                            const thisIdx = order.indexOf(s)
                            const labels: Record<Step, string> = {
                                'info': 'Informations',
                                'setup-2fa': 'Double authentification',
                                'backup-codes': 'Codes de secours',
                                'voice': 'Voix de référence',
                            }
                            return (
                                <div key={s} className="flex items-center gap-2">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                                        thisIdx < currentIdx ? 'bg-green-500 text-white' :
                                        thisIdx === currentIdx ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-400'
                                    }`}>
                                        {thisIdx < currentIdx ? '✓' : i + 1}
                                    </div>
                                    <span className={`text-xs ${thisIdx === currentIdx ? 'font-semibold text-blue-600' : 'text-gray-400'}`}>
                                        {labels[s]}
                                    </span>
                                    {i < 3 && <div className="w-6 h-0.5 bg-gray-300 ml-1" />}
                                </div>
                            )
                        })}
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

                        {step === 'info' && (
                            <form onSubmit={handleInfoSubmit} className="space-y-6">
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
                                        minLength={10}
                                    />
                                    <p className="text-xs text-gray-400 mt-1">
                                        Au moins 10 caractères, avec une majuscule, une minuscule et un chiffre.
                                    </p>
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
                                            Nom de l&apos;établissement <span className="text-red-500">*</span>
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

                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="w-full py-3 bg-blue-600 text-white text-lg font-bold rounded-2xl hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isLoading ? '⏳ Création du compte...' : '➡️ Continuer'}
                                </button>

                                <div className="text-center">
                                    <Link href="/" className="text-blue-600 hover:underline text-sm font-medium">
                                        Déjà un compte ? Se connecter
                                    </Link>
                                </div>
                            </form>
                        )}

                        {step === 'setup-2fa' && (
                            <div>
                                <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 mb-4">
                                    <p className="text-blue-800 font-medium">📱 Configurer la double authentification</p>
                                    <p className="text-blue-600 text-sm mt-1">
                                        Obligatoire pour tous les médecins. Scannez ce QR code avec Google Authenticator,
                                        Authy ou une app équivalente, puis entrez le code à 6 chiffres généré.
                                    </p>
                                </div>

                                {qrCodeBase64 && (
                                    <div className="flex justify-center mb-4">
                                        <img
                                            src={`data:image/png;base64,${qrCodeBase64}`}
                                            alt="QR code 2FA"
                                            className="w-48 h-48 border-2 border-gray-200 rounded-xl"
                                        />
                                    </div>
                                )}

                                {totpSecret && (
                                    <p className="text-xs text-center text-gray-400 mb-4 break-all">
                                        Ou entrez la clé manuellement : <span className="font-mono">{totpSecret}</span>
                                    </p>
                                )}

                                <form onSubmit={handleConfirm2FA} className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Code à 6 chiffres
                                        </label>
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            maxLength={6}
                                            value={code}
                                            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                                            className="w-full h-12 px-4 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none bg-gray-50 text-center text-lg tracking-widest"
                                            placeholder="000000"
                                            required
                                            autoFocus
                                        />
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={isLoading || code.length !== 6}
                                        className="w-full py-3 bg-blue-600 text-white text-lg font-bold rounded-2xl hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isLoading ? '⏳ Vérification...' : '✅ Activer la 2FA'}
                                    </button>
                                </form>
                            </div>
                        )}

                        {step === 'backup-codes' && (
                            <div>
                                <h3 className="text-xl font-semibold mb-2">🗝️ Codes de secours</h3>
                                <p className="text-sm text-gray-500 mb-4">
                                    Conservez ces codes en lieu sûr. Chacun ne peut être utilisé qu&apos;une seule fois
                                    si vous perdez l&apos;accès à votre application d&apos;authentification. Ils ne seront
                                    plus jamais affichés.
                                </p>

                                <div className="grid grid-cols-2 gap-2 mb-6 p-4 bg-gray-50 rounded-xl border-2 border-gray-200">
                                    {backupCodes.map((c) => (
                                        <span key={c} className="font-mono text-sm text-center py-1">{c}</span>
                                    ))}
                                </div>

                                <button
                                    onClick={() => setStep('voice')}
                                    className="w-full h-12 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition"
                                >
                                    J&apos;ai enregistré mes codes → Continuer
                                </button>
                            </div>
                        )}

                        {step === 'voice' && (
                            <form onSubmit={handleVoiceSubmit} className="space-y-6">
                                <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
                                    <p className="text-blue-800 font-medium">
                                        🎙️ Enregistrement vocal de référence
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

                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="w-full py-4 bg-blue-600 text-white text-xl font-bold rounded-2xl hover:bg-blue-700 transition shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isLoading ? '⏳ Envoi en cours...' : "✅ Finaliser l'inscription"}
                                </button>
                            </form>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}

function describeError(err: unknown): string {
    if (err instanceof AuthError) {
        if (err.status === 0) return 'Impossible de contacter le serveur'
        if (err.status === 400) return err.message
        if (err.status === 423) return err.message
        return err.message
    }
    return 'Erreur de connexion au serveur'
}