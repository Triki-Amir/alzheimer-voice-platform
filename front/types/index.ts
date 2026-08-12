export interface User {
    id: string         
    email: string
    name: string
    role: 'admin' | 'doctor' | 'researcher'
    hospital?: string       
    voiceReferenceId?: string  
}

export interface DoctorVoiceReference {
    voiceId: string
    firstName: string
    lastName: string
    hospital: string
    filename: string
    path: string
    createdAt: string
}
// types/index.ts - Ajouter

export interface TestDetail {
    testId: TestType
    testName: string
    date: string
    duration: number
    score: number
    quality: 'excellent' | 'good' | 'poor'
    diagnosis?: 'control' | 'mci' | 'ad'
    confidence?: number
    // Détails spécifiques
    transcript?: string
    words?: string[]
    wordCount?: number
    speechRate?: number // mots par minute
    fillerWords?: number
    repetitions?: number
    accuracy?: number
    timeToFirstWord?: number
    pausePatterns?: {
        totalPauses: number
        avgPauseDuration: number
    }
    features?: {
        lexicalRichness: number
        syntacticComplexity: number
        responseTime: number
    }
}

export interface TestDetailPageProps {
    patientId: string
    testId: TestType
}
export interface ReportSummary {
    patientId: string
    patientName: string
    patientInitials: string
    patientColor: string
    date: string
    diagnosis: 'control' | 'mci' | 'ad'
    confidence: number
    testsCompleted: number
    totalTests: number
}
// types/index.ts

export interface PatientFormData {
    firstName: string
    lastName: string
    birthDate: string
    dmiId: string         
    gender: 'Homme' | 'Femme'
    phone: string
}

export interface Patient {
    id: string
    name: string
    initials: string
    age: number
    phone?: string
    birthDate: string
    dmiId: string 
    gender?: 'Homme' | 'Femme'
    address?: string
    lastSession: string
    color: string
    createdAt?: string
}
export type TestType = 
    | 'cookie_theft' 
    | 'fluency' 
    | 'recall' 
    | 'sentence'
    | 'naming'        
    | 'repetition'      
    | 'comprehension'    
    | 'spontaneous'

export interface Test {
    id: TestType
    name: string
    icon: string
    description: string
    duration: string
    status: 'pending' | 'in_progress' | 'completed'
    category?: 'langage' | 'mémoire' | 'attention' | 'executif' | 'comprehension'
    instructions?: string[]
    imagePath?: string
    showWordList?: boolean
    maxWords?: number
}

// ===================== RAPPORT PATIENT =====================
export interface TestResult {
    testId: TestType
    testName: string
    date: string
    duration: number 
    score: number 
    quality: 'excellent' | 'good' | 'poor'
    diagnosis?: 'control' | 'mci' | 'ad'
    confidence?: number
}

export interface Recording {
    id: string
    patientId: string
    testType: TestType
    duration: number // en secondes
    quality: 'excellent' | 'good' | 'poor'
    noiseLevel: 'low' | 'medium' | 'high'
    timestamp: Date
    fileUrl?: string
}

export type Diagnosis = 'control' | 'mci' | 'ad'

export interface Result {
    patientId: string
    diagnosis: Diagnosis
    confidence: number // 0-1
    features: {
        lexicalRichness: number
        syntacticComplexity: number
        responseTime: number
        jitter: number
        pauseFrequency: number
    }
}
export interface ApiResponse<T> {
    success: boolean
    data: T
    error?: string
}

export interface PatientReport {
    patientId: string
    patientName: string
    lastSession: string
    totalTests: number
    completedTests: number
    overallScore?: number // 0-100
    diagnosis?: 'control' | 'mci' | 'ad'
    confidence?: number
    tests: TestResult[]
}

export interface TestResult {
    testId: TestType
    testName: string
    date: string
    duration: number // secondes
    score: number // 0-100
    quality: 'excellent' | 'good' | 'poor'
    diagnosis?: 'control' | 'mci' | 'ad'
    confidence?: number
    features?: {
        lexicalRichness: number
        syntacticComplexity: number
        responseTime: number
    }
}

// types/index.ts

export type PracticeType = 'hospital' | 'clinic' | 'cabinet' | 'other'

export interface DoctorRegistrationData {
    firstName: string
    lastName: string
    email: string
    password: string
    practiceType: PracticeType  
    hospital: string
    hospitalOther?: string
    clinicName?: string
    clinicAddress?: string
    phone?: string
}

export interface Doctor extends DoctorRegistrationData {
    id: string
    voiceReferenceId?: string
    voiceReferenceUrl?: string
    isVerified: boolean
    createdAt: string
}
