import type { Patient, Test, User, PatientReport, TestResult } from '@/types'

export const mockUser: User = {
    email: 'dr.mabouda@ehb.tn',
    name: 'Dr. Maher Abouda',
    role: 'doctor'
}

export const mockPatients: Patient[] = [
    {
        id: 'PAT_000123',
        name: 'Slim Selmi',
        initials: 'SS',
        age: 70,
        birthDate: '12/05/1954',
        phone: '+216 24541135',
        gender: 'Homme',
        lastSession: '05/07/2026',
        color: '#2563EB'
    },
    {
        id: 'PAT_000124',
        name: 'Khalil Hedili',
        initials: 'KH',
        age: 66,
        birthDate: '23/02/1960',
        phone: '+216 23456789',
        gender: 'Homme',
        lastSession: '01/07/2026',
        color: '#10B981'
    },
    {
        id: 'PAT_000125',
        name: 'Amir Triki',
        initials: 'AT',
        age: 67,
        birthDate: '08/11/1958',
        phone: '+216 98765432',
        gender: 'Homme',
        lastSession: '28/06/2026',
        color: '#F59E0B'
    }
]

export const mockTests: Test[] = [
    // === Tests existants (4) ===
    {
        id: 'cookie_theft',
        name: 'Récit d\'image',
        icon: '🖼️',
        description: 'Décrivez l\'image en détail avec vos propres mots',
        duration: '~2-3 min',
        status: 'pending',
        category: 'langage',
        instructions: [
            'Observez attentivement l\'image',
            'Décrivez-la en détail avec vos propres mots',
            'Parlez à voix haute, de manière claire et complète',
            'Décrivez les personnages, les actions et les objets'
        ],
        imagePath: '/images/cookie-theft.jpg'
    },
    {
        id: 'fluency',
        name: 'Fluence verbale',
        icon: '🗣️',
        description: 'Citez le plus d\'animaux possible en 1 minute',
        duration: '~1 min',
        status: 'pending',
        category: 'langage',
        instructions: [
            'Je vais vous dire une catégorie : "les animaux"',
            'Pendant 1 minute, dites-moi le plus d\'animaux possible',
            'Chaque animal doit être différent'
        ],
        showWordList: true,
        maxWords: 20
    },
    {
        id: 'recall',
        name: 'Rappel d\'informations',
        icon: '📝',
        description: 'Rappelez et restituez les informations données',
        duration: '~2-3 min',
        status: 'pending',
        category: 'mémoire',
        instructions: [
            'Vous allez entendre un court texte',
            'Écoutez-le attentivement',
            'Quand le texte sera terminé, rappelez le plus d\'informations possible'
        ],
        showWordList: true
    },
    {
        id: 'sentence',
        name: 'Construction de phrases',
        icon: '✏️',
        description: 'Construisez des phrases complexes',
        duration: '~1-2 min',
        status: 'pending',
        category: 'langage',
        instructions: [
            'Je vais vous donner des mots',
            'Construisez une phrase complète avec ces mots',
            'Essayez de faire des phrases complexes'
        ]
    },

    // === NOUVEAUX TESTS (4) ===
    {
        id: 'naming',
        name: 'Nomination d\'objets',
        icon: '🔍',
        description: 'Nommez les objets que vous voyez sur les images',
        duration: '~2-3 min',
        status: 'pending',
        category: 'langage',
        instructions: [
            'Je vais vous montrer des images une par une',
            'Nommez chaque objet que vous voyez',
            'Prenez votre temps, il n\'y a pas de limite de temps'
        ],
        imagePath: '/images/naming-objects.jpg'
    },
    {
        id: 'repetition',
        name: 'Répétition de phrases',
        icon: '🔊',
        description: 'Répétez les phrases que vous allez entendre',
        duration: '~1-2 min',
        status: 'pending',
        category: 'langage',
        instructions: [
            'Je vais vous lire des phrases',
            'Répétez chaque phrase exactement comme vous l\'avez entendue',
            'Commencez par les phrases courtes, puis les plus longues'
        ],
        showWordList: true
    },
    {
        id: 'comprehension',
        name: 'Compréhension',
        icon: '🧠',
        description: 'Répondez aux questions sur le texte que vous avez entendu',
        duration: '~2-3 min',
        status: 'pending',
        category: 'comprehension',
        instructions: [
            'Vous allez entendre un court texte',
            'Écoutez-le attentivement',
            'Puis répondez aux questions sur ce que vous avez compris'
        ]
    },
    {
        id: 'spontaneous',
        name: 'Discours spontané',
        icon: '💬',
        description: 'Parlez librement sur un sujet proposé',
        duration: '~3-5 min',
        status: 'pending',
        category: 'langage',
        instructions: [
            'Je vais vous proposer un sujet',
            'Parlez-en librement pendant quelques minutes',
            'Raccontez ce qui vous vient à l\'esprit',
            'Il n\'y a pas de bonne ou mauvaise réponse'
        ]
    }
]

