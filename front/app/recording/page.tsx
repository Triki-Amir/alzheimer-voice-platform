// app/recording/page.tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import Navbar from '@/components/Navbar'
import EthicsBanner from '@/components/EthicsBanner'
import { mockPatients } from '@/lib/data'
import type { User, Patient } from '@/types'
import { AudioCleaner } from '@/components/VoiceRecorder/AudioCleaner'

type TestType = 
    | 'cookie_theft' 
    | 'fluency' 
    | 'recall' 
    | 'sentence'
    | 'naming'
    | 'repetition'
    | 'comprehension'
    | 'spontaneous'

interface TestConfig {
    id: TestType
    title: string
    subtitle: string
    description: string
    instructions: string[]
    duration: number
    icon: string
    imagePath?: string
    showWordList?: boolean
}

const testConfigs: Record<TestType, TestConfig> = {
    cookie_theft: {
        id: 'cookie_theft',
        title: 'Récit d\'image',
        subtitle: 'Cookie Theft',
        description: 'Décrivez l\'image en détail avec vos propres mots.',
        icon: '🖼️',
        duration: 180,
        imagePath: '/images/cookie-theft.jpg',
        instructions: ['Observez attentivement l\'image', 'Décrivez-la en détail']
    },
    fluency: {
        id: 'fluency',
        title: 'Fluence Verbale',
        subtitle: 'Animaux',
        description: 'Citez le plus d\'animaux possible en 1 minute.',
        icon: '🐾',
        duration: 60,
        instructions: ['Citez le plus d\'animaux possible en 1 minute'],
        showWordList: true
    },
    recall: {
        id: 'recall',
        title: 'Rappel d\'informations',
        subtitle: 'Mémoire',
        description: 'Écoutez puis rappelez le maximum d\'informations.',
        icon: '📝',
        duration: 120,
        instructions: ['Écoutez le texte', 'Rappelez le maximum d\'informations'],
        showWordList: true
    },
    sentence: {
        id: 'sentence',
        title: 'Construction de phrases',
        subtitle: 'Syntaxe',
        description: 'Construisez des phrases complexes.',
        icon: '✏️',
        duration: 120,
        instructions: ['Construisez des phrases complexes']
    },
    naming: {
        id: 'naming',
        title: 'Nomination d\'objets',
        subtitle: 'Vocabulaire',
        description: 'Nommez les objets que vous voyez.',
        icon: '🔍',
        duration: 180,
        imagePath: '/images/naming-objects.jpg',
        instructions: ['Nommez les objets que vous voyez']
    },
    repetition: {
        id: 'repetition',
        title: 'Répétition de phrases',
        subtitle: 'Mémoire à court terme',
        description: 'Répétez les phrases que vous allez entendre.',
        icon: '🔊',
        duration: 120,
        instructions: ['Répétez les phrases'],
        showWordList: true
    },
    comprehension: {
        id: 'comprehension',
        title: 'Compréhension',
        subtitle: 'Auditive',
        description: 'Répondez aux questions sur le texte.',
        icon: '🧠',
        duration: 180,
        instructions: ['Écoutez le texte', 'Répondez aux questions']
    },
    spontaneous: {
        id: 'spontaneous',
        title: 'Discours spontané',
        subtitle: 'Langage',
        description: 'Parlez librement sur un sujet proposé.',
        icon: '💬',
        duration: 300,
        instructions: ['Parlez librement sur le sujet proposé']
    }
}

interface VoiceMetric {
    level: string
    status: 'good' | 'warning' | 'error'
    percentage: number
}

interface VoiceMetrics {
    noise: VoiceMetric
    volume: VoiceMetric
    clarity: VoiceMetric
    rhythm: VoiceMetric
    isSilent: boolean
    silenceDuration: number
}

