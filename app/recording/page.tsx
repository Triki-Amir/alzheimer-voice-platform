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
        instructions: [
            'Observez attentivement l\'image',
            'Décrivez-la en détail avec vos propres mots',
            'Parlez à voix haute, de manière claire et complète',
            'Décrivez les personnages, les actions et les objets',
            'Prenez le temps nécessaire pour une description complète'
        ]
    },
    fluency: {
        id: 'fluency',
        title: 'Fluence Verbale',
        subtitle: 'Animaux',
        description: 'Citez le plus d\'animaux possible en 1 minute.',
        icon: '🐾',
        duration: 60,
        instructions: [
            'Je vais vous dire une catégorie : "les animaux"',
            'Pendant 1 minute, dites-moi le plus d\'animaux possible',
            'Chaque animal doit être différent',
            'Vous pouvez commencer'
        ],
        showWordList: true
    },
    recall: {
        id: 'recall',
        title: 'Rappel d\'informations',
        subtitle: 'Mémoire',
        description: 'Écoutez attentivement, puis rappelez le maximum d\'informations.',
        icon: '📝',
        duration: 120,
        instructions: [
            'Vous allez entendre un court texte',
            'Écoutez-le attentivement',
            'Quand le texte sera terminé, rappelez le plus d\'informations possible',
            'Rappelez les détails, faits, personnages, lieux et actions'
        ],
        showWordList: true
    },
    sentence: {
        id: 'sentence',
        title: 'Construction de phrases',
        subtitle: 'Syntaxe',
        description: 'Construisez des phrases complexes à partir de mots donnés.',
        icon: '✏️',
        duration: 120,
        instructions: [
            'Je vais vous donner des mots',
            'Construisez une phrase complète avec ces mots',
            'Essayez de faire des phrases complexes',
            'Utilisez tous les mots proposés'
        ]
    },
    naming: {
        id: 'naming',
        title: 'Nomination d\'objets',
        subtitle: 'Vocabulaire',
        description: 'Nommez les objets que vous voyez sur les images.',
        icon: '🔍',
        duration: 180,
        imagePath: '/images/naming-objects.jpg',
        instructions: [
            'Je vais vous montrer des images une par une',
            'Nommez chaque objet que vous voyez',
            'Prenez votre temps, il n\'y a pas de limite de temps',
            'Si vous ne connaissez pas un mot, passez à l\'image suivante'
        ]
    },
    repetition: {
        id: 'repetition',
        title: 'Répétition de phrases',
        subtitle: 'Mémoire à court terme',
        description: 'Répétez les phrases que vous allez entendre.',
        icon: '🔊',
        duration: 120,
        instructions: [
            'Je vais vous lire des phrases',
            'Répétez chaque phrase exactement comme vous l\'avez entendue',
            'Commencez par les phrases courtes, puis les plus longues',
            'Faites de votre mieux pour être précis'
        ],
        showWordList: true
    },
    comprehension: {
        id: 'comprehension',
        title: 'Compréhension',
        subtitle: 'Auditive',
        description: 'Répondez aux questions sur le texte que vous avez entendu.',
        icon: '🧠',
        duration: 180,
        instructions: [
            'Vous allez entendre un court texte',
            'Écoutez-le attentivement',
            'Puis répondez aux questions sur ce que vous avez compris',
            'Prenez le temps de réfléchir avant de répondre'
        ]
    },
    spontaneous: {
        id: 'spontaneous',
        title: 'Discours spontané',
        subtitle: 'Langage',
        description: 'Parlez librement sur un sujet proposé.',
        icon: '💬',
        duration: 300,
        instructions: [
            'Je vais vous proposer un sujet',
            'Parlez-en librement pendant quelques minutes',
            'Raccontez ce qui vous vient à l\'esprit',
            'Il n\'y a pas de bonne ou mauvaise réponse'
        ]
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

    // États pour le module d'enregistrement
    const [voiceMetrics, setVoiceMetrics] = useState<VoiceMetrics>({
        noise: { level: 'Faible', status: 'good', percentage: 12 },
        volume: { level: 'Bon', status: 'good', percentage: 78 },
        clarity: { level: 'Excellente', status: 'good', percentage: 92 },
        rhythm: { level: 'Bon', status: 'good', percentage: 72 },
        isSilent: false,
        silenceDuration: 0
    })

    // Refs pour l'audio
    const mediaRecorderRef = useRef<MediaRecorder | null>(null)
    const audioContextRef = useRef<AudioContext | null>(null)
    const analyserRef = useRef<AnalyserNode | null>(null)
    const streamRef = useRef<MediaStream | null>(null)
    const animationFrameRef = useRef<number | null>(null)
    const audioChunksRef = useRef<BlobPart[]>([])
    const timerRef = useRef<NodeJS.Timeout | null>(null)

    const testConfig = testConfigs[testType]

    // Effet 1 : Chargement initial
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

    // Effet 2 : Timer de durée
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

    // Nettoyage des ressources
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

    // Calcul du RMS (Root Mean Square)
    const calculateRMS = (dataArray: Uint8Array): number => {
        let sum = 0
        for (let i = 0; i < dataArray.length; i++) {
            const value = (dataArray[i] - 128) / 128
            sum += value * value
        }
        const rms = Math.sqrt(sum / dataArray.length)
        return Math.min(rms * 100, 100)
    }

    // ==================== ANALYSE AUDIO AVEC SEUILS ADAPTÉS ====================
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

    // ==================== NETTOYAGE AVEC API RNNOISE ====================
    // app/recording/page.tsx - cleanAudioWithAPI

const cleanAudioWithAPI = async (blob: Blob) => {
    if (!blob || !patient) return

    setIsProcessing(true)
    setProcessMessage('🎙️ Nettoyage audio avec RNNoise...')

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
            // ✅ Vérifier et afficher les métriques correctement
            const snr = result.metrics?.snr_db ?? '?'
            const reduction = result.metrics?.noise_reduction ?? '?'
            
            setProcessMessage(`✅ Audio nettoyé ! SNR: ${typeof snr === 'number' ? snr.toFixed(1) : snr} dB, Réduction: ${typeof reduction === 'number' ? reduction.toFixed(1) : reduction}%`)
            setCleanedMetrics(result.metrics)

            // Créer l'URL pour l'audio nettoyé
            if (result.audioBase64) {
                const cleanedBlob = AudioCleaner.base64ToBlob(result.audioBase64)
                const url = URL.createObjectURL(cleanedBlob)
                setCleanedAudioUrl(url)
            }

            console.log('📊 Métriques RNNoise:', result.metrics)
        } else {
            setProcessMessage(`❌ Erreur: ${result.error || 'Échec du nettoyage'}`)
        }

    } catch (error) {
        console.error('❌ Erreur nettoyage:', error)
        setProcessMessage('❌ Erreur lors du nettoyage audio')
    } finally {
        setIsProcessing(false)
    }
}

    // ==================== TRAITEMENT COMPLET DE L'AUDIO ====================
    const processAndSaveAudio = async (blob: Blob) => {
        if (!blob || !patient) return
        
        // 1. Sauvegarder l'original
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

        // 2. Lancer le nettoyage
        await cleanAudioWithAPI(blob)
    }

    // ==================== TÉLÉCHARGEMENT LOCAL ====================
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

    // ==================== TEST DE QUALITÉ AUDIO ====================
    const testAudioQuality = async (blob: Blob) => {
        try {
            const arrayBuffer = await blob.arrayBuffer()
            const audioContext = new AudioContext()
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
            
            const channelData = audioBuffer.getChannelData(0)
            let sum = 0
            let max = 0
            
            for (let i = 0; i < channelData.length; i++) {
                const sample = Math.abs(channelData[i])
                sum += sample * sample
                if (sample > max) max = sample
            }
            
            const rms = Math.sqrt(sum / channelData.length)
            const peak = max
            const rmsDb = 20 * Math.log10(rms)
            const peakDb = 20 * Math.log10(peak)
            
            let evaluation = '✅ Excellente'
            if (rmsDb < -20) { evaluation = '✅ Bonne' }
            if (rmsDb < -30) { evaluation = '⚠️ Moyenne' }
            if (rmsDb < -40) { evaluation = '❌ Faible' }
            
            alert(`📊 Analyse Audio:
Volume RMS: ${(rms * 100).toFixed(1)}% (${rmsDb.toFixed(1)} dB)
Peak: ${(peak * 100).toFixed(1)}% (${peakDb.toFixed(1)} dB)
Durée: ${audioBuffer.duration.toFixed(1)}s
Qualité: ${evaluation}

💡 Interprétation:
• > -20 dB: Excellente
• -20 à -30 dB: Bonne
• -30 à -40 dB: Moyenne
• < -40 dB: Faible`)
            
        } catch (error) {
            console.error('Erreur analyse:', error)
            alert('❌ Impossible d\'analyser l\'audio')
        }
    }

    // Démarrer l'enregistrement
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
                // ✅ Lancer le traitement (nettoyage + sauvegarde)
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
            alert('Impossible d\'accéder au microphone. Veuillez vérifier les permissions.')
        }
    }

    // Mettre en pause / reprendre
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

    // Arrêter l'enregistrement
    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop()
        }

        cleanupResources()
        setIsRecording(false)
        setIsPaused(false)
    }

    // Réinitialiser
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
        router.push('/tests')
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

    // ==================== VALIDATION QUALITÉ ADAPTÉE ====================
    const validateAudioQuality = (): { valid: boolean; score: number; issues: string[] } => {
        const issues: string[] = []
        let score = 100

        const VOLUME_MIN_ACCEPTABLE = 3
        const VOLUME_WARNING = 5
        const SILENCE_MAX_ACCEPTABLE = 5
        const SILENCE_WARNING = 3

        if (voiceMetrics.volume.percentage < VOLUME_MIN_ACCEPTABLE) {
            issues.push('Volume très faible (< 3%) - Vérifiez le microphone')
            score -= 30
        } else if (voiceMetrics.volume.percentage < VOLUME_WARNING) {
            issues.push('Volume faible (< 5%) - Essayez de parler plus fort')
            score -= 15
        }

        if (voiceMetrics.noise.percentage > 70) {
            issues.push('Bruit trop élevé (> 70%)')
            score -= 25
        } else if (voiceMetrics.noise.percentage > 50) {
            issues.push('Bruit élevé (> 50%)')
            score -= 10
        }

        if (voiceMetrics.clarity.percentage < 25) {
            issues.push('Clarté insuffisante (< 25%)')
            score -= 20
        }

        if (voiceMetrics.silenceDuration > SILENCE_MAX_ACCEPTABLE) {
            issues.push(`Silence trop long (${voiceMetrics.silenceDuration}s > ${SILENCE_MAX_ACCEPTABLE}s)`)
            score -= 20
        } else if (voiceMetrics.silenceDuration > SILENCE_WARNING) {
            issues.push(`Silence long (${voiceMetrics.silenceDuration}s > ${SILENCE_WARNING}s)`)
            score -= 10
        }

        const minDuration = testConfig.duration * 0.25
        if (time < minDuration) {
            issues.push(`Enregistrement trop court (${time}s < ${Math.round(minDuration)}s)`)
            score -= 15
        }

        if (testConfig.showWordList && words.length < 2) {
            issues.push(`Peu de mots cités (${words.length} < 2)`)
            score -= 10
        }

        return {
            valid: issues.length === 0 && score >= 60,
            score: Math.max(0, score),
            issues
        }
    }

    const qualityResult = isComplete ? validateAudioQuality() : { valid: false, score: 0, issues: [] }

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
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                    <div>
                        <Link href="/tests" className="text-blue-600 hover:underline text-lg">
                            ← Retour aux tests
                        </Link>
                        <h1 className="text-3xl font-bold text-gray-900 mt-2 flex items-center gap-3">
                            <span className="text-4xl">{testConfig.icon}</span>
                            {testConfig.title}
                            <span className="text-2xl font-normal text-gray-500">
                                / {testConfig.subtitle}
                            </span>
                        </h1>
                        {patient && (
                            <p className="text-xl text-gray-500 mt-1">
                                Patient: <span className="font-medium text-gray-700">{patient.name}</span>
                                <span className="ml-4 text-base text-gray-400">ID: {patient.id}</span>
                            </p>
                        )}
                    </div>
                    <div className="flex items-center gap-4">
                        <span className="text-3xl font-mono font-bold text-blue-600">
                            ⏱️ {formatTime(time)}
                        </span>
                        <span className="text-xl text-gray-400">/ {formatTime(testConfig.duration)}</span>
                    </div>
                </div>

                {/* Layout principal : 3 colonnes */}
                <div className="grid grid-cols-1 lg:grid-cols-6 gap-6">
                    
                    {/* Colonne 1 : Contrôles */}
                    <div className="lg:col-span-1 space-y-6">
                        <div className="bg-white border-4 border-gray-200 rounded-3xl p-8 shadow-xl min-h-[300px] flex flex-col justify-center">
                            <div className="text-center mb-6">
                                <div className="text-7xl font-bold text-blue-600 font-mono">
                                    {formatTime(time)}
                                </div>
                                <div className="text-2xl text-gray-500 mt-2">
                                    / {formatTime(testConfig.duration)}
                                </div>
                            </div>

                            {isComplete ? (
                                <div className="space-y-4">
                                    <div className="text-center text-2xl font-bold text-green-600">
                                        ✅ Terminé !
                                    </div>
                                    
                                    {processMessage && (
                                        <div className={`p-3 rounded-xl text-center text-lg font-medium ${
                                            processMessage.includes('✅') ? 'bg-green-100 text-green-700' : 
                                            processMessage.includes('❌') ? 'bg-red-100 text-red-700' : 
                                            'bg-blue-100 text-blue-700'
                                        }`}>
                                            {processMessage}
                                        </div>
                                    )}

                                    {isProcessing && (
                                        <div className="text-center text-blue-600 font-medium">
                                            ⏳ Traitement en cours...
                                        </div>
                                    )}

                                    <button
                                        onClick={handleRetry}
                                        className="w-full py-6 bg-amber-500 text-white text-2xl font-bold rounded-2xl hover:bg-amber-600 transition"
                                    >
                                        🔄 Recommencer
                                    </button>

                                    {audioUrl && (
                                        <div className="space-y-2">
                                            <p className="text-sm font-medium text-gray-600">🎵 Audio original:</p>
                                            <audio controls className="w-full rounded-xl" src={audioUrl} />
                                        </div>
                                    )}

                                    {cleanedAudioUrl && (
                                        <div className="space-y-2">
                                            <p className="text-sm font-medium text-green-600">🎵 Audio nettoyé:</p>
                                            <audio controls className="w-full rounded-xl" src={cleanedAudioUrl} />
                                            {cleanedMetrics && (
                                                <div className="text-xs text-gray-500 grid grid-cols-2 gap-1 mt-1">
                                                    <span>SNR: {cleanedMetrics.snr_db?.toFixed(1) || '?'} dB</span>
                                                    <span>Réduction: {cleanedMetrics.noise_reduction?.toFixed(1) || '?'}%</span>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            onClick={() => downloadAudio(audioBlob, '_original')}
                                            className="py-4 bg-blue-600 text-white text-xl font-bold rounded-2xl hover:bg-blue-700 transition"
                                            disabled={!audioBlob}
                                        >
                                            💾 Original
                                        </button>
                                        <button
                                            onClick={() => {
                                                if (cleanedAudioUrl) {
                                                    fetch(cleanedAudioUrl)
                                                        .then(res => res.blob())
                                                        .then(blob => downloadAudio(blob, '_cleaned'))
                                                }
                                            }}
                                            className="py-4 bg-green-600 text-white text-xl font-bold rounded-2xl hover:bg-green-700 transition"
                                            disabled={!cleanedAudioUrl}
                                        >
                                            💾 Nettoyé
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            onClick={() => audioBlob && testAudioQuality(audioBlob)}
                                            className="py-4 bg-purple-600 text-white text-xl font-bold rounded-2xl hover:bg-purple-700 transition"
                                            disabled={!audioBlob}
                                        >
                                            🔬 Tester
                                        </button>
                                    </div>

                                    {/* Affichage de la qualité */}
                                    <div className="mt-4 p-4 bg-gray-50 rounded-xl">
                                        <div className="flex justify-between items-center">
                                            <span className="font-bold text-gray-700">Qualité audio:</span>
                                            <span className={`font-bold text-lg ${qualityResult.valid ? 'text-green-600' : 'text-amber-600'}`}>
                                                {qualityResult.valid ? '✅ Acceptable' : '⚠️ À améliorer'} ({qualityResult.score}%)
                                            </span>
                                        </div>
                                        {qualityResult.issues.length > 0 && (
                                            <div className="mt-2 text-sm text-amber-600">
                                                {qualityResult.issues.map((issue, i) => (
                                                    <div key={i}>• {issue}</div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : !isRecording ? (
                                <button
                                    onClick={startRecording}
                                    className="w-full py-8 bg-red-600 text-white text-5xl font-bold rounded-2xl hover:bg-red-700 transition shadow-xl"
                                >
                                    🔴 Démarrer
                                </button>
                            ) : (
                                <div className="space-y-4">
                                    <div className="text-center">
                                        <span className={`inline-block px-8 py-3 rounded-full text-2xl font-bold ${
                                            isPaused ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                                        }`}>
                                            🎙️ {isPaused ? 'Pause' : 'Enregistrement'}
                                        </span>
                                    </div>
                                    <div className="flex gap-4">
                                        <button
                                            onClick={togglePause}
                                            className="flex-1 py-6 bg-amber-500 text-white text-3xl font-bold rounded-2xl hover:bg-amber-600 transition"
                                        >
                                            {isPaused ? '▶️' : '⏸️'}
                                        </button>
                                        <button
                                            onClick={stopRecording}
                                            className="flex-1 py-6 bg-gray-600 text-white text-3xl font-bold rounded-2xl hover:bg-gray-700 transition"
                                        >
                                            ⏹️
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Alerte silence adaptée */}
                        {voiceMetrics.isSilent && voiceMetrics.silenceDuration > 3 && (
                            <div className="p-4 bg-amber-100 border-2 border-amber-300 rounded-2xl text-center">
                                <span className="text-amber-700 font-bold text-xl">
                                    🗣️ Silence prolongé
                                </span>
                                <p className="text-amber-600 text-lg">
                                    Le patient ne parle pas depuis {voiceMetrics.silenceDuration}s
                                </p>
                            </div>
                        )}

                        {/* Navigation */}
                        <div className="flex gap-4">
                            <button
                                onClick={() => router.push('/tests')}
                                className="flex-1 py-4 bg-gray-100 text-gray-700 text-xl font-bold rounded-2xl hover:bg-gray-200 transition"
                            >
                                ← Tests
                            </button>
                            <button
                                onClick={handleNextTest}
                                className="flex-1 py-4 bg-blue-600 text-white text-xl font-bold rounded-2xl hover:bg-blue-700 transition"
                            >
                                Suivant →
                            </button>
                        </div>
                    </div>

                    {/* Colonne 2 : Image */}
                    <div className="lg:col-span-4">
                        {testConfig.imagePath ? (
                            <div className="bg-white border-8 border-gray-200 rounded-3xl p-6 shadow-xl h-full flex items-center justify-center min-h-[500px]">
                                <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden bg-gray-100">
                                    <img
                                        src={testConfig.imagePath}
                                        alt={`${testConfig.title} - Test`}
                                        className="object-contain w-full h-full"
                                        onError={(e) => {
                                            const target = e.target as HTMLImageElement;
                                            target.style.display = 'none';
                                            const parent = target.parentElement;
                                            if (parent) {
                                                const fallback = document.createElement('div');
                                                fallback.className = 'flex flex-col items-center justify-center w-full h-full text-gray-400';
                                                fallback.innerHTML = `
                                                    <span class="text-8xl">${testConfig.icon}</span>
                                                    <span class="text-2xl mt-4">Image non disponible</span>
                                                    <span class="text-xl text-gray-300">Décrivez de mémoire</span>
                                                `;
                                                parent.appendChild(fallback);
                                            }
                                        }}
                                    />
                                </div>
                            </div>
                        ) : (
                            <div className="bg-white border-8 border-gray-200 rounded-3xl p-6 shadow-xl h-full flex items-center justify-center min-h-[500px]">
                                <div className="text-center text-gray-400">
                                    <span className="text-8xl block mb-4">{testConfig.icon}</span>
                                    <p className="text-3xl font-semibold text-gray-600">{testConfig.title}</p>
                                    <p className="text-xl text-gray-500 mt-2">{testConfig.description}</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Colonne 3 : Qualité voix avec seuils adaptés */}
                    <div className="lg:col-span-1 space-y-6">
                        <div className="bg-white border-4 border-gray-200 rounded-3xl p-8 shadow-xl min-h-[400px]">
                            <h3 className="text-2xl font-bold text-gray-700 mb-6 text-center">
                                🎤 Qualité
                            </h3>
                            <div className="space-y-6">
                                {/* Bruit */}
                                <div>
                                    <div className="flex justify-between items-center mb-3">
                                        <span className="text-xl font-bold text-gray-700">Bruit</span>
                                        <div className="flex items-center gap-3">
                                            <span className={`text-xl font-bold ${getStatusColor(voiceMetrics.noise.status)}`}>
                                                {voiceMetrics.noise.level}
                                            </span>
                                            <span className="text-2xl">{getStatusIcon(voiceMetrics.noise.status)}</span>
                                            <span className={`text-base font-bold px-4 py-1 rounded-full ${getStatusBg(voiceMetrics.noise.status)} ${getStatusColor(voiceMetrics.noise.status)}`}>
                                                {getStatusLabel(voiceMetrics.noise.status)}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="w-full h-8 bg-gray-200 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full ${getBarColor(voiceMetrics.noise.status)} rounded-full transition-all duration-1000`}
                                            style={{ width: `${voiceMetrics.noise.percentage}%` }}
                                        />
                                    </div>
                                    <div className="flex justify-between text-sm text-gray-400 mt-1">
                                        <span>0%</span>
                                        <span className="font-bold text-base">{voiceMetrics.noise.percentage}%</span>
                                        <span>100%</span>
                                    </div>
                                </div>

                                {/* Volume - SEUILS ADAPTÉS */}
                                <div>
                                    <div className="flex justify-between items-center mb-3">
                                        <span className="text-xl font-bold text-gray-700">Volume</span>
                                        <div className="flex items-center gap-3">
                                            <span className={`text-xl font-bold ${getStatusColor(voiceMetrics.volume.status)}`}>
                                                {voiceMetrics.volume.level}
                                            </span>
                                            <span className="text-2xl">{getStatusIcon(voiceMetrics.volume.status)}</span>
                                            <span className={`text-base font-bold px-4 py-1 rounded-full ${getStatusBg(voiceMetrics.volume.status)} ${getStatusColor(voiceMetrics.volume.status)}`}>
                                                {getStatusLabel(voiceMetrics.volume.status)}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="w-full h-8 bg-gray-200 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full ${getBarColor(voiceMetrics.volume.status)} rounded-full transition-all duration-1000`}
                                            style={{ width: `${voiceMetrics.volume.percentage}%` }}
                                        />
                                    </div>
                                    <div className="flex justify-between text-sm text-gray-400 mt-1">
                                        <span>0%</span>
                                        <span className="font-bold text-base">{voiceMetrics.volume.percentage}%</span>
                                        <span>100%</span>
                                    </div>
                                    <div className="text-xs text-gray-400 mt-1">
                                        💡 Seuils adaptés : 3% = silence, 6% = faible, 15% = bon
                                    </div>
                                </div>

                                {/* Clarté */}
                                <div>
                                    <div className="flex justify-between items-center mb-3">
                                        <span className="text-xl font-bold text-gray-700">Clarté</span>
                                        <div className="flex items-center gap-3">
                                            <span className={`text-xl font-bold ${getStatusColor(voiceMetrics.clarity.status)}`}>
                                                {voiceMetrics.clarity.level}
                                            </span>
                                            <span className="text-2xl">{getStatusIcon(voiceMetrics.clarity.status)}</span>
                                            <span className={`text-base font-bold px-4 py-1 rounded-full ${getStatusBg(voiceMetrics.clarity.status)} ${getStatusColor(voiceMetrics.clarity.status)}`}>
                                                {getStatusLabel(voiceMetrics.clarity.status)}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="w-full h-8 bg-gray-200 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full ${getBarColor(voiceMetrics.clarity.status)} rounded-full transition-all duration-1000`}
                                            style={{ width: `${voiceMetrics.clarity.percentage}%` }}
                                        />
                                    </div>
                                    <div className="flex justify-between text-sm text-gray-400 mt-1">
                                        <span>0%</span>
                                        <span className="font-bold text-base">{voiceMetrics.clarity.percentage}%</span>
                                        <span>100%</span>
                                    </div>
                                </div>

                                {/* Rythme */}
                                <div>
                                    <div className="flex justify-between items-center mb-3">
                                        <span className="text-xl font-bold text-gray-700">Rythme</span>
                                        <div className="flex items-center gap-3">
                                            <span className={`text-xl font-bold ${getStatusColor(voiceMetrics.rhythm.status)}`}>
                                                {voiceMetrics.rhythm.level}
                                            </span>
                                            <span className="text-2xl">{getStatusIcon(voiceMetrics.rhythm.status)}</span>
                                            <span className={`text-base font-bold px-4 py-1 rounded-full ${getStatusBg(voiceMetrics.rhythm.status)} ${getStatusColor(voiceMetrics.rhythm.status)}`}>
                                                {getStatusLabel(voiceMetrics.rhythm.status)}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="w-full h-8 bg-gray-200 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full ${getBarColor(voiceMetrics.rhythm.status)} rounded-full transition-all duration-1000`}
                                            style={{ width: `${voiceMetrics.rhythm.percentage}%` }}
                                        />
                                    </div>
                                    <div className="flex justify-between text-sm text-gray-400 mt-1">
                                        <span>0%</span>
                                        <span className="font-bold text-base">{voiceMetrics.rhythm.percentage}%</span>
                                        <span>100%</span>
                                    </div>
                                </div>

                                {/* Silence */}
                                <div>
                                    <div className="flex justify-between items-center mb-3">
                                        <span className="text-xl font-bold text-gray-700">Silence</span>
                                        <div className="flex items-center gap-3">
                                            <span className={`text-xl font-bold ${voiceMetrics.isSilent ? 'text-amber-500' : 'text-green-600'}`}>
                                                {voiceMetrics.isSilent ? `${voiceMetrics.silenceDuration}s` : '✅ OK'}
                                            </span>
                                            <span className="text-2xl">{voiceMetrics.isSilent ? '🔇' : '🗣️'}</span>
                                        </div>
                                    </div>
                                    <div className="w-full h-8 bg-gray-200 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full ${voiceMetrics.isSilent ? 'bg-amber-500' : 'bg-green-500'} rounded-full transition-all duration-1000`}
                                            style={{ width: `${Math.min(voiceMetrics.silenceDuration / 5 * 100, 100)}%` }}
                                        />
                                    </div>
                                    <div className="flex justify-between text-sm text-gray-400 mt-1">
                                        <span>0s</span>
                                        <span className="font-bold text-base">{voiceMetrics.silenceDuration}s</span>
                                        <span>5s+</span>
                                    </div>
                                    <div className="text-xs text-gray-400 mt-1">
                                        💡 Tolérance : 5s avant alerte (patients âgés)
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Liste des mots */}
                        {testConfig.showWordList && (
                            <div className="bg-white border-4 border-gray-200 rounded-3xl p-6 shadow-xl">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-xl font-bold text-gray-700">📝 Mots</h3>
                                    <span className="text-2xl text-blue-600 font-bold">{words.length}</span>
                                </div>
                                <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                                    {words.map((word, index) => (
                                        <span
                                            key={index}
                                            className="px-4 py-2 bg-blue-100 text-blue-800 rounded-full text-lg font-medium"
                                        >
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
                                            className="flex-1 min-w-[120px] px-4 py-2 border-2 border-blue-300 rounded-full focus:border-blue-500 focus:outline-none text-lg"
                                            autoFocus
                                        />
                                    )}
                                </div>
                                {words.length === 0 && !isRecording && (
                                    <p className="text-base text-gray-400 text-center">
                                        Commencez l'enregistrement
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <div className="mt-8">
                    <EthicsBanner />
                </div>
            </main>
        </>
    )
}