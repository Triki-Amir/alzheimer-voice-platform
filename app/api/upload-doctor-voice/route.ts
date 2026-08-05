// app/api/upload-doctor-voice/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir, readFile } from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData()
        const audio = formData.get('audio') as File
        const firstName = formData.get('firstName') as string
        const lastName = formData.get('lastName') as string
        const hospital = formData.get('hospital') as string

        if (!audio) {
            return NextResponse.json(
                { error: 'Aucun fichier audio' },
                { status: 400 }
            )
        }

        // Créer les dossiers
        const doctorsDir = path.join(process.cwd(), 'public', 'recordings', 'doctors')
        await mkdir(doctorsDir, { recursive: true })

        // Générer un ID unique
        const voiceId = `VOICE_${randomUUID().slice(0,8)}`
        const filename = `${voiceId}_${firstName}_${lastName}_reference.wav`
        const filepath = path.join(doctorsDir, filename)

        // Sauvegarder
        const buffer = Buffer.from(await audio.arrayBuffer())
        await writeFile(filepath, buffer)

        // Créer un fichier JSON avec les métadonnées
        const metadata = {
            voiceId,
            firstName,
            lastName,
            hospital,
            filename,
            createdAt: new Date().toISOString(),
            path: `/recordings/doctors/${filename}`
        }

        const metadataPath = path.join(doctorsDir, `${voiceId}_metadata.json`)
        await writeFile(metadataPath, JSON.stringify(metadata, null, 2))

        return NextResponse.json({
            success: true,
            voiceId,
            path: `/recordings/doctors/${filename}`,
            metadata
        })

    } catch (error) {
        console.error('Erreur:', error)
        return NextResponse.json(
            { error: 'Erreur lors de la sauvegarde' },
            { status: 500 }
        )
    }
}