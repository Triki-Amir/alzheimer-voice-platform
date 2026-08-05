// app/api/upload/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData()
        const audio = formData.get('audio') as File
        const patientId = formData.get('patientId') as string
        const testType = formData.get('testType') as string

        if (!audio) {
            return NextResponse.json({ error: 'Aucun fichier audio' }, { status: 400 })
        }

        // Créer le dossier recordings s'il n'existe pas
        const recordingsDir = path.join(process.cwd(), 'public', 'recordings')
        await mkdir(recordingsDir, { recursive: true })

        // Générer un nom de fichier unique
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const filename = `${patientId}_${testType}_${timestamp}.webm`
        const filepath = path.join(recordingsDir, filename)

        // Sauvegarder le fichier
        const buffer = Buffer.from(await audio.arrayBuffer())
        await writeFile(filepath, buffer)

        return NextResponse.json({
            success: true,
            filename,
            path: `/recordings/${filename}`
        })

    } catch (error) {
        console.error('Erreur upload:', error)
        return NextResponse.json(
            { error: 'Erreur lors de la sauvegarde' },
            { status: 500 }
        )
    }
}