export default function RecordingPage() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [user, setUser] = useState<User | null>(null)
    const [patient, setPatient] = useState<Patient | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isRecording, setIsRecording] = useState(false)
    const [isPaused, setIsPaused] = useState(false)
    const [time, setTime] = useState(0)
    const [testType, setTestType] = useState<TestType>('cookie_theft')
    const [words, setWords] = useState<string[]>([])
    const [currentWord, setCurrentWord] = useState('')
    const [isComplete, setIsComplete] = useState(false)
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
    const [audioUrl, setAudioUrl] = useState<string | null>(null)
    const [isProcessing, setIsProcessing] = useState(false)
    const [processMessage, setProcessMessage] = useState<string | null>(null)
    const [cleanedAudioUrl, setCleanedAudioUrl] = useState<string | null>(null)
    const [cleanedMetrics, setCleanedMetrics] = useState<any>(null)

    const [voiceMetrics, setVoiceMetrics] = useState<VoiceMetrics>({
        noise: { level: 'Faible', status: 'good', percentage: 12 },
        volume: { level: 'Bon', status: 'good', percentage: 78 },
        clarity: { level: 'Excellente', status: 'good', percentage: 92 },
        rhythm: { level: 'Bon', status: 'good', percentage: 72 },
        isSilent: false,
        silenceDuration: 0
    })

    const mediaRecorderRef = useRef<MediaRecorder | null>(null)
    const audioContextRef = useRef<AudioContext | null>(null)
    const analyserRef = useRef<AnalyserNode | null>(null)
    const streamRef = useRef<MediaStream | null>(null)
    const animationFrameRef = useRef<number | null>(null)
    const audioChunksRef = useRef<BlobPart[]>([])
    const timerRef = useRef<NodeJS.Timeout | null>(null)

    const testConfig = testConfigs[testType]

    useEffect(() => {
        const userData = localStorage.getItem('user')
        if (!userData) {
            router.push('/')
            return
        }
        setUser(JSON.parse(userData))

        const patientId = searchParams?.get('patient')
        const testId = searchParams?.get('test') as TestType || 'cookie_theft'

        if (patientId) {
            const foundPatient = mockPatients.find(p => p.id === patientId)
            if (foundPatient) {
                setPatient(foundPatient)
            }
        }

        if (testId && testConfigs[testId]) {
            setTestType(testId)
        }

        setIsLoading(false)

        return () => {
            cleanupResources()
        }
    }, [router, searchParams])

    useEffect(() => {
        if (isRecording && !isPaused) {
            timerRef.current = setInterval(() => {
                setTime(prev => {
                    if (prev >= testConfig.duration) {
                        stopRecording()
                        return testConfig.duration
                    }
                    return prev + 1
                })
            }, 1000)
        } else if (timerRef.current) {
            clearInterval(timerRef.current)
        }

        return () => {
            if (timerRef.current) {
                clearInterval(timerRef.current)
            }
        }
    }, [isRecording, isPaused, testConfig.duration])

    const cleanupResources = () => {
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current)
        }
        if (timerRef.current) {
            clearInterval(timerRef.current)
        }
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            audioContextRef.current.close()
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop())
        }
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop()
        }
    }

    const calculateRMS = (dataArray: Uint8Array): number => {
        let sum = 0
        for (let i = 0; i < dataArray.length; i++) {
            const value = (dataArray[i] - 128) / 128
            sum += value * value
        }
        const rms = Math.sqrt(sum / dataArray.length)
        return Math.min(rms * 100, 100)
    }

    const analyzeAudio = () => {
        if (!analyserRef.current) return

        const analyser = analyserRef.current
        
        const timeDataArray = new Uint8Array(analyser.fftSize)
        analyser.getByteTimeDomainData(timeDataArray)
        const rms = calculateRMS(timeDataArray)
        
        const freqDataArray = new Uint8Array(analyser.frequencyBinCount)
        analyser.getByteFrequencyData(freqDataArray)
        
        let noiseSum = 0
        const noiseSamples = Math.min(20, freqDataArray.length)
        for (let i = 0; i < noiseSamples; i++) {
            noiseSum += freqDataArray[i] / 255
        }
        const noiseLevel = Math.min((noiseSum / noiseSamples) * 100, 100)
        
        const snr = Math.min(rms + 20, 100)

        const VOLUME_SILENCE_THRESHOLD = 3
        const VOLUME_LOW_THRESHOLD = 6
        const VOLUME_GOOD_THRESHOLD = 15
        const VOLUME_HIGH_THRESHOLD = 30

        const isSilent = rms < VOLUME_SILENCE_THRESHOLD
        let silenceDuration = voiceMetrics.silenceDuration

        if (isSilent) {
            silenceDuration += 0.1
        } else {
            silenceDuration = 0
        }

        setVoiceMetrics({
            noise: {
                level: noiseLevel < 30 ? 'Faible' : noiseLevel < 60 ? 'Moyen' : 'Élevé',
                status: noiseLevel < 30 ? 'good' : noiseLevel < 60 ? 'warning' : 'error',
                percentage: Math.round(noiseLevel)
            },
            volume: {
                level: rms > VOLUME_HIGH_THRESHOLD ? 'Élevé' 
                     : rms > VOLUME_GOOD_THRESHOLD ? 'Bon' 
                     : rms > VOLUME_LOW_THRESHOLD ? 'Faible' 
                     : 'Très faible',
                status: rms > VOLUME_GOOD_THRESHOLD ? 'good' 
                      : rms > VOLUME_LOW_THRESHOLD ? 'warning' 
                      : 'error',
                percentage: Math.round(rms)
            },
            clarity: {
                level: snr > 60 ? 'Excellente' : snr > 35 ? 'Bonne' : 'Moyenne',
                status: snr > 50 ? 'good' : snr > 30 ? 'warning' : 'error',
                percentage: Math.round(snr)
            },
            rhythm: {
                level: rms > 15 ? 'Bon' : rms > 8 ? 'Moyen' : 'Irregulier',
                status: rms > 15 ? 'good' : rms > 8 ? 'warning' : 'error',
                percentage: Math.round(rms * 0.8 + 20)
            },
            isSilent,
            silenceDuration: Math.round(silenceDuration)
        })

        animationFrameRef.current = requestAnimationFrame(analyzeAudio)
    }

    const cleanAudioWithAPI = async (blob: Blob) => {
        if (!blob || !patient) return

        setIsProcessing(true)
        setProcessMessage('🎙️ Nettoyage audio...')

        try {
            const formData = new FormData()
            formData.append('audio', blob, `${patient.id}_${testType}.webm`)
            formData.append('patientId', patient.id)
            formData.append('testType', testType)

            const response = await fetch('/api/denoise', {
                method: 'POST',
                body: formData
            })

            const result = await response.json()

            if (result.success) {
                const snr = result.metrics?.snr_db ?? '?'
                const reduction = result.metrics?.noise_reduction ?? '?'
                
                setProcessMessage(`✅ Nettoyé ! SNR: ${typeof snr === 'number' ? snr.toFixed(1) : snr} dB`)
                setCleanedMetrics(result.metrics)

                if (result.audioBase64) {
                    const cleanedBlob = AudioCleaner.base64ToBlob(result.audioBase64)
                    const url = URL.createObjectURL(cleanedBlob)
                    setCleanedAudioUrl(url)
                }
            } else {
                setProcessMessage(`❌ Erreur: ${result.error || 'Échec du nettoyage'}`)
            }

        } catch (error) {
            console.error('❌ Erreur nettoyage:', error)
            setProcessMessage('❌ Erreur lors du nettoyage')
        } finally {
            setIsProcessing(false)
        }
    }

    const processAndSaveAudio = async (blob: Blob) => {
        if (!blob || !patient) return
        
        const formData = new FormData()
        const originalFilename = `${patient.id}_${testType}_${new Date().toISOString().replace(/[:.]/g, '-')}.webm`
        formData.append('audio', blob, originalFilename)
        formData.append('patientId', patient.id)
        formData.append('testType', testType)

        try {
            await fetch('/api/upload', {
                method: 'POST',
                body: formData
            })
        } catch (e) {
            console.warn('⚠️ Sauvegarde originale:', e)
        }

        await cleanAudioWithAPI(blob)
    }

    const downloadAudio = (blob: Blob | null, suffix: string = '') => {
        if (!blob) return
        
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${patient?.id}_${testType}_${new Date().toISOString().slice(0,10)}${suffix}.wav`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    }

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                }
            })
            streamRef.current = stream

            const audioContext = new AudioContext()
            audioContextRef.current = audioContext

            const source = audioContext.createMediaStreamSource(stream)

            const analyser = audioContext.createAnalyser()
            analyser.fftSize = 2048
            analyserRef.current = analyser
            source.connect(analyser)

            const mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus'
            })
            mediaRecorderRef.current = mediaRecorder
            audioChunksRef.current = []

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data)
                }
            }

            mediaRecorder.onstop = () => {
                const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
                const url = URL.createObjectURL(blob)
                setAudioBlob(blob)
                setAudioUrl(url)
                setIsComplete(true)
                processAndSaveAudio(blob)
            }

            mediaRecorder.start(1000)
            analyzeAudio()
            
            setIsRecording(true)
            setIsPaused(false)
            setIsComplete(false)
            setTime(0)
            setWords([])
            setProcessMessage(null)

        } catch (error) {
            console.error('Erreur microphone:', error)
            alert('Impossible d\'accéder au microphone.')
        }
    }

    const togglePause = () => {
        if (!mediaRecorderRef.current) return

        if (isPaused) {
            mediaRecorderRef.current.resume()
            if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
                audioContextRef.current.resume()
            }
            analyzeAudio()
        } else {
            mediaRecorderRef.current.pause()
            if (audioContextRef.current && audioContextRef.current.state === 'running') {
                audioContextRef.current.suspend()
            }
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current)
            }
        }

        setIsPaused(!isPaused)
    }

    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop()
        }

        cleanupResources()
        setIsRecording(false)
        setIsPaused(false)
    }

    const handleRetry = () => {
        cleanupResources()
        setIsRecording(false)
        setIsPaused(false)
        setIsComplete(false)
        setTime(0)
        setWords([])
        setAudioBlob(null)
        setAudioUrl(null)
        setCleanedAudioUrl(null)
        setCleanedMetrics(null)
        setProcessMessage(null)
        setVoiceMetrics({
            noise: { level: 'Faible', status: 'good', percentage: 12 },
            volume: { level: 'Bon', status: 'good', percentage: 78 },
            clarity: { level: 'Excellente', status: 'good', percentage: 92 },
            rhythm: { level: 'Bon', status: 'good', percentage: 72 },
            isSilent: false,
            silenceDuration: 0
        })
    }

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60)
        const s = seconds % 60
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    }

    const handleAddWord = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && currentWord.trim()) {
            setWords([...words, currentWord.trim()])
            setCurrentWord('')
        }
    }

    const handleNextTest = () => {
        router.push('/dashboard')  // ✅ Modifié : redirige vers dashboard
    }

    const getStatusColor = (status: 'good' | 'warning' | 'error') => {
        switch (status) {
            case 'good': return 'text-green-600'
            case 'warning': return 'text-amber-500'
            case 'error': return 'text-red-500'
            default: return 'text-gray-500'
        }
    }

    const getStatusBg = (status: 'good' | 'warning' | 'error') => {
        switch (status) {
            case 'good': return 'bg-green-100'
            case 'warning': return 'bg-amber-100'
            case 'error': return 'bg-red-100'
            default: return 'bg-gray-100'
        }
    }

    const getStatusIcon = (status: 'good' | 'warning' | 'error') => {
        switch (status) {
            case 'good': return '✅'
            case 'warning': return '⚠️'
            case 'error': return '❌'
            default: return '⚪'
        }
    }

    const getStatusLabel = (status: 'good' | 'warning' | 'error') => {
        switch (status) {
            case 'good': return 'Bon'
            case 'warning': return 'Moyen'
            case 'error': return 'Faible'
            default: return '—'
        }
    }

    const getBarColor = (status: 'good' | 'warning' | 'error') => {
        switch (status) {
            case 'good': return 'bg-green-500'
            case 'warning': return 'bg-amber-500'
            case 'error': return 'bg-red-500'
            default: return 'bg-gray-400'
        }
    }

    if (isLoading || !user) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-4 text-gray-500 text-lg">Chargement...</p>
                </div>
            </div>
        )
    }

    return (
        <>
            <Header user={user} />
            <Navbar active="tests" />
            <main className="max-w-7xl mx-auto px-4 py-4">
                
                {/* En-tête */}
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                    <div className="flex items-center gap-3">
                        <Link href="/tests" className="text-blue-600 hover:underline text-sm font-medium">
                            ← Retour aux tests
                        </Link>
                        <span className="text-gray-300">|</span>
                        <span className="text-sm text-gray-500">
                            Patient: <span className="font-medium text-gray-700">{patient?.name}</span>
                        </span>
                        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                            {patient?.id}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-2xl">{testConfig.icon}</span>
                        <h1 className="text-xl font-bold text-gray-900">{testConfig.title}</h1>
                        <span className="text-sm text-gray-500">/ {testConfig.subtitle}</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-2xl font-mono font-bold text-blue-600">
                            ⏱️ {formatTime(time)}
                        </span>
                        <span className="text-base text-gray-400">/ {formatTime(testConfig.duration)}</span>
                    </div>
                </div>

                {/* Métriques en haut */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    <div className={`p-3 rounded-xl border-2 ${getStatusBg(voiceMetrics.volume.status)}`}>
                        <div className="flex justify-between items-center">
                            <span className="text-sm font-medium text-gray-600">Volume</span>
                            <span className={`text-sm font-bold ${getStatusColor(voiceMetrics.volume.status)}`}>
                                {voiceMetrics.volume.level}
                            </span>
                        </div>
                        <div className="w-full h-2 bg-gray-200 rounded-full mt-1 overflow-hidden">
                            <div className={`h-full ${getBarColor(voiceMetrics.volume.status)} rounded-full transition-all duration-500`} style={{ width: `${voiceMetrics.volume.percentage}%` }} />
                        </div>
                    </div>

                    <div className={`p-3 rounded-xl border-2 ${getStatusBg(voiceMetrics.noise.status)}`}>
                        <div className="flex justify-between items-center">
                            <span className="text-sm font-medium text-gray-600">Bruit</span>
                            <span className={`text-sm font-bold ${getStatusColor(voiceMetrics.noise.status)}`}>
                                {voiceMetrics.noise.level}
                            </span>
                        </div>
                        <div className="w-full h-2 bg-gray-200 rounded-full mt-1 overflow-hidden">
                            <div className={`h-full ${getBarColor(voiceMetrics.noise.status)} rounded-full transition-all duration-500`} style={{ width: `${voiceMetrics.noise.percentage}%` }} />
                        </div>
                    </div>

                    <div className={`p-3 rounded-xl border-2 ${getStatusBg(voiceMetrics.clarity.status)}`}>
                        <div className="flex justify-between items-center">
                            <span className="text-sm font-medium text-gray-600">Clarté</span>
                            <span className={`text-sm font-bold ${getStatusColor(voiceMetrics.clarity.status)}`}>
                                {voiceMetrics.clarity.level}
                            </span>
                        </div>
                        <div className="w-full h-2 bg-gray-200 rounded-full mt-1 overflow-hidden">
                            <div className={`h-full ${getBarColor(voiceMetrics.clarity.status)} rounded-full transition-all duration-500`} style={{ width: `${voiceMetrics.clarity.percentage}%` }} />
                        </div>
                    </div>

                    <div className={`p-3 rounded-xl border-2 ${getStatusBg(voiceMetrics.rhythm.status)}`}>
                        <div className="flex justify-between items-center">
                            <span className="text-sm font-medium text-gray-600">Rythme</span>
                            <span className={`text-sm font-bold ${getStatusColor(voiceMetrics.rhythm.status)}`}>
                                {voiceMetrics.rhythm.level}
                            </span>
                        </div>
                        <div className="w-full h-2 bg-gray-200 rounded-full mt-1 overflow-hidden">
                            <div className={`h-full ${getBarColor(voiceMetrics.rhythm.status)} rounded-full transition-all duration-500`} style={{ width: `${voiceMetrics.rhythm.percentage}%` }} />
                        </div>
                    </div>
                </div>

                {/* Image PLEINE LARGEUR + Boutons en dessous */}
                <div className="w-full bg-white border-4 border-gray-200 rounded-2xl p-2 shadow-xl mb-4">
                    {testConfig.imagePath ? (
                        <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-gray-100">
                            <img
                                src={testConfig.imagePath}
                                alt={testConfig.title}
                                className="object-contain w-full h-full"
                                onError={(e) => {
                                    const target = e.target as HTMLImageElement
                                    target.style.display = 'none'
                                }}
                            />
                        </div>
                    ) : (
                        <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-gray-100 flex items-center justify-center">
                            <div className="text-center text-gray-400">
                                <span className="text-8xl block mb-4">{testConfig.icon}</span>
                                <p className="text-2xl font-semibold text-gray-600">{testConfig.title}</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Boutons en dessous de l'image */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    {/* Timer + Contrôles */}
                    <div className="md:col-span-1">
                        <div className="bg-white border-4 border-gray-200 rounded-2xl p-4 shadow-xl h-full">
                            <div className="text-center mb-3">
                                <div className="text-4xl font-bold text-blue-600 font-mono">
                                    {formatTime(time)}
                                </div>
                                <div className="text-xs text-gray-500">/ {formatTime(testConfig.duration)}</div>
                            </div>

                            {isComplete ? (
                                <button onClick={handleRetry} className="w-full py-3 bg-amber-500 text-white text-lg font-bold rounded-xl hover:bg-amber-600 transition">
                                    🔄 Recommencer
                                </button>
                            ) : !isRecording ? (
                                <button onClick={startRecording} className="w-full py-3 bg-red-600 text-white text-xl font-bold rounded-xl hover:bg-red-700 transition shadow">
                                    🔴 Démarrer
                                </button>
                            ) : (
                                <div className="space-y-2">
                                    <div className="text-center">
                                        <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${isPaused ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                                            🎙️ {isPaused ? 'Pause' : 'Enregistrement'}
                                        </span>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={togglePause} className="flex-1 py-2.5 bg-amber-500 text-white text-lg font-bold rounded-xl hover:bg-amber-600 transition">
                                            {isPaused ? '▶️' : '⏸️'}
                                        </button>
                                        <button onClick={stopRecording} className="flex-1 py-2.5 bg-gray-600 text-white text-lg font-bold rounded-xl hover:bg-gray-700 transition">
                                            ⏹️
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Consignes + Navigation */}
                    <div className="md:col-span-2">
                        <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-4 h-full flex flex-col justify-between">
                            <div>
                                <p className="text-xs font-medium text-blue-600">📋 Consignes</p>
                                <p className="text-sm text-blue-800 mt-1 line-clamp-2">
                                    {testConfig.instructions?.[0] || 'Suivez les instructions'}
                                </p>
                            </div>
                            <div className="flex gap-3 mt-3">
                                <button onClick={() => router.push('/tests')} className="flex-1 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-200 transition">
                                    ← Tests
                                </button>
                                <button onClick={handleNextTest} className="flex-1 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition">
                                    Suivant →
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Télécharger + Qualité */}
                    <div className="md:col-span-1">
                        <div className="bg-gray-50 border-2 border-gray-200 rounded-2xl p-4 h-full flex flex-col justify-between">
                            <div>
                                <p className="text-xs text-gray-500">Durée estimée</p>
                                <p className="text-sm font-medium text-gray-700">{testConfig.duration}</p>
                                {isComplete && processMessage && (
                                    <p className={`text-xs mt-1 ${processMessage.includes('✅') ? 'text-green-600' : 'text-amber-600'}`}>
                                        {processMessage}
                                    </p>
                                )}
                            </div>
                            <button className="w-full py-2 bg-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-300 transition mt-2">
                                💾 Télécharger
                            </button>
                        </div>
                    </div>
                </div>

                {/* Alerte silence */}
                {voiceMetrics.isSilent && voiceMetrics.silenceDuration > 3 && (
                    <div className="mt-3 p-3 bg-amber-100 border-2 border-amber-300 rounded-xl text-center">
                        <span className="text-amber-700 font-bold text-sm">🗣️ Silence prolongé</span>
                        <p className="text-amber-600 text-xs">Patient ne parle pas depuis {voiceMetrics.silenceDuration}s</p>
                    </div>
                )}

                {/* Mots (si showWordList) */}
                {testConfig.showWordList && (
                    <div className="mt-4 bg-white border-4 border-gray-200 rounded-2xl p-4 shadow-xl">
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="text-sm font-bold text-gray-700">📝 Mots cités</h3>
                            <span className="text-xl font-bold text-blue-600">{words.length}</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                            {words.map((word, index) => (
                                <span key={index} className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                                    {index + 1}. {word}
                                </span>
                            ))}
                            {isRecording && !isPaused && (
                                <input
                                    type="text"
                                    value={currentWord}
                                    onChange={(e) => setCurrentWord(e.target.value)}
                                    onKeyDown={handleAddWord}
                                    placeholder="Ajouter..."
                                    className="flex-1 min-w-[100px] px-3 py-1 border-2 border-blue-300 rounded-full focus:border-blue-500 focus:outline-none text-sm"
                                    autoFocus
                                />
                            )}
                        </div>
                        {words.length === 0 && !isRecording && (
                            <p className="text-sm text-gray-400 text-center">Commencez l'enregistrement</p>
                        )}
                    </div>
                )}

                {isComplete && (
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                        <button onClick={() => downloadAudio(audioBlob, '_original')} className="py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition" disabled={!audioBlob}>
                            💾 Télécharger original
                        </button>
                        <button onClick={() => { if (cleanedAudioUrl) { fetch(cleanedAudioUrl).then(res => res.blob()).then(blob => downloadAudio(blob, '_cleaned')) } }} className="py-3 bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700 transition" disabled={!cleanedAudioUrl}>
                            💾 Télécharger nettoyé
                        </button>
                    </div>
                )}

                <div className="mt-6">
                    <EthicsBanner />
                </div>
            </main>
        </>
    )
}