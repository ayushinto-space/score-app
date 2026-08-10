import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Data = buffer.toString('base64');
    const mimeType = file.type || 'application/pdf';

    // Using gemini-2.5-flash with expanded maxOutputTokens to prevent truncation on large PDFs
    const model = genAI.getGenerativeModel({
      model: 'gemini-3.5-flash-lite',
      generationConfig: {
        responseMimeType: 'application/json',
        maxOutputTokens: 8192, // Maximum output length to capture all questions
        temperature: 0.1,
      },
    });

    const prompt = `Thoroughly analyze this entire uploaded test document (PDF or Image) from start to finish. Extract ALL questions present in the document into a strict JSON format. Do not skip any questions or pages.
    Support all question types: 'mcq', 'multiple_correct', 'integer', 'fill_blank'.
    Master LaTeX formatting: use inline math like $...$ and block math like $$...$$ for any mathematical expressions, formulas, or symbols.
    Return ONLY a valid JSON object matching this exact schema:
    {
      "questions": [
        {
          "id": "string",
          "type": "mcq" | "multiple_correct" | "integer" | "fill_blank",
          "section": "string",
          "question": "string containing LaTeX",
          "options": ["string"] (optional, omit for integer/fill_blank),
          "correctOptionIndex": number (required if type is mcq),
          "correctOptionIndexes": [number] (required if type is multiple_correct),
          "correctAnswer": "string or number" (required if type is integer or fill_blank),
          "explanation": "string containing LaTeX"
        }
      ]
    }`;

    const result = await model.generateContent([
      {
        inlineData: {
          data: base64Data,
          mimeType: mimeType,
        },
      },
      prompt,
    ]);

    const responseText = result.response.text();
    if (!responseText) {
      throw new Error('No valid response generated from the model.');
    }

    const parsedResult = JSON.parse(responseText);
    return NextResponse.json(parsedResult);

  } catch (error: any) {
    console.error('Gemini SDK parsing error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process document parsing.' },
      { status: 500 }
    );
  }
}