// ===================== RAPPORTS MOCKÉS =====================
export const mockTestResults: TestResult[] = [
    {
        testId: 'cookie_theft',
        testName: 'Récit d\'image',
        date: '05/07/2026',
        duration: 168,
        score: 82,
        quality: 'good',
        diagnosis: 'mci',
        confidence: 0.78
    },
    {
        testId: 'fluency',
        testName: 'Fluence verbale',
        date: '05/07/2026',
        duration: 62,
        score: 65,
        quality: 'excellent',
        diagnosis: 'mci',
        confidence: 0.85
    },
    {
        testId: 'recall',
        testName: 'Rappel d\'informations',
        date: '01/07/2026',
        duration: 145,
        score: 45,
        quality: 'poor',
        diagnosis: 'ad',
        confidence: 0.72
    },
    {
        testId: 'sentence',
        testName: 'Construction de phrases',
        date: '01/07/2026',
        duration: 95,
        score: 55,
        quality: 'good',
        diagnosis: 'mci',
        confidence: 0.69
    },
    // Nouveaux tests (non complétés)
    {
        testId: 'naming',
        testName: 'Nomination d\'objets',
        date: '24/07/2026',
        duration: 0,
        score: 0,
        quality: 'poor'
    },
    {
        testId: 'repetition',
        testName: 'Répétition de phrases',
        date: '24/07/2026',
        duration: 0,
        score: 0,
        quality: 'poor'
    },
    {
        testId: 'comprehension',
        testName: 'Compréhension',
        date: '24/07/2026',
        duration: 0,
        score: 0,
        quality: 'poor'
    },
    {
        testId: 'spontaneous',
        testName: 'Discours spontané',
        date: '24/07/2026',
        duration: 0,
        score: 0,
        quality: 'poor'
    }
]

export const mockPatientReports: Record<string, PatientReport> = {
    'PAT_000123': {
        patientId: 'PAT_000123',
        patientName: 'Slim Selmi',
        lastSession: '05/07/2026',
        totalTests: 8,
        completedTests: 4,
        overallScore: 78,
        diagnosis: 'mci',
        confidence: 0.82,
        tests: mockTestResults
    },
    'PAT_000124': {
        patientId: 'PAT_000124',
        patientName: 'Khalil Hedili',
        lastSession: '01/07/2026',
        totalTests: 8,
        completedTests: 3,
        overallScore: 92,
        diagnosis: 'control',
        confidence: 0.95,
        tests: mockTestResults.map(t => ({ ...t, diagnosis: 'control' as const, score: Math.min(100, t.score + 30) }))
    },
    'PAT_000125': {
        patientId: 'PAT_000125',
        patientName: 'Amir Triki',
        lastSession: '28/06/2026',
        totalTests: 8,
        completedTests: 1,
        overallScore: 55,
        diagnosis: 'ad',
        confidence: 0.88,
        tests: mockTestResults.map(t => ({ ...t, diagnosis: 'ad' as const, score: Math.max(20, t.score - 25) }))
    }
}

