'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { User } from '@/types'

export default function LoginPage() {
    const router = useRouter()
    const [email, setEmail] = useState('dr.mabouda@ehb.tn')
    const [password, setPassword] = useState('password123')
    const [showPassword, setShowPassword] = useState(false)
    const [error, setError] = useState('')
    const [isLoading, setIsLoading] = useState(false)

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        setIsLoading(true)

        try {
            // Simulation d'un délai réseau
            await new Promise(resolve => setTimeout(resolve, 800))

            // Vérification des identifiants
            if (email === 'dr.mabouda@ehb.tn' && password === 'password123') {
                const user: User = {
                    id: 'USER_001',  // ✅ ID ajouté
                    email,
                    name: 'Dr. Maher Abouda',
                    role: 'doctor',
                    hospital: 'Hôpital Sahloul - Sousse'
                }
                localStorage.setItem('user', JSON.stringify(user))
                
                // Récupérer la voix du médecin
                await getDoctorVoiceReference(user.id)
                
                router.push('/dashboard')
            } else {
                setError('Identifiant ou mot de passe incorrect')
            }
        } catch (error) {
            console.error('Erreur de connexion:', error)
            setError('Erreur de connexion au serveur')
        } finally {
            setIsLoading(false)
        }
    }

    // ==================== RÉCUPÉRATION DE LA VOIX DU MÉDECIN ====================
    const getDoctorVoiceReference = async (doctorId: string) => {
        try {
            const response = await fetch('/api/doctors')
            const result = await response.json()
            
            if (result.success && result.doctors) {
                // ✅ Vérification correcte
                const doctor = result.doctors.find((d: any) => 
                    d.voiceId === doctorId || 
                    d.doctorId === doctorId ||
                    d.id === doctorId
                )
                
                if (doctor) {
                    console.log('✅ Voix de référence du médecin trouvée:', doctor.filename)
                    localStorage.setItem('doctorVoiceRef', JSON.stringify(doctor))
                    return doctor
                } else {
                    console.log('ℹ️ Aucune voix de référence trouvée pour ce médecin')
                    return null
                }
            }
            return null
        } catch (error) {
            console.error('❌ Erreur récupération voix médecin:', error)
            return null
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-600 to-blue-800 p-4">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8">
                {/* Header */}
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-blue-600">eHealthBridge</h1>
                    <p className="text-gray-500 text-sm">Voix - Alzheimer - IA</p>
                </div>

                <h2 className="text-xl font-semibold mb-6">🔐 Connexion Médecin</h2>

                {error && (
                    <div className="mb-4 p-3 bg-red-50 border-2 border-red-200 text-red-600 rounded-xl text-sm">
                        {error}
                    </div>
                )}

                <form onSubmit={handleLogin}>
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            👤 Identifiant
                        </label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full h-12 px-4 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none bg-gray-50"
                            placeholder="dr.mabouda@ehb.tn"
                            required
                        />
                    </div>

                    <div className="mb-4">
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

                    <div className="flex justify-between items-center mb-6">
                        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                            <input type="checkbox" defaultChecked className="accent-blue-600 w-4 h-4" />
                            Se souvenir de moi
                        </label>
                        <a href="#" className="text-sm text-blue-600 hover:underline">
                            Mot de passe oublié ?
                        </a>
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
            </div>
        </div>
    )
}