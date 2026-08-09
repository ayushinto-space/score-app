import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
    try {
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            return NextResponse.json(
                { error: 'GEMINI_API_KEY is missing in .env.local' },
                { status: 500 }
            );
        }

        const formData = await req.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        }

        // Convert file to Base64
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const base64Data = buffer.toString('base64');

        // Automatically detect MIME type (handles PDFs and Images)
        let mimeType = file.type;
        if (!mimeType || mimeType === 'application/octet-stream') {
            mimeType = file.name.endsWith('.pdf') ? 'application/pdf' : 'image/png';
        }

        const genAI = new GoogleGenerativeAI(apiKey);

        const model = genAI.getGenerativeModel({
            model: 'gemini-3.5-flash',
            generationConfig: { responseMimeType: 'application/json' },
        });

        const prompt = `
      You are an expert exam parser. Read all pages of this document carefully and extract every multiple-choice question.
      
      Return a pure JSON array where each object strictly matches this format:
      [
        {
          "id": "q1",
          "section": "Physics", 
          "question": "Use LaTeX formatting for any equations, like $\\\\int x dx$",
          "options": ["Option A text", "Option B text", "Option C text", "Option D text"],
          "correctOptionIndex": 0, 
          "explanation": "Brief explanation if available, otherwise empty string."
        }
      ]
      
      Rules:
      1. Scan through ALL pages of the PDF/Document sequentially.
      2. Convert all mathematical notation, formulas, and fractions to raw LaTeX enclosed in single dollar signs (e.g., $x^2 + y^2 = r^2$).
      3. Set correctOptionIndex to an integer (0 for A, 1 for B, 2 for C, 3 for D). If answer key is at the end of the document, use it to match the correct index.
    `;

        const result = await model.generateContent([
            prompt,
            {
                inlineData: {
                    data: base64Data,
                    mimeType: mimeType,
                },
            },
        ]);

        const jsonText = result.response.text();
        const parsedData = JSON.parse(jsonText);

        return NextResponse.json({ success: true, questions: parsedData });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}