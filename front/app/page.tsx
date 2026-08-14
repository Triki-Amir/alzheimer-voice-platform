'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
    loginStep1,
    setup2FA,
    confirm2FA,
    verify2FA,
    saveSession,
    AuthError,
} from '@/lib/auth'

type Step = 'credentials' | 'setup-2fa' | 'verify-2fa' | 'backup-codes'

export default function LoginPage() {
    const router = useRouter()
    const [step, setStep] = useState<Step>('credentials')

    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)

    const [preAuthToken, setPreAuthToken] = useState('')
    const [code, setCode] = useState('')
    const [qrCodeBase64, setQrCodeBase64] = useState('')
    const [totpSecret, setTotpSecret] = useState('')
    const [backupCodes, setBackupCodes] = useState<string[]>([])
    const [pendingAccessToken, setPendingAccessToken] = useState('')

    const [error, setError] = useState('')
    const [isLoading, setIsLoading] = useState(false)

    // ==================== ETAPE 1 : email + mot de passe ====================
    const handleCredentialsSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        setIsLoading(true)

        try {
            const result = await loginStep1(email, password)
            console.log('loginStep1 result:', result)
            setPreAuthToken(result.preAuthToken)

            if (result.requiresSetup) {
                const setup = await setup2FA(result.preAuthToken)
                setQrCodeBase64(setup.qrCodeBase64)
                setTotpSecret(setup.secret)
                setStep('setup-2fa')
            } else {
                setStep('verify-2fa')
            }
        } catch (err) {
            setError(describeError(err))
        } finally {
            setIsLoading(false)
        }
    }

    // ==================== ETAPE 2a : confirmer la 2FA (premiere fois) ====================
    const handleConfirmSetup = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        setIsLoading(true)

        try {
            const result = await confirm2FA(preAuthToken, code)
            setBackupCodes(result.backupCodes)
            setPendingAccessToken(result.accessToken)
            setStep('backup-codes')
        } catch (err) {
            setError(describeError(err))
        } finally {
            setIsLoading(false)
        }
    }

    // ==================== ETAPE 2b : verifier la 2FA (connexions suivantes) ====================
    const handleVerify2FA = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        setIsLoading(true)

        try {
            const accessToken = await verify2FA(preAuthToken, code)
            saveSession(accessToken)
            router.push('/dashboard')
        } catch (err) {
            setError(describeError(err))
        } finally {
            setIsLoading(false)
        }
    }

    const handleContinueAfterBackupCodes = () => {
        saveSession(pendingAccessToken)
        router.push('/dashboard')
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-600 to-blue-800 p-4">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-blue-600">eHealthBridge</h1>
                    <p className="text-gray-500 text-sm">Voix - Alzheimer - IA</p>
                </div>

                {error && (
                    <div className="mb-4 p-3 bg-red-50 border-2 border-red-200 text-red-600 rounded-xl text-sm">
                        {error}
                    </div>
                )}

                {step === 'credentials' && (
                    <>
                        <h2 className="text-xl font-semibold mb-6">🔐 Connexion Médecin</h2>
                        <form onSubmit={handleCredentialsSubmit}>
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    👤 Identifiant
                                </label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full h-12 px-4 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none bg-gray-50"
                                    placeholder="dr.exemple@ehb.tn"
                                    required
                                    autoFocus
                                />
                            </div>

                            <div className="mb-6">
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    🔒 Mot de passe
                                </label>
                                <div className="relative">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full h-12 px-4 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none bg-gray-50 pr-12"
                                        placeholder="•••••••••••••"
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                                    >
                                        {showPassword ? '🙈' : '👁️'}
                                    </button>
                                </div>
                            </div>

                            <button
                                type="submit"
                                className="w-full h-12 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                disabled={isLoading}
                            >
                                {isLoading ? '⏳ Connexion...' : '🔑 Se connecter'}
                            </button>

                            <div className="mt-4 text-center">
                                <Link href="/register" className="text-blue-600 hover:underline text-sm font-medium">
                                    👤 Pas de compte ? S'inscrire
                                </Link>
                            </div>

                            <div className="mt-6 text-center">
                                <hr className="mb-4 border-gray-200" />
                                <p className="text-xs text-gray-500">🔒 Conforme INPDP & RGPD</p>
                            </div>
                        </form>
                    </>
                )}

                {step === 'setup-2fa' && (
                    <>
                        <h2 className="text-xl font-semibold mb-2">📱 Configurer la double authentification</h2>
                        <p className="text-sm text-gray-500 mb-4">
                            Obligatoire à la première connexion. Scannez ce QR code avec Google Authenticator,
                            Authy ou une app équivalente, puis entrez le code à 6 chiffres généré.
                        </p>

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

                        <form onSubmit={handleConfirmSetup}>
                            <div className="mb-6">
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
                                className="w-full h-12 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                disabled={isLoading || code.length !== 6}
                            >
                                {isLoading ? '⏳ Vérification...' : '✅ Activer la 2FA'}
                            </button>
                        </form>
                    </>
                )}

                {step === 'verify-2fa' && (
                    <>
                        <h2 className="text-xl font-semibold mb-2">📱 Code de vérification</h2>
                        <p className="text-sm text-gray-500 mb-6">
                            Entrez le code à 6 chiffres de votre application d'authentification
                            (ou un code de secours).
                        </p>

                        <form onSubmit={handleVerify2FA}>
                            <div className="mb-6">
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    value={code}
                                    onChange={(e) => setCode(e.target.value)}
                                    className="w-full h-12 px-4 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none bg-gray-50 text-center text-lg tracking-widest"
                                    placeholder="000000"
                                    required
                                    autoFocus
                                />
                            </div>

                            <button
                                type="submit"
                                className="w-full h-12 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                disabled={isLoading || code.length === 0}
                            >
                                {isLoading ? '⏳ Vérification...' : '✅ Valider'}
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    setStep('credentials')
                                    setCode('')
                                    setError('')
                                }}
                                className="w-full mt-3 text-sm text-gray-500 hover:underline"
                            >
                                ← Retour
                            </button>
                        </form>
                    </>
                )}

                {step === 'backup-codes' && (
                    <>
                        <h2 className="text-xl font-semibold mb-2">🗝️ Codes de secours</h2>
                        <p className="text-sm text-gray-500 mb-4">
                            Conservez ces codes en lieu sûr. Chacun ne peut être utilisé qu'une seule fois
                            si vous perdez l'accès à votre application d'authentification. Ils ne seront
                            plus jamais affichés.
                        </p>

                        <div className="grid grid-cols-2 gap-2 mb-6 p-4 bg-gray-50 rounded-xl border-2 border-gray-200">
                            {backupCodes.map((c) => (
                                <span key={c} className="font-mono text-sm text-center py-1">{c}</span>
                            ))}
                        </div>

                        <button
                            onClick={handleContinueAfterBackupCodes}
                            className="w-full h-12 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition"
                        >
                            J'ai enregistré mes codes → Continuer
                        </button>
                    </>
                )}
            </div>
        </div>
    )
}

function describeError(err: unknown): string {
    if (err instanceof AuthError) {
        if (err.status === 0) return 'Impossible de contacter le serveur'
        if (err.status === 423) return err.message
        if (err.status === 401) return 'Identifiant, mot de passe ou code invalide'
        return err.message
    }
    return 'Erreur de connexion au serveur'
}