// app/api/doctors/route.ts
import { NextResponse } from 'next/server'
import { readdir, readFile } from 'fs/promises'
import path from 'path'

export async function GET() {
    try {
        const doctorsDir = path.join(process.cwd(), 'public', 'recordings', 'doctors')
        
        const files = await readdir(doctorsDir)
        const metadataFiles = files.filter(f => f.endsWith('_metadata.json'))
        
        const doctors = []
        for (const file of metadataFiles) {
            const content = await readFile(path.join(doctorsDir, file), 'utf-8')
            doctors.push(JSON.parse(content))
        }
        
        return NextResponse.json({ success: true, doctors })
    } catch (error) {
        return NextResponse.json(
            { error: 'Erreur lors de la récupération' },
            { status: 500 }
        )
    }